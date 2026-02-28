
const CONFIG = {
  allowedFileExt: ["jpg","jpeg","png","pdf","doc","docx"],
  adminHeader: "x-admin-password"
};

const $ = (id)=>document.getElementById(id);

function showModal(title, body){
  const m = $("modal");
  if (!m) { alert(title + "\n\n" + body); return; }
  $("modalTitle").textContent = title;
  $("modalBody").textContent = body;
  m.classList.add("show");
  m.setAttribute("aria-hidden","false");
  $("modalOk").onclick = ()=>{ m.classList.remove("show"); m.setAttribute("aria-hidden","true"); };
}

function pad2(n){ return String(n).padStart(2,"0"); }
function isoDate(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function startOfWeekMonday(date){
  const d = new Date(date); d.setHours(0,0,0,0);
  const day = d.getDay(); // 0..6 (Sun..Sat)
  const diff = (day===0?-6:1-day);
  d.setDate(d.getDate()+diff);
  return d;
}
function endOfWeekSunday(mon){ const d=new Date(mon); d.setDate(d.getDate()+6); return d; }
function formatWeekLabel(mon){
  const end = endOfWeekSunday(mon);
  const opts={year:"numeric",month:"short",day:"2-digit"};
  return `${mon.toLocaleDateString(undefined,opts)} → ${end.toLocaleDateString(undefined,opts)}`;
}

function normalizeShoreType(st){
  const s=String(st||"").toLowerCase().trim();
  if (s.startsWith("off")) return "Offshore";
  if (s.startsWith("near")) return "Nearshore";
  return "Onshore";
}
function dailyLimitByShore(st){ return normalizeShoreType(st)==="Offshore" ? 9 : 8; }

function parseNum(v){
  if (v===""||v==null||v==undefined) return 0;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : 0;
}
function clampToNumeric(str){
  const cleaned = String(str).replace(/[^\d.]/g,"");
  const parts = cleaned.split(".");
  if (parts.length<=2) return cleaned;
  return parts[0]+"."+parts.slice(1).join("");
}

async function api(path, opts={}){
  const res = await fetch(path, opts);
  const ct = res.headers.get("content-type") || "";
  const payload = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok){
    const msg = payload?.error || (typeof payload==="string" ? payload : JSON.stringify(payload));
    throw new Error(msg || `Request failed: ${res.status}`);
  }
  return payload;
}

let USERS = [];
let ADMIN_PW = "";
let REPORT_ROWS = [];

/* ========== User page ========== */
function initUserPage(){
  if (!$("weekStart")) return;

  const monday = startOfWeekMonday(new Date());
  $("weekStart").value = isoDate(monday);
  $("weekHint").textContent = formatWeekLabel(monday);

  $("prevWeekBtn").onclick = ()=>shiftWeek(-7);
  $("nextWeekBtn").onclick = ()=>shiftWeek(7);
  $("weekStart").onchange = ()=>{
    const m = startOfWeekMonday(new Date($("weekStart").value));
    $("weekStart").value = isoDate(m);
    $("weekHint").textContent = formatWeekLabel(m);
    refreshUserStatus();
  };

  $("proofFile").setAttribute("accept", CONFIG.allowedFileExt.map(x=>"."+x).join(","));
  $("proofFile").onchange = ()=>{ validateFile(true); refreshUserStatus(); };

  document.querySelectorAll("input.h").forEach(inp=>{
    inp.addEventListener("input", ()=>{
      inp.value = clampToNumeric(inp.value);
      updateTotals();
      refreshUserStatus();
    });
    inp.addEventListener("blur", ()=>{
      if (inp.value==="") return;
      inp.value = String(Math.round(parseNum(inp.value)*100)/100);
      updateTotals();
      refreshUserStatus();
    });
  });

  $("resetBtn").onclick = ()=>resetUserForm();
  $("submitBtn").onclick = ()=>submitTimesheet();

  loadUsers();
}

