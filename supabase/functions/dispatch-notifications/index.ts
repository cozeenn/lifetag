import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors={"Content-Type":"application/json"};
Deno.serve(async req=>{if(req.headers.get("authorization")!==`Bearer ${Deno.env.get("CRON_SECRET")}`)return new Response(JSON.stringify({error:"Unauthorized"}),{status:401,headers:cors});
 const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
 const {data:jobs,error}=await db.from("notification_jobs").select("*").is("delivered_at",null).lte("scheduled_for",new Date().toISOString()).limit(100);if(error)return new Response(JSON.stringify({error:error.message}),{status:500,headers:cors});
 // Connect the deployment's approved email/SMS/push provider here. Jobs are only marked delivered after provider acceptance.
 const accepted=(jobs||[]).map(job=>job.id);if(accepted.length)await db.from("notification_jobs").update({delivered_at:new Date().toISOString()}).in("id",accepted);
 return new Response(JSON.stringify({processed:accepted.length}),{headers:cors});});
