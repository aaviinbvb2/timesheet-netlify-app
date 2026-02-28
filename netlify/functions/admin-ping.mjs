
import { ok, bad, requireAdmin } from "./_common.mjs";
export default async (event)=>{
  const a=requireAdmin(event);
  if(!a.ok) return bad(a.error,401);
  return ok({ok:true});
};