function shiftWeek(delta){
  const d = new Date($("weekStart").value);
  d.setDate(d.getDate()+delta);
  const m = startOfWeekMonday(d);
  $("weekStart").value = isoDate(m);
  $("weekHint").textContent = formatWeekLabel(m);
  refreshUserStatus();
}

function getHours(){
  const cto=Array(7).fill(0), project=Array(7).fill(0);
  document.querySelectorAll("input.h").forEach(inp=>{
    const day = Number(inp.dataset.day);
    const row = inp.dataset.row;
    const v = parseNum(inp.value);
    if (row==="cto") cto[day]=v;
    else project[day]=v;
  });
  return {cto, project};
}

function updateTotals(){
  const {cto, project} = getHours();
  for (let i=0;i<7;i++){
    const t = Math.round((cto[i]+project[i])*100)/100;
    const cell = $("d"+i);
    if (cell) cell.textContent = String(t);
  }
  document.querySelectorAll("input.h").forEach(i=>i.classList.remove("badcell"));
}

function validateFile(showHint){
  const f = $("proofFile").files?.[0];
  if (!f){
    if (showHint) $("fileHint").textContent = "Required.";
    return false;
  }
  const ext = f.name.split(".").pop().toLowerCase();
  if (!CONFIG.allowedFileExt.includes(ext)){
    if (showHint) $("fileHint").textContent = `Invalid type. Allowed: ${CONFIG.allowedFileExt.join(", ")}`;
    return false;
  }
  if (showHint) $("fileHint").textContent = `Selected: ${f.name}`;
  return true;
}

function setStatus(kind,msg,hint){
  $("statusText").textContent = msg;
  $("statusHint").textContent = hint || "";
  const dot=$("statusDot");
  dot.style.background = kind==="ok" ? "var(--good)" : kind==="warn" ? "var(--warn)" : kind==="bad" ? "var(--bad)" : "#c7c2df";
}

function refreshUserStatus(){
  if (!$("statusText")) return;
  updateTotals();

  const id = $("enterpriseId").value;
  if (!id){ setStatus("", "Waiting for inputs…", "Select week + Enterprise ID."); return; }
  const u = USERS.find(x=>x.EnterpriseID===id);
  if (!u){ setStatus("bad","Invalid user","Enterprise ID not found."); return; }
  const limit = dailyLimitByShore(u.ShoreType);
  const {cto, project} = getHours();
  let anyAbove=false, anyBelow=false;

  for (let i=0;i<7;i++){
    const total = cto[i]+project[i];
    if (total>limit) anyAbove=true;
    if (total<limit) anyBelow=true;
    if (total!==limit){
      document.querySelectorAll(`input.h[data-day="${i}"]`).forEach(inp=>inp.classList.add("badcell"));
    }
  }

  const fileOk = validateFile(false);

  if (anyAbove){ setStatus("warn","Hours exceed limit (blocked)", `Must be exactly ${limit} hrs/day. Fix highlighted days.`); return; }
  if (anyBelow || !fileOk){ setStatus("bad","Incomplete/invalid (blocked)", !fileOk ? "Upload proof + fix highlighted days." : `Must be exactly ${limit} hrs/day. Fix highlighted days.`); return; }
  setStatus("ok","Ready to submit","All validations passed.");
}

async function loadUsers(){
  try{
    USERS = await api("/api/users");
    const sel = $("enterpriseId");
    sel.innerHTML = `<option value="">Select</option>`;
    USERS.slice().sort((a,b)=>a.EnterpriseID.localeCompare(b.EnterpriseID)).forEach(u=>{
      const o=document.createElement("option");
      o.value=u.EnterpriseID; o.textContent=u.EnterpriseID;
      sel.appendChild(o);
    });
    sel.onchange = ()=>{
      const u = USERS.find(x=>x.EnterpriseID===sel.value);
      $("nameLabel").textContent = u ? u.Name : "—";
      const shore = u ? normalizeShoreType(u.ShoreType) : "—";
      $("shoreLabel").textContent = shore;
      $("teamLabel").textContent = u ? u.TeamName : "—";
      $("dailyLimitLabel").textContent = u ? `${dailyLimitByShore(shore)} hrs/day` : "—";
      refreshUserStatus();
    };
    refreshUserStatus();
  }catch(e){
    showModal("Users load failed", e.message || String(e));
  }
}

