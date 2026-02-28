
import { ok, bad, requireAdmin, getUsersStore, normalizeUser, validateUser } from "./_common.mjs";

export default async (request) => {
  const a = requireAdmin(request);
  if (!a.ok) return bad(a.error, 401);

  const { store, users } = await getUsersStore();

  if (request.method === "GET") return ok(users);

  if (request.method === "POST"){
    try{
      const body = await request.json();
      const u = normalizeUser(body);
      validateUser(u);
      if (users.some(x => x.EnterpriseID === u.EnterpriseID)) return bad("EnterpriseID already exists", 409);
      users.push(u);
      await store.set("users", JSON.stringify(users), { metadata: { updatedAt: new Date().toISOString() } });
      return ok({ added: true });
    }catch(e){
      return bad(e?.message || String(e), 400);
    }
  }

  return bad("Method not allowed", 405);
};
