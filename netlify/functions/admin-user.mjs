
import { ok, bad, requireAdmin, getUsersStore, normalizeUser, validateUser } from "./_common.mjs";
export default async (event)=>{
  const a=requireAdmin(event);
  if(!a.ok) return bad(a.error,401);

  const id = event.queryStringParameters?.id || "";
  if (!id) return bad("Missing id",400);

  const { store, users } = await getUsersStore();
  const idx = users.findIndex(u=>u.EnterpriseID===id);
  if (idx<0) return bad("User not found",404);

  if (event.httpMethod==="PUT"){
    try{
      const body=JSON.parse(event.body||"{}");
      const u=normalizeUser({ ...body, EnterpriseID:id });
      validateUser(u);
      users[idx]=u;
      await store.set("users", JSON.stringify(users), { metadata:{ updatedAt:new Date().toISOString() }});
      return ok({updated:true});
    }catch(e){
      return bad(e.message||String(e),400);
    }
  }

  if (event.httpMethod==="DELETE"){
    users.splice(idx,1);
    await store.set("users", JSON.stringify(users), { metadata:{ updatedAt:new Date().toISOString() }});
    return ok({deleted:true});
  }

  return bad("Method not allowed",405);
};