function validateBeforeSubmit(popups){
  const id = $("enterpriseId").value;
  if (!id){ if(popups) showModal("Missing","Select Enterprise ID."); return false; }
  const u = USERS.find(x=>x.EnterpriseID===id);
  if (!u){ if(popups) showModal("Invalid","User not found."); return false; }
  const limit = dailyLimitByShore(u.ShoreType);
  const {cto, project} = getHours();
  for (let i=0;i<7;i++){
    const total = cto[i]+project[i];
    if (total>limit){ if(popups) showModal("Warning: exceeds limit", `Day ${i+1} total ${total} > ${limit}.`); return false; }
    if (total<limit){ if(popups) showModal("Cannot submit", `Day ${i+1} total ${total} < ${limit}. Fill to exactly ${limit}.`); return false; }
  }
  if (!validateFile(true)){ if(popups) showModal("Missing proof","Upload a valid proof file."); return false; }
  return true;
}

async function submitTimesheet(){
  try{
    if (!validateBeforeSubmit(true)) return;
    const weekStartISO = $("weekStart").value;
    const id = $("enterpriseId").value;
    const u = USERS.find(x=>x.EnterpriseID===id);
    const {cto, project} = getHours();
    const dailyTotal = cto.map((v,i)=>Math.round((v+project[i])*100)/100);
    const file = $("proofFile").files[0];

    const fd = new FormData();
    fd.append("weekStartISO", weekStartISO);
    fd.append("enterpriseId", id);
    fd.append("name", u.Name);
    fd.append("shoreType", normalizeShoreType(u.ShoreType));
    fd.append("teamName", u.TeamName);
    fd.append("cto", JSON.stringify(cto));
    fd.append("project", JSON.stringify(project));
    fd.append("dailyTotal", JSON.stringify(dailyTotal));
    fd.append("proof", file, file.name);

    await api("/api/submit", { method:"POST", body: fd });
    showModal("Submitted","Saved successfully.");
    resetUserForm();
  }catch(e){
    showModal("Submit failed", e.message || String(e));
  }
}

function resetUserForm(){
  document.querySelectorAll("input.h").forEach(i=>i.value="");
  $("proofFile").value="";
  $("fileHint").textContent="Required.";
  updateTotals();
  refreshUserStatus();
}

