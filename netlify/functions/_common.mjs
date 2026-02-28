
import { getStore } from "@netlify/blobs";
import fs from "node:fs";
import path from "node:path";

export const STORE_NAME = "timesheet";

export function j(obj, status=200, headers={}){
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type":"application/json; charset=utf-8", ...headers }
  });
}
export const ok = (obj)=>j(obj,200);
export const bad = (msg, status=400)=>j({ error: msg }, status);

export function requireAdmin(request){
  const supplied = request.headers.get("x-admin-password") || "";
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected) return { ok:false, error:"ADMIN_PASSWORD not configured on Netlify." };
  if (supplied !== expected) return { ok:false, error:"Unauthorized (bad admin password)." };
  return { ok:true };
}

export async function getUsersStore(){
  const store = getStore(STORE_NAME);
  let users = await store.get("users", { type:"json" });

  if (!Array.isArray(users) || users.length === 0){
    // seed from data/seed-users.json
    try{
      const seedPath = path.join(process.cwd(), "data", "seed-users.json");
      if (fs.existsSync(seedPath)){
        const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
        if (Array.isArray(seed)) users = seed;
      }
    }catch(_){}

    users = Array.isArray(users) ? users : [];
    await store.set("users", JSON.stringify(users), {
      metadata: { seededAt: new Date().toISOString() }
    });
  }

  return { store, users };
}

export function normalizeUser(u){
  return {
    EnterpriseID: String(u?.EnterpriseID || "").trim(),
    Name: String(u?.Name || "").trim(),
    ShoreType: String(u?.ShoreType || "").trim(),
    TeamName: String(u?.TeamName || "").trim()
  };
}
export function validateUser(u){
  if (!u.EnterpriseID) throw new Error("EnterpriseID is required");
  if (!u.Name) throw new Error("Name is required");
  if (!u.ShoreType) throw new Error("ShoreType is required");
  if (!u.TeamName) throw new Error("TeamName is required");
}
