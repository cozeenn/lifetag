(function () {
  const CONFIG_KEY = "lifetag_supabase_config";
  const QUEUE_KEY = "lifetag_sync_queue";
  const DEFAULT_CONFIG = {
    url: "https://djcylgxxrgzpymlfgeau.supabase.co",
    anonKey: "sb_publishable_P3AQaiIpw-VnLb5xpR7nuw_Kt91DVrj"
  };
  let client = null;
  let user = null;
  let syncPromise = null;

  function config() { try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || DEFAULT_CONFIG; } catch { return DEFAULT_CONFIG; } }
  function configured() { const value = config(); return Boolean(value.url && value.anonKey && window.supabase); }
  function setStatus(state) {
    document.documentElement.dataset.cloud = state;
    const labels = { online:"Cloud synced", syncing:"Syncing…", local:"Offline/local", queued:"Changes queued", error:"Cloud connection error", "signed-out":"Sign in to sync" };
    document.querySelectorAll("[data-cloud-status]").forEach(element => { element.textContent = labels[state] || state; });
  }

  async function init() {
    if (client) return;
    if (!configured()) { setStatus("local"); return; }
    const connection = config();
    client = window.supabase.createClient(connection.url, connection.anonKey, { auth:{persistSession:true, autoRefreshToken:true} });
    const { data, error } = await client.auth.getSession();
    if (error) { localStorage.setItem("lifetag_sync_error", error.message); setStatus("error"); return; }
    user = data.session?.user || null;
    client.auth.onAuthStateChange((_event, session) => { user = session?.user || null; setStatus(user ? "online" : "signed-out"); });
    if (!user) { setStatus("signed-out"); return; }
    try { await pull(); await flush(); } catch (error) { console.error("LifeTag startup sync", error); }
  }

  function enqueue(kind, payload) {
    const queue = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    queue.push({ id:crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, kind, payload, at:new Date().toISOString() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    setStatus(navigator.onLine ? "syncing" : "queued");
    flush().catch(() => {});
  }

  async function pushProfiles() {
    if (!user) throw new Error("No authenticated Supabase session.");
    const profiles = JSON.parse(localStorage.getItem("lifetag_profiles_v3") || "[]");
    if (!profiles.length) return 0;
    const rows = profiles.map(profile => ({ id:profile.id, owner_id:user.id, data:profile, updated_at:profile.updatedAt || new Date().toISOString() }));
    const { data, error } = await client.from("health_profiles").upsert(rows, {onConflict:"id"}).select("id");
    if (error) throw error;
    return data?.length || 0;
  }

  async function pushCare() {
    if (!user) throw new Error("No authenticated Supabase session.");
    const care = JSON.parse(localStorage.getItem("lifetag_care_v1") || "{}");
    const typeMap = { medications:"medication", appointments:"appointment", timeline:"timeline", vitals:"vital", plans:"action_plan", caregivers:"caregiver" };
    const rows = [];
    Object.entries(care).forEach(([profileId, group]) => Object.entries(typeMap).forEach(([key, type]) => (group[key] || []).forEach(item => rows.push({ profile_id:profileId, owner_id:user.id, record_type:type, client_id:item.id, data:item, occurred_at:item.date || item.createdAt || null }))));
    if (!rows.length) return 0;
    const { data, error } = await client.from("care_records").upsert(rows, {onConflict:"profile_id,record_type,client_id"}).select("id");
    if (error) throw error;
    return data?.length || 0;
  }

  async function flush() {
    if (syncPromise) return syncPromise;
    if (!client) throw new Error("Cloud client is not initialized.");
    if (!user) throw new Error("Sign in before synchronizing.");
    if (!navigator.onLine) throw new Error("This device is offline.");
    syncPromise = (async () => {
      setStatus("syncing");
      try {
        const result = { profiles:await pushProfiles(), care:await pushCare() };
        localStorage.removeItem(QUEUE_KEY);
        localStorage.removeItem("lifetag_sync_error");
        localStorage.setItem("lifetag_last_sync", JSON.stringify({...result, at:new Date().toISOString()}));
        setStatus("online");
        return result;
      } catch (error) {
        localStorage.setItem("lifetag_sync_error", error?.message || String(error));
        setStatus("error");
        throw error;
      } finally { syncPromise = null; }
    })();
    return syncPromise;
  }

  async function pull() {
    if (!client || !user) return {profiles:0, care:0};
    const [profileResult, recordResult] = await Promise.all([
      client.from("health_profiles").select("data").is("deleted_at", null),
      client.from("care_records").select("profile_id,record_type,data").is("deleted_at", null)
    ]);
    if (profileResult.error) throw profileResult.error;
    if (recordResult.error) throw recordResult.error;
    const local = JSON.parse(localStorage.getItem("lifetag_profiles_v3") || "[]");
    const merged = new Map(local.map(profile => [profile.id, profile]));
    (profileResult.data || []).forEach(row => merged.set(row.data.id, row.data));
    localStorage.setItem("lifetag_profiles_v3", JSON.stringify([...merged.values()]));
    const care = JSON.parse(localStorage.getItem("lifetag_care_v1") || "{}");
    const reverse = { medication:"medications", appointment:"appointments", timeline:"timeline", vital:"vitals", action_plan:"plans", caregiver:"caregivers" };
    (recordResult.data || []).forEach(row => {
      care[row.profile_id] ||= {medications:[],appointments:[],timeline:[],documents:[],vitals:[],plans:[],caregivers:[]};
      const key = reverse[row.record_type];
      if (key && !care[row.profile_id][key].some(item => item.id === row.data.id)) care[row.profile_id][key].push(row.data);
    });
    localStorage.setItem("lifetag_care_v1", JSON.stringify(care));
    return {profiles:profileResult.data?.length || 0, care:recordResult.data?.length || 0};
  }

  async function uploadDocument(profileId, file, title) {
    if (!client || !user) throw new Error("Sign in to use secure document storage.");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/${profileId}/${crypto.randomUUID()}-${safeName}`;
    const upload = await client.storage.from("health-documents").upload(path, file);
    if (upload.error) throw upload.error;
    const metadata = await client.from("health_documents").insert({profile_id:profileId,owner_id:user.id,title,storage_path:path,mime_type:file.type,size_bytes:file.size});
    if (metadata.error) throw metadata.error;
    return path;
  }

  async function audit(action, profileId, metadata={}) { if (client && user) await client.from("audit_events").insert({actor_id:user.id,profile_id:profileId,action,metadata}); }
  window.LifeTagCloud = { init, configured, config, user:()=>user, client:()=>client, enqueue, flush, pull, uploadDocument, audit,
    setConfig(value) { localStorage.setItem(CONFIG_KEY, JSON.stringify(value)); location.reload(); },
    clearConfig() { localStorage.removeItem(CONFIG_KEY); location.reload(); }
  };
  window.addEventListener("online", () => flush().catch(() => {}));
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once:true}); else init();
})();