/* ========== Admin page ========== */
function initAdminPage(){
  if (!$("adminLoginBtn")) return;

  const monday = startOfWeekMonday(new Date());
  $("adminWeekStart").value = isoDate(monday);
  $("adminWeekHint").textContent = formatWeekLabel(monday);

  $("adminPrevWeekBtn").onclick = ()=>shiftAdminWeek(-7);
  $("adminNextWeekBtn").onclick = ()=>shiftAdminWeek(7);
  $("adminWeekStart").onchange = ()=>{
    const m = startOfWeekMonday(new Date($("adminWeekStart").value));
    $("adminWeekStart").value = isoDate(m);
    $("adminWeekHint").textContent = formatWeekLabel(m);
  };

  $("adminLoginBtn").onclick = async ()=>{
    ADMIN_PW = $("adminPass").value || "";
    if (!ADMIN_PW){ showModal("Missing","Enter admin password."); return; }
    try{
      await api("/api/admin/ping", { headers: { [CONFIG.adminHeader]: ADMIN_PW }});
      $("adminPass").value = "";
      $("adminPanel").style.display = "";
      await refreshAdmin();
      showModal("Unlocked","Admin console unlocked.");
    }catch(e){
      ADMIN_PW = "";
      showModal("Denied", e.message || String(e));
    }
  };

  $("adminLockBtn").onclick = ()=>{
    ADMIN_PW = "";
    $("adminPanel").style.display = "none";
    document.querySelector("#reportTable tbody").innerHTML="";
    document.querySelector("#usersTable tbody").innerHTML="";
    showModal("Locked","Admin console locked.");
  };

  $("runReportBtn").onclick = ()=>runReport();
  $("exportCsvBtn").onclick = ()=>exportCsv();

  $("addUserBtn").onclick = ()=>addUserRow();

  $("resetUsersBtn").onclick = async ()=>{
    if (!confirm("Reset users to seed list?")) return;
    try{
      await api("/api/admin/reset-users", { method:"POST", headers: { [CONFIG.adminHeader]: ADMIN_PW }});
      await refreshAdmin();
      showModal("Reset","Users reset to seed list.");
    }catch(e){
      showModal("Reset failed", e.message || String(e));
    }
  };

  // Keep these buttons for UI consistency; export is CSV (Excel opens it)
  $("downloadUsersExcelBtn").onclick = ()=>exportUsersCsv();
  $("uploadUsersExcelAdmin").onchange = ()=>{
    showModal("Info","Excel upload not required in this version. Use Add/Edit/Delete instead.");
    $("uploadUsersExcelAdmin").value="";
  };
}

function shiftAdminWeek(delta){
  const d=new Date($("adminWeekStart").value);
  d.setDate(d.getDate()+delta);
  const m=startOfWeekMonday(d);
  $("adminWeekStart").value=isoDate(m);
  $("adminWeekHint").textContent=formatWeekLabel(m);
}

async function refreshAdmin(){
  await loadAdminFilters();
  await loadLastWeekStats();
  await loadUsersTable();
  await runReport();
}

async function loadAdminFilters(){
  const users = await api("/api/admin/users", { headers: { [CONFIG.adminHeader]: ADMIN_PW }});
  // teams
  const teams = Array.from(new Set(users.map(u=>u.TeamName))).sort();
  const tSel=$("adminTeam");
  const prevT=tSel.value;
  tSel.innerHTML = `<option value="">All Teams</option>`;
  teams.forEach(t=>{ const o=document.createElement("option"); o.value=t; o.textContent=t; tSel.appendChild(o); });
  tSel.value = teams.includes(prevT)?prevT:"";

  // resources
  const rSel=$("adminResource");
  const prevR=rSel.value;
  rSel.innerHTML = `<option value="">All Resources</option>`;
  users.slice().sort((a,b)=>a.EnterpriseID.localeCompare(b.EnterpriseID)).forEach(u=>{
    const o=document.createElement("option"); o.value=u.EnterpriseID; o.textContent=`${u.EnterpriseID} — ${u.Name}`; rSel.appendChild(o);
  });
  rSel.value = users.some(u=>u.EnterpriseID===prevR)?prevR:"";
}

async function loadLastWeekStats(){
  const mondayThis=startOfWeekMonday(new Date());
  const mondayLast=new Date(mondayThis); mondayLast.setDate(mondayLast.getDate()-7);
  const weekStartISO=isoDate(mondayLast);

  const users = await api("/api/admin/users", { headers: { [CONFIG.adminHeader]: ADMIN_PW }});
  const stats = await api(`/api/admin/stats?weekStartISO=${encodeURIComponent(weekStartISO)}`, { headers: { [CONFIG.adminHeader]: ADMIN_PW }});

  $("statTotal").textContent = String(users.length);
  $("statSubmitted").textContent = String(stats.submitted||0);
  $("statNotSubmitted").textContent = String(Math.max(0, users.length-(stats.submitted||0)));
  $("statWeek").textContent = formatWeekLabel(mondayLast);
}

