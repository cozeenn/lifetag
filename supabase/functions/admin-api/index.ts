import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const headers={"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return respond({ok:true});
  const authorization=req.headers.get("authorization");if(!authorization?.startsWith("Bearer "))return respond({error:"Authentication required."},401);
  const admin=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt=authorization.slice(7),userResult=await admin.auth.getUser(jwt),actor=userResult.data.user;if(userResult.error||!actor)return respond({error:"Invalid or expired session."},401);
  const {data:assignment}=await admin.from("admin_users").select("role,active").eq("user_id",actor.id).eq("active",true).maybeSingle();if(!assignment)return respond({error:"This account has no active administrator assignment."},403);
  let body;try{body=await req.json();}catch{return respond({error:"Invalid request."},400);}
  if(body.action==="dashboard"){
    const [usersResult,profilesResult,notificationsResult,documentsResult,auditResult]=await Promise.all([
      admin.auth.admin.listUsers({page:1,perPage:1000}),admin.from("health_profiles").select("id",{count:"exact",head:true}).is("deleted_at",null),
      admin.from("notification_jobs").select("id",{count:"exact",head:true}).is("delivered_at",null),admin.from("health_documents").select("id",{count:"exact",head:true}),
      admin.from("audit_events").select("id,actor_id,action,metadata,created_at").order("created_at",{ascending:false}).limit(100)
    ]);
    if(usersResult.error)return respond({error:usersResult.error.message},500);
    const users=usersResult.data.users,emails=new Map(users.map(u=>[u.id,u.email]));
    return respond({admin:{email:actor.email,role:assignment.role},metrics:{users:users.length,profiles:profilesResult.count||0,notifications:notificationsResult.count||0,documents:documentsResult.count||0},users:users.map(u=>({id:u.id,email:u.email,created_at:u.created_at,last_sign_in_at:u.last_sign_in_at,banned_until:u.banned_until})),audit:(auditResult.data||[]).map(e=>({...e,actor_email:emails.get(e.actor_id)||null})),health:[{label:"Database access operational",ok:!profilesResult.error},{label:"Notification queue operational",ok:!notificationsResult.error},{label:"Document metadata operational",ok:!documentsResult.error},{label:"Audit logging operational",ok:!auditResult.error}]});
  }
  if(body.action==="account_action"){
    if(!["system_admin","organization_admin"].includes(assignment.role))return respond({error:"Your role cannot manage accounts."},403);
    if(!["suspend","restore"].includes(body.operation)||!body.userId)return respond({error:"Invalid account action."},400);
    if(typeof body.reason!=="string"||body.reason.trim().length<10)return respond({error:"An audit reason of at least 10 characters is required."},400);
    if(body.userId===actor.id&&body.operation==="suspend")return respond({error:"You cannot suspend your own administrator account."},400);
    const update=await admin.auth.admin.updateUserById(body.userId,{ban_duration:body.operation==="suspend"?"876000h":"none"});if(update.error)return respond({error:update.error.message},400);
    await admin.from("audit_events").insert({actor_id:actor.id,action:`admin.account.${body.operation}`,object_type:"auth_user",object_id:body.userId,metadata:{reason:body.reason.trim(),admin_role:assignment.role}});
    return respond({ok:true});
  }
  return respond({error:"Unknown action."},400);
});
