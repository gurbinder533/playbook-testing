import { esc, toNumber } from "@corvic/live";
const SHELL = `<div id="app">
  <div id="header">
    <div class="title"><h1>AI Project Tracker</h1><p>Projects · milestones · tasks · AI status summaries</p></div>
    <div class="pills">
      <div class="pill"><strong id="p-active">—</strong> active</div>
      <div class="pill"><strong id="p-risk">—</strong> at risk</div>
      <div class="pill"><strong id="p-overdue">—</strong> overdue</div>
    </div>
    <div class="live"><span class="dot"></span>LIVE · PROJECTS</div>
  </div>
  <div id="tabs">
    <div class="tab active" data-tab="overview">◇ Projects Overview</div>
    <div class="tab" data-tab="projects">⊞ Projects</div>
  </div>
  <div id="main">
    <div class="view active" id="view-overview">
      <div class="wrap">
        <div class="kpis" id="kpis"></div>
        <div class="panel" style="margin-top:22px">
          <h2>Status</h2>
          <div class="sub">Portfolio health across projects</div>
          <div class="status-legend" id="status-legend"></div>
          <div class="status-strip" id="status-strip"></div>
        </div>
        <div class="grid">
          <div class="panel">
            <h2>Progress by project</h2>
            <div class="sub">Completion of active projects</div>
            <div id="projects-bars"></div>
          </div>
          <div class="panel">
            <h2>AI at-risk &amp; overdue</h2>
            <div class="sub">Projects needing attention — most urgent first</div>
            <div class="risk-list" id="risk"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="view" id="view-projects">
      <div class="wrap">
        <div class="toolbar">
          <input id="tbl-search" type="text" placeholder="Search project, owner, team, milestone…"/>
          <div class="filters" id="status-filters">
            <button class="fbtn active" data-s="all">All</button>
            <button class="fbtn" data-s="ontrack">On track</button>
            <button class="fbtn" data-s="atrisk">At risk</button>
            <button class="fbtn" data-s="delayed">Delayed</button>
            <button class="fbtn" data-s="overdue">Overdue</button>
          </div>
          <button class="export-btn" id="export-csv">⬇ CSV</button>
          <span class="tbl-count" id="tbl-count"></span>
        </div>
        <div class="tbl-card">
          <table id="proj-table">
            <thead><tr>
              <th data-col="project">Project</th><th data-col="owner">Owner</th>
              <th data-col="progress" class="num">Progress</th><th data-col="tasks" class="num">Tasks</th>
              <th data-col="status">Status</th><th data-col="due_date">Due</th>
            </tr></thead>
            <tbody id="tbl-body"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</div>
<div id="drawer-overlay"></div>
<div id="drawer"><div id="drawer-body"></div></div>`;

let ROOT = document.body;
const byId = (id) => ROOT.querySelector("#" + id);

// SHARED RENDERER — identical for live app and preview; only loadRows() differs.
const STATUS_META=[
  {key:"ontrack",name:"On track",color:"#16a34a"},
  {key:"atrisk",name:"At risk",color:"#d97706"},
  {key:"delayed",name:"Delayed",color:"#dc2626"},
  {key:"hold",name:"On hold",color:"#94a3b8"},
  {key:"done",name:"Completed",color:"#2563eb"}
];
function parseDate(v){if(!v)return null;const d=new Date(v);return isNaN(d)?null:d;}
function fmtDate(d){return d?d.toLocaleDateString("en-US",{year:"2-digit",month:"short",day:"numeric"}):"—";}
function pct(n){return Math.max(0,Math.min(100,Math.round(n)));}
function progColor(p){return p>=70?"#16a34a":p>=40?"#2563eb":"#d97706";}
function days(a,b){return Math.round((a-b)/86400000);}
function normStatus(s){
  s=String(s||"").toLowerCase();
  if(/done|complete|closed|shipped|delivered/.test(s))return "done";
  if(/hold|paused|parked/.test(s))return "hold";
  if(/delay|late|behind|off ?track|red|blocked/.test(s))return "delayed";
  if(/risk|amber|yellow|warning/.test(s))return "atrisk";
  return "ontrack";
}