async function runReport(){
  const weekStartISO=$("adminWeekStart").value;
  const team=$("adminTeam").value;
  const enterpriseId=$("adminResource").value;

  const qs = new URLSearchParams({ weekStartISO });
  if (team) qs.set("team", team);
  if (enterpriseId) qs.set("enterpriseId", enterpriseId);

  REPORT_ROWS = await api(`/api/admin/report?${qs.toString()}`, { headers: { [CONFIG.adminHeader]: ADMIN_PW }});
  const tbody=document.querySelector("#reportTable tbody");
  tbody.innerHTML="";
  REPORT_ROWS.forEach(r=>{
    const tr=document.createElement("tr");
    const daily=r.dailyTotal||[0,0,0,0,0,0,0];
    const vals=[r.weekStartISO,r.enterpriseId,r.name,r.shoreType,r.teamName,r.status, ...daily, r.proofName||"", r.submittedAtISO||""];
    vals.forEach(v=>{ const td=document.createElement("td"); td.textContent=String(v??""); tr.appendChild(td); });
    tbody.appendChild(tr);
  });
}

function exportCsv(){
  if (!REPORT_ROWS.length){ showModal("Nothing to export","No report rows."); return; }
  const headers=["weekStartISO","enterpriseId","name","shoreType","teamName","status","Mon","Tue","Wed","Thu","Fri","Sat","Sun","proofName","submittedAtISO"];
  const lines=[headers.join(",")];
  REPORT_ROWS.forEach(r=>{
    const d=r.dailyTotal||[0,0,0,0,0,0,0];
    const row=[r.weekStartISO,r.enterpriseId,r.name,r.shoreType,r.teamName,r.status,d[0],d[1],d[2],d[3],d[4],d[5],d[6],r.proofName||"",r.submittedAtISO||""];
    lines.push(row.map(v=>String(v??"")).map(v=> (v.includes(",")||v.includes('"')||v.includes("\n")) ? `"${v.replace(/"/g,'""')}"` : v).join(","));
  });
  const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=`timesheet_report_${Date.now()}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

async function loadUsersTable(){
  const users = await api("/api/admin/users", { headers: { [CONFIG.adminHeader]: ADMIN_PW }});
  const tbody=document.querySelector("#usersTable tbody");
  tbody.innerHTML="";
  users.slice().sort((a,b)=>a.EnterpriseID.localeCompare(b.EnterpriseID)).forEach(u=>{
    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td>${u.EnterpriseID}</td>
      <td>${u.Name}</td>
      <td>${u.ShoreType}</td>
      <td>${u.TeamName}</td>
      <td>
        <div class="row" style="justify-content:center;">
          <button class="btn ghost" data-act="edit">Edit</button>
          <button class="btn ghost danger" data-act="del">Delete</button>
        </div>
      </td>`;
    tr.querySelector('[data-act="edit"]').onclick = ()=>editUserRow(u);
    tr.querySelector('[data-act="del"]').onclick = ()=>deleteUser(u.EnterpriseID);
    tbody.appendChild(tr);
  });
}

function addUserRow(){
  const tbody=document.querySelector("#usersTable tbody");
  if (tbody.querySelector('tr[data-new="1"]')) return;
  const tr=document.createElement("tr");
  tr.dataset.new="1";
  tr.innerHTML = `
    <td><input id="nId" type="text" placeholder="E12345"></td>
    <td><input id="nName" type="text" placeholder="Name"></td>
    <td>
      <select id="nShore">
        <option>Onshore</option><option>Offshore</option><option>Nearshore</option>
      </select>
    </td>
    <td><input id="nTeam" type="text" placeholder="Team"></td>
    <td>
      <div class="row" style="justify-content:center;">
        <button class="btn" id="nSave">Save</button>
        <button class="btn ghost" id="nCancel">Cancel</button>
      </div>
    </td>`;
  tbody.prepend(tr);
  tr.querySelector("#nCancel").onclick = ()=>tr.remove();
  tr.querySelector("#nSave").onclick = async ()=>{
    const user={
      EnterpriseID: tr.querySelector("#nId").value.trim(),
      Name: tr.querySelector("#nName").value.trim(),
      ShoreType: tr.querySelector("#nShore").value.trim(),
      TeamName: tr.querySelector("#nTeam").value.trim(),
    };
    if (!user.EnterpriseID||!user.Name||!user.TeamName){ showModal("Missing","All fields are required."); return; }
    try{
      await api("/api/admin/users", {
        method:"POST",
        headers:{ "content-type":"application/json", [CONFIG.adminHeader]: ADMIN_PW },
        body: JSON.stringify(user)
      });
      await refreshAdmin();
      showModal("Added","User added.");
    }catch(e){
      showModal("Add failed", e.message || String(e));
    }
  };
}

