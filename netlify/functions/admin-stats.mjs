
import { getStore } from "@netlify/blobs";
import { ok, bad, requireAdmin, STORE_NAME } from "./_common.mjs";
export default async (event)=>{
  const a=requireAdmin(event);
  if(!a.ok) return bad(a.error,401);
  if (event.httpMethod!=="GET") return bad("Method not allowed",405);
  const weekStartISO = event.queryStringParameters?.weekStartISO || "";
  if (!weekStartISO) return bad("Missing weekStartISO",400);

  const store=getStore(STORE_NAME);
  const listed = await store.list({ prefix:`sub:${weekStartISO}:` });
  return ok({ submitted: listed.blobs?.length || 0 });
};
