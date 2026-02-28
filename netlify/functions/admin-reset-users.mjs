
import fs from "node:fs";
import path from "node:path";
import { ok, bad, requireAdmin } from "./_common.mjs";
import { getStore } from "@netlify/blobs";
import { STORE_NAME } from "./_common.mjs";

export default async (request) => {
  const a = requireAdmin(request);
  if (!a.ok) return bad(a.error, 401);
  if (request.method !== "POST") return bad("Method not allowed", 405);

  const store = getStore(STORE_NAME);
  try{
    const seedPath = path.join(process.cwd(), "data", "seed-users.json");
    const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
    await store.set("users", JSON.stringify(seed), { metadata: { resetAt: new Date().toISOString() } });
    return ok({ reset: true, count: Array.isArray(seed) ? seed.length : 0 });
  }catch(e){
    return bad("Failed to reset users: " + (e?.message || String(e)), 500);
  }
};
