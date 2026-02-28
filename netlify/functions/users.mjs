
import { ok, bad, getUsersStore } from "./_common.mjs";

export default async (request) => {
  if (request.method !== "GET") return bad("Method not allowed", 405);
  const { users } = await getUsersStore();
  return ok(users);
};
