
import { getStore } from "@netlify/blobs";
import { ok, bad, requireAdmin, getUsersStore, STORE_NAME } from "./_common.mjs";

export default async (request) => {
  const a = requireAdmin(request);
  if (!a.ok) return bad(a.error, 401);
  if (request.method !== "GET") return bad("Method not allowed", 405);

  const url = new URL(request.url);
  const weekStartISO = url.searchParams.get("weekStartISO") || "";
  const team = url.searchParams.get("team") || "";
  const enterpriseId = url.searchParams.get("enterpriseId") || "";
  if (!weekStartISO) return bad("Missing weekStartISO", 400);

  const { users } = await getUsersStore();
  const filtered = users.filter(u => {
    if (team && u.TeamName !== team) return false;
    if (enterpriseId && u.EnterpriseID !== enterpriseId) return false;
    return true;
  });

  const store = getStore(STORE_NAME);
  const listed = await store.list({ prefix: `sub:${weekStartISO}:` });
  const keys = new Set((listed?.blobs || []).map(b => b.key));

  const rows = [];
  for (const u of filtered){
    const key = `sub:${weekStartISO}:${u.EnterpriseID}`;
    if (keys.has(key)){
      const sub = await store.get(key, { type: "json" });
      rows.push({ ...sub, status: "Submitted" });
    } else {
      rows.push({
        weekStartISO,
        enterpriseId: u.EnterpriseID,
        name: u.Name,
        shoreType: u.ShoreType,
        teamName: u.TeamName,
        dailyTotal: [0,0,0,0,0,0,0],
        proofName: "",
        submittedAtISO: "",
        status: "Not Submitted"
      });
    }
  }

  rows.sort((a,b)=> a.status!==b.status ? (a.status==="Not Submitted"?-1:1) : String(a.enterpriseId).localeCompare(String(b.enterpriseId)));
  return ok(rows);
};
