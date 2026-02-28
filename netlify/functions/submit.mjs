
import { getStore } from "@netlify/blobs";
import Busboy from "busboy";
import { ok, bad, STORE_NAME } from "./_common.mjs";

function parseMultipart(event){
  return new Promise((resolve, reject)=>{
    const bb = Busboy({ headers: event.headers });
    const fields = {};
    let fileBuffer=null;
    let fileMeta=null;

    bb.on("file",(name,file,info)=>{
      const chunks=[];
      file.on("data",d=>chunks.push(d));
      file.on("end",()=>{
        fileBuffer=Buffer.concat(chunks);
        fileMeta={ field:name, filename:info.filename, mimeType:info.mimeType };
      });
    });
    bb.on("field",(name,val)=>{ fields[name]=val; });
    bb.on("error",reject);
    bb.on("finish",()=>resolve({fields,fileBuffer,fileMeta}));

    const body = event.isBase64Encoded ? Buffer.from(event.body||"", "base64") : Buffer.from(event.body||"", "utf8");
    bb.end(body);
  });
}

export default async (event)=>{
  if (event.httpMethod!=="POST") return bad("Method not allowed",405);

  try{
    const { fields, fileBuffer, fileMeta } = await parseMultipart(event);
    const weekStartISO = String(fields.weekStartISO||"").trim();
    const enterpriseId = String(fields.enterpriseId||"").trim();
    if (!weekStartISO || !enterpriseId) return bad("Missing weekStartISO or enterpriseId",400);
    if (!fileBuffer || !fileMeta?.filename) return bad("Missing proof file",400);

    const store = getStore(STORE_NAME);

    const proofKey = `proof:${weekStartISO}:${enterpriseId}`;
    await store.set(proofKey, fileBuffer, { metadata:{ filename:fileMeta.filename, mimeType:fileMeta.mimeType, uploadedAt:new Date().toISOString() }});

    const subKey = `sub:${weekStartISO}:${enterpriseId}`;
    const payload = {
      weekStartISO,
      enterpriseId,
      name: fields.name || "",
      shoreType: fields.shoreType || "",
      teamName: fields.teamName || "",
      cto: JSON.parse(fields.cto || "[]"),
      project: JSON.parse(fields.project || "[]"),
      dailyTotal: JSON.parse(fields.dailyTotal || "[]"),
      proofName: fileMeta.filename,
      submittedAtISO: new Date().toISOString()
    };
    await store.set(subKey, JSON.stringify(payload), { metadata:{ submittedAtISO: payload.submittedAtISO }});

    return ok({saved:true});
  }catch(e){
    return bad(e.message||String(e),400);
  }
};
