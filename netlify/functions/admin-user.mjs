
import { ok, bad, requireAdmin, getUsersStore, normalizeUser, validateUser } from "./_common.mjs";

export default async (request) => {
  const a = requireAdmin(request);
  if (!a.ok) return bad(a.error, 401);

  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  if (!id) return bad("Missing id", 400);

  const { store, users } = await getUsersStore();
  const idx = users.findIndex(u => u.EnterpriseID === id);
  if (idx < 0) return bad("User not found", 404);

  if (request.method === "PUT"){
    try{
      const body = await request.json();
      const u = normalizeUser({ ...body, EnterpriseID: id });
      validateUser(u);
      users[idx] = u;
      await store.set("users", JSON.stringify(users), { metadata: { updatedAt: new Date().toISOString() } });
      return ok({ updated: true });
    }catch(e){
      return bad(e?.message || String(e), 400);
    }
  }

  if (request.method === "DELETE"){
    users.splice(idx, 1);
    await store.set("users", JSON.stringify(users), { metadata: { updatedAt: new Date().toISOString() } });
    return ok({ deleted: true });
  }

  return bad("Method not allowed", 405);
};
