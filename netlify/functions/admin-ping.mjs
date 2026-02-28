
import { ok, bad, requireAdmin } from "./_common.mjs";

export default async (request) => {
  const a = requireAdmin(request);
  if (!a.ok) return bad(a.error, 401);
  return ok({ ok: true });
};
