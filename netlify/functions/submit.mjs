
import { getStore } from "@netlify/blobs";
import { ok, bad, STORE_NAME } from "./_common.mjs";

export default async (request) => {
  if (request.method !== "POST") return bad("Method not allowed", 405);

  try{
    const form = await request.formData();

    const weekStartISO = String(form.get("weekStartISO") || "").trim();
    const enterpriseId = String(form.get("enterpriseId") || "").trim();
    if (!weekStartISO || !enterpriseId) return bad("Missing weekStartISO or enterpriseId", 400);

    const proof = form.get("proof");
    if (!(proof instanceof File)) return bad("Missing proof file", 400);

    const store = getStore(STORE_NAME);

    const proofKey = `proof:${weekStartISO}:${enterpriseId}`;
    const buf = Buffer.from(await proof.arrayBuffer());
    await store.set(proofKey, buf, {
      metadata: {
        filename: proof.name,
        mimeType: proof.type || "application/octet-stream",
        uploadedAt: new Date().toISOString()
      }
    });

    const payload = {
      weekStartISO,
      enterpriseId,
      name: String(form.get("name") || ""),
      shoreType: String(form.get("shoreType") || ""),
      teamName: String(form.get("teamName") || ""),
      cto: JSON.parse(String(form.get("cto") || "[]")),
      project: JSON.parse(String(form.get("project") || "[]")),
      dailyTotal: JSON.parse(String(form.get("dailyTotal") || "[]")),
      proofName: proof.name,
      submittedAtISO: new Date().toISOString()
    };

    const subKey = `sub:${weekStartISO}:${enterpriseId}`;
    await store.set(subKey, JSON.stringify(payload), { metadata: { submittedAtISO: payload.submittedAtISO } });

    return ok({ saved: true });
  }catch(e){
    return bad(e?.message || String(e), 400);
  }
};