let ROWS=[],TBL=[],NOW=new Date(),tblFilter="all";
let sortCol="due_date",sortDir=1;
function normalize(raw){
  return raw.map((r,i)=>{let p=toNumber(r.progress);if(p!=null&&p<=1&&p>0)p*=100;
    const tt=toNumber(r.tasks_total),td=toNumber(r.tasks_done);
    if(p==null&&tt!=null&&tt>0&&td!=null)p=td/tt*100;
    const st=normStatus(r.status);if(p==null)p=st==="done"?100:0;
    const due=parseDate(r.due_date);
    const overdue=st!=="done"&&due!=null&&due<NOW;
    return {...r,rank:i+1,progress:pct(p),tasks_total:tt,tasks_done:td,budget:toNumber(r.budget),
      _start:parseDate(r.start_date),_due:due,st,overdue,dpd:due?days(due,NOW):null};});
}
function boot(rows){ROWS=normalize(rows||[]);paintKpis();paintStatus();paintBars();paintRisk();TBL=ROWS.slice();sortTable();wireOnce();}

function paintKpis(){
  const active=ROWS.filter(r=>r.st!=="done").length;
  const ontrack=ROWS.filter(r=>r.st==="ontrack").length;
  const risk=ROWS.filter(r=>r.st==="atrisk"||r.st==="delayed").length;
  const done=ROWS.filter(r=>r.st==="done").length;
  const overdue=ROWS.filter(r=>r.overdue).length;
  const act=ROWS.filter(r=>r.st!=="done");
  const avg=act.length?Math.round(act.reduce((a,r)=>a+r.progress,0)/act.length):0;
  byId("p-active").textContent=active;
  byId("p-risk").textContent=risk;
  byId("p-overdue").textContent=overdue;
  const K=(l,v,s,c)=>`<div class="kpi"><div class="k-label">${l}</div><div class="k-val ${c||""}">${v}</div><div class="k-sub">${s}</div></div>`;
  byId("kpis").innerHTML=
    K("Active projects",active,"in flight","acc")+
    K("On track",ontrack,active?Math.round(ontrack/active*100)+"% of active":"","good")+
    K("At risk / delayed",risk,"need attention",risk>0?"warn":"good")+
    K("Completed",done,"delivered","good")+
    K("Avg progress",avg+"%","active projects",avg>=50?"good":"warn")+
    K("Overdue",overdue,"past due date",overdue>0?"bad":"good");
}
function paintStatus(){
  const groups=STATUS_META.map(s=>({...s,count:ROWS.filter(r=>r.st===s.key).length}));
  const total=ROWS.length||1;
  byId("status-strip").innerHTML=groups.map(g=>`<div title="${g.name}: ${g.count}" style="flex:${Math.max(0.4,g.count/total*100)};background:${g.color}"></div>`).join("");
  byId("status-legend").innerHTML=groups.map(g=>`<span><span class="sw" style="background:${g.color}"></span>${g.name} · <b>${g.count}</b></span>`).join("");
}
function paintBars(){
  const rows=ROWS.filter(r=>r.st!=="done").sort((a,b)=>a.progress-b.progress).slice(0,9);
  const el=byId("projects-bars");
  if(!rows.length){el.innerHTML=`<div style="color:var(--muted);font-size:12.5px">No active projects.</div>`;return;}
  el.innerHTML=rows.map(r=>`
    <div class="proj-row"><div class="proj-head"><span class="proj-name" title="${esc(r.project)}">${esc(r.project||"—")}</span><span class="proj-pct" style="color:${progColor(r.progress)}">${r.progress}%</span></div>
      <div class="proj-track"><span class="proj-fill" style="width:${r.progress}%;background:${progColor(r.progress)}"></span></div>
      <div class="proj-meta">${esc(r.owner||"—")}${r._due?" · due "+fmtDate(r._due):""}${r.overdue?" · overdue":""}</div></div>`).join("");
}
function paintRisk(){
  const items=ROWS.filter(r=>r.st!=="done"&&(r.st==="atrisk"||r.st==="delayed"||r.overdue))
    .sort((a,b)=>{const oa=a.overdue?1:0,ob=b.overdue?1:0;if(oa!==ob)return ob-oa;
      const rank={delayed:0,atrisk:1};return (rank[a.st]??2)-(rank[b.st]??2);}).slice(0,10);
  const el=byId("risk");
  if(!items.length){el.innerHTML=`<div style="color:var(--muted);font-size:12.5px">No at-risk or overdue projects — the portfolio is healthy.</div>`;return;}
  el.innerHTML=items.map(r=>{const meta=STATUS_META.find(s=>s.key===r.st);
    return `<div class="risk-row ${r.overdue?"late":""}" data-i="${r.rank-1}">
    <span style="min-width:0"><div class="risk-name">${esc(r.project||"—")}</div><div class="risk-sub">${esc(r.owner||"—")} · ${r.progress}% · ${meta?meta.name:r.st}</div></span>
    <span class="risk-due" style="${r.overdue?'color:var(--red);font-weight:700':'color:var(--muted)'}">${r.overdue?Math.abs(r.dpd)+"d late":(r.dpd!=null?"in "+r.dpd+"d":"—")}</span></div>`;}).join("");
  el.querySelectorAll(".risk-row").forEach(c=>c.addEventListener("click",()=>openDrawer(ROWS[+c.dataset.i])));
}
function renderTable(){
  const b=byId("tbl-body");b.innerHTML="";
  TBL.forEach(r=>{const meta=STATUS_META.find(s=>s.key===r.st);const tr=document.createElement("tr");
    const tasks=(r.tasks_done!=null&&r.tasks_total!=null)?`${r.tasks_done}/${r.tasks_total}`:"—";
    tr.innerHTML=`<td title="${esc(r.project)}">${esc(r.project||"—")}</td><td>${esc(r.owner||"—")}</td>
      <td class="num"><span class="pbar"><span class="t"><span style="width:${r.progress}%;background:${progColor(r.progress)}"></span></span>${r.progress}%</span></td>
      <td class="num">${tasks}</td><td><span class="st-tag ${r.st}">${meta?meta.name:r.st}</span></td>
      <td style="${r.overdue?'color:var(--red);font-weight:700':''}">${fmtDate(r._due)}</td>`;
    tr.addEventListener("click",()=>openDrawer(r));b.appendChild(tr);});
  byId("tbl-count").textContent=TBL.length+" projects";
}
function applyFilter(){
  const q=(byId("tbl-search").value||"").toLowerCase();
  TBL=ROWS.filter(r=>{
    if(tblFilter==="overdue"&&!r.overdue)return false;
    if(tblFilter!=="all"&&tblFilter!=="overdue"&&r.st!==tblFilter)return false;
    if(q&&!((r.project||"")+" "+(r.owner||"")+" "+(r.team||"")+" "+(r.milestone||"")).toLowerCase().includes(q))return false;
    return true;});
  sortTable();
}
function sortTable(){
  TBL.sort((a,b)=>{let av=a[sortCol],bv=b[sortCol];
    if(sortCol==="due_date"){av=a._due?+a._due:Infinity;bv=b._due?+b._due:Infinity;}
    if(sortCol==="tasks"){av=a.tasks_done??-1;bv=b.tasks_done??-1;}
    if(sortCol==="status"){av=a.st;bv=b.st;}
    if(av==null)av=(typeof bv==="number")?-Infinity:"";if(bv==null)bv=(typeof av==="number")?-Infinity:"";
    if(typeof av==="string"&&typeof bv==="string")return av.localeCompare(bv)*sortDir;return ((+av||0)-(+bv||0))*sortDir;});
  renderTable();
  ROOT.querySelectorAll("th").forEach(th=>{th.classList.remove("asc","desc");if(th.dataset.col===sortCol)th.classList.add(sortDir===1?"asc":"desc");});
}
function aiSummary(r){
  const meta=STATUS_META.find(s=>s.key===r.st);const bits=[];
  bits.push(`<b>${esc(r.project||"This project")}</b> is <b>${meta?meta.name.toLowerCase():r.st}</b> at <b>${r.progress}%</b> complete`);
  if(r.tasks_done!=null&&r.tasks_total!=null)bits.push(`with ${r.tasks_done} of ${r.tasks_total} tasks done`);
  if(r.milestone)bits.push(`heading into "${esc(r.milestone)}"`);
  let s=bits.join(" ")+".";
  if(r.overdue)s+=` It is <b>${Math.abs(r.dpd)} days overdue</b> — recommend a scope or timeline review.`;
  else if(r.st==="atrisk")s+=" Progress is trailing plan; watch the next milestone closely.";
  else if(r.st==="delayed")s+=" Timeline has slipped; the critical path needs attention.";
  else if(r.st==="done")s+=" Delivered — capture learnings in a retro.";
  else if(r.dpd!=null&&r.dpd>=0)s+=` On pace with ${r.dpd} days to the due date.`;
  return s;
}
function openDrawer(r){
  if(!r)return;const meta=STATUS_META.find(s=>s.key===r.st);
  byId("drawer-body").innerHTML=`
    <span class="dr-close" id="dr-close">✕</span>
    <div class="dr-name">${esc(r.project||"—")}</div>
    <div class="dr-owner">${esc(r.owner||"—")}${r.team?" · "+esc(r.team):""}</div>
    <span class="st-tag ${r.st}" style="align-self:flex-start;margin-top:4px">${meta?meta.name:r.st}${r.overdue?" · overdue":""}</span>
    <div class="dr-track"><span style="width:${r.progress}%;background:${progColor(r.progress)}"></span></div>
    <div style="font-size:11px;color:var(--muted);font-family:var(--mono)">${r.progress}% complete${r.tasks_done!=null&&r.tasks_total!=null?` · ${r.tasks_done}/${r.tasks_total} tasks`:""}</div>
    <div class="dr-summary"><div class="h">✦ AI status summary</div>${aiSummary(r)}</div>
    <div class="dr-row"><span class="l">Milestone</span><span class="v">${esc(r.milestone||"—")}</span></div>
    <div class="dr-row"><span class="l">Health</span><span class="v">${esc(r.health||(meta?meta.name:"—"))}</span></div>
    <div class="dr-row"><span class="l">Start</span><span class="v">${fmtDate(r._start)}</span></div>
    <div class="dr-row"><span class="l">Due</span><span class="v">${r._due?r._due.toLocaleDateString("en-US",{year:"numeric",month:"short",day:"numeric"}):"—"}</span></div>
    <div class="dr-row"><span class="l">Budget</span><span class="v">${r.budget!=null?"$"+r.budget.toLocaleString("en-US"):"—"}</span></div>
    ${r.notes?`<div class="dr-row" style="border:none"><span class="l">Notes</span></div><div style="font-size:12.5px;color:var(--ink);line-height:1.5">${esc(r.notes)}</div>`:""}`;
  byId("dr-close").addEventListener("click",closeDrawer);
  byId("drawer").classList.add("open");byId("drawer-overlay").classList.add("open");
}
function closeDrawer(){byId("drawer").classList.remove("open");byId("drawer-overlay").classList.remove("open");}
let wired=false;
function wireOnce(){
  if(wired)return;wired=true;
  ROOT.querySelectorAll(".tab").forEach(t=>t.addEventListener("click",()=>{
    ROOT.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===t));
    byId("view-overview").classList.toggle("active",t.dataset.tab==="overview");
    byId("view-projects").classList.toggle("active",t.dataset.tab==="projects");}));
  ROOT.querySelectorAll("th[data-col]").forEach(th=>th.addEventListener("click",()=>{
    const c=th.dataset.col;if(sortCol===c)sortDir*=-1;else{sortCol=c;sortDir=(c==="progress"||c==="tasks")?-1:1;}sortTable();}));
  byId("tbl-search").addEventListener("input",applyFilter);
  ROOT.querySelectorAll("#status-filters .fbtn").forEach(b=>b.addEventListener("click",()=>{
    ROOT.querySelectorAll("#status-filters .fbtn").forEach(x=>x.classList.toggle("active",x===b));
    tblFilter=b.dataset.s;applyFilter();}));
  byId("export-csv").addEventListener("click",()=>{
    const cols=["project","owner","team","status","progress","tasks_done","tasks_total","milestone","start_date","due_date","budget"];
    const head=cols.join(",");
    const body=TBL.map(r=>cols.map(c=>{let v=r[c];if(c==="status")v=r.st;
      if(c==="start_date")v=r._start?r._start.toISOString().slice(0,10):"";
      if(c==="due_date")v=r._due?r._due.toISOString().slice(0,10):"";
      return '"'+String(v==null?"":v).replace(/"/g,'""')+'"';}).join(",")).join("\n");
    const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([head+"\n"+body],{type:"text/csv"}));a.download="projects_export.csv";a.click();});
  byId("drawer-overlay").addEventListener("click",closeDrawer);
}

// LIVE DATA — finished design unchanged; rows read live from the room's projects
// source (app.yaml data[].id = "projects") synced from the chosen tool (Jira/Asana/
// Linear/Monday/ClickUp). Rebinding = reconcile the SQL below.
async function loadRows(ctx){
  return ctx.db.rows(
    `SELECT project, owner, status, progress, health, start_date, due_date, milestone,
            tasks_total, tasks_done, budget, team, notes
     FROM projects ORDER BY due_date LIMIT 1000`
  );
}

export default async function render(ctx) {
  ROOT = ctx.content;
  ctx.content.innerHTML = SHELL;
  // The module is evaluated once, but a feature_view refresh renders again into a
  // fresh shell, so the one-time wiring guard has to reopen for the new nodes.
  wired = false;
  try {
    const rows = await loadRows(ctx);
    if (ctx.signal.aborted) {
      return;
    }
    boot(rows);
  } catch (err) {
    const msg=(err&&err.message)?err.message:String(err);
    byId("main").innerHTML=`<div class="err">Couldn't load project data: ${esc(msg)}</div>`;
  }
}
