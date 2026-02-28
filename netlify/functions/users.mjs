
import { ok, bad, getUsersStore } from "./_common.mjs";
export default async (event)=>{
  if (event.httpMethod!=="GET") return bad("Method not allowed",405);
  const { users } = await getUsersStore();
  return ok(users);
};