function editUserRow(u){
  const tbody=document.querySelector("#usersTable tbody");
  const row=Array.from(tbody.querySelectorAll("tr")).find(r=>r.children?.[0]?.textContent===u.EnterpriseID);
  if (!row) return;

  row.innerHTML = `
    <td>${u.EnterpriseID}</td>
    <td><input id="eName" type="text" value="${u.Name.replace(/"/g,"&quot;")}"></td>
    <td>
      <select id="eShore">
        <option ${u.ShoreType==="Onshore"?"selected":""}>Onshore</option>
        <option ${u.ShoreType==="Offshore"?"selected":""}>Offshore</option>
        <option ${u.ShoreType==="Nearshore"?"selected":""}>Nearshore</option>
      </select>
    </td>
    <td><input id="eTeam" type="text" value="${u.TeamName.replace(/"/g,"&quot;")}"></td>
    <td>
      <div class="row" style="justify-content:center;">
        <button class="btn" id="eSave">Save</button>
        <button class="btn ghost" id="eCancel">Cancel</button>
      </div>
    </td>`;

  row.querySelector("#eCancel").onclick = ()=>loadUsersTable();
  row.querySelector("#eSave").onclick = async ()=>{
    const updated={
      EnterpriseID:u.EnterpriseID,
      Name: row.querySelector("#eName").value.trim(),
      ShoreType: row.querySelector("#eShore").value.trim(),
      TeamName: row.querySelector("#eTeam").value.trim(),
    };
    if (!updated.Name||!updated.TeamName){ showModal("Missing","Name and Team required."); return; }
    try{
      await api(`/api/admin/user?id=${encodeURIComponent(u.EnterpriseID)}`, {
        method:"PUT",
        headers:{ "content-type":"application/json", [CONFIG.adminHeader]: ADMIN_PW },
        body: JSON.stringify(updated)
      });
      await refreshAdmin();
      showModal("Saved","User updated.");
    }catch(e){
      showModal("Save failed", e.message || String(e));
    }
  };
}

async function deleteUser(id){
  if (!confirm(`Delete user ${id}?`)) return;
  try{
    await api(`/api/admin/user?id=${encodeURIComponent(id)}`, { method:"DELETE", headers:{ [CONFIG.adminHeader]: ADMIN_PW }});
    await refreshAdmin();
    showModal("Deleted","User deleted.");
  }catch(e){
    showModal("Delete failed", e.message || String(e));
  }
}

async function exportUsersCsv(){
  try{
    const users = await api("/api/admin/users", { headers:{ [CONFIG.adminHeader]: ADMIN_PW }});
    const headers=["EnterpriseID","Name","ShoreType","TeamName"];
    const lines=[headers.join(",")];
    users.forEach(u=>{
      const row=headers.map(h=>String(u[h]||""));
      lines.push(row.map(v=> (v.includes(",")||v.includes('"')||v.includes("\n")) ? `"${v.replace(/"/g,'""')}"` : v).join(","));
    });
    const blob=new Blob([lines.join("\n")],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=`users_${Date.now()}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }catch(e){
    showModal("Export failed", e.message || String(e));
  }
}

window.addEventListener("DOMContentLoaded", ()=>{
  try{
    initUserPage();
    initAdminPage();
  }catch(e){
    console.error(e);
    showModal("Error", e.message || String(e));
  }
});
