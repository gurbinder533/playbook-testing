import { loadData, chrome, showError, gate, esc } from "../lib/core.js";
import * as AN from "../lib/analysis.js";
const buildSignals = AN.buildSignals, buildCauses = AN.buildCauses, sevRank = AN.sevRank, SEV_COLOR = AN.SEV_COLOR, AHC_BY = AN.AHC_BY || {};
import { pill } from "../lib/ui.js";
import { cite, ahc } from "../lib/refs.js";

let openId = "";

function flow(causes, sigs) {
  const W = 960, ch = 78, sh = 56, top = 14, H = Math.max(causes.length * ch, sigs.length * sh) + top * 2;
  const cy = (i) => top + i * ch + ch / 2 - 4, sy = (i) => top + i * sh + sh / 2;
  let g = "";
  causes.forEach((c, i) => c.explains.forEach((sid) => {
    const j = sigs.findIndex((s) => s.id === sid); if (j < 0) return;
    const x1 = 300, y1 = cy(i), x2 = 650, y2 = sy(j);
    g += `<path d="M${x1},${y1} C${x1 + 170},${y1} ${x2 - 170},${y2} ${x2},${y2}" fill="none" stroke="${c.color}" stroke-width="${openId === c.id ? 3.2 : 1.6}" opacity="${openId === c.id ? 0.95 : 0.35}"/>`;
  }));
  causes.forEach((c, i) => { g += `<g data-c="${c.id}" style="cursor:pointer"><rect x="10" y="${cy(i) - 30}" width="290" height="62" rx="12" fill="#10204a" stroke="${c.color}" stroke-width="${openId === c.id ? 3 : 1.4}"/><text x="24" y="${cy(i) - 8}" style="font-weight:700;font-size:13px">${esc(c.name.length > 38 ? c.name.slice(0, 37) + "\u2026" : c.name)}</text><text x="24" y="${cy(i) + 10}" class="sm">${esc(c.conf)}</text><text x="24" y="${cy(i) + 25}" class="sm">explains ${c.explains.join(" \u00b7 ")}</text></g>`; });
  sigs.forEach((s, j) => { g += `<g><a href="signals"><rect x="650" y="${sy(j) - 22}" width="300" height="44" rx="10" fill="#0c1530" stroke="${SEV_COLOR[s.sev]}"/><text x="662" y="${sy(j) - 4}" style="font-weight:700;font-size:12px">${s.id} \u00b7 ${esc(s.title.length > 40 ? s.title.slice(0, 39) + "\u2026" : s.title)}</text><text x="662" y="${sy(j) + 13}" class="sm">${s.sev} \u00b7 ${esc(s.domains.slice(0, 3).join(", "))}</text></a></g>`; });
  return `<svg class="flow" viewBox="0 0 ${W} ${H}" role="img" aria-label="Root causes mapped to signals">${g}</svg>`;
}

export default async function render(ctx) {
  const main = chrome(ctx, "rootcause");
  let st;
  try { st = await loadData(ctx); } catch (e) { showError(ctx, main, e); return; }
  if (ctx.signal.aborted) return;
  if (gate(main, st, "Root-cause analysis")) return;
  const RULED_OUT = AN.buildRuledOut(st);
  const causes = buildCauses(st), sigs = buildSignals(st).sort((a, b) => sevRank(b.sev) - sevRank(a.sev) || a.id.localeCompare(b.id));
  if (!causes.length) { main.innerHTML = `<h1>Root-cause analysis</h1><div class="card upnote"><b>No likely shared causes found yet.</b> Too few markers outside their reference range to suggest a pattern, or the markers needed are missing. Candidate causes appear here automatically when the data support them.</div>${RULED_OUT.length ? `<div class="card sec"><h2>Considered and set aside</h2><div class="grid g2">${RULED_OUT.map((r) => `<div class="callout"><b>${esc(r.t)}</b><p class="muted" style="margin:4px 0">${esc(r.w)}</p>${cite(...r.c)}</div>`).join("")}</div></div>` : ""}`; return; }
  let wantC = null;
  try { wantC = new URLSearchParams(window.location.search).get("c"); } catch (_) { /* ignore */ }
  const byKey = wantC ? causes.find((x) => x.key === wantC) : null; // a protocol chip links rootcause?c=<stable key>
  if (byKey) openId = byKey.id;
  if (!causes.some((x) => x.id === openId)) openId = causes[0].id;
  const draw = () => {
    const c = causes.find((x) => x.id === openId) || causes[0];
    main.innerHTML = `
<h1>Root-cause analysis</h1>
<p class="sub">Do the signals share a common cause? Click a cause to see which signals it explains, the evidence for and against it, and the single test that would confirm or refute it.</p>
<div class="card"><h2>Causes \u2192 signals</h2>${flow(causes, sigs)}<p class="muted" style="font-size:12px">Line thickness highlights the selected cause. A signal can have more than one contributing cause. Causal links are hypotheses to test, not established diagnoses.</p></div>
<div class="grid gr sec">
  <div class="card" style="border-left:4px solid ${c.color}">
    <div class="sig-h"><b class="muted">${c.id}</b><h3>${esc(c.name)}</h3><span class="chip" style="border-color:${c.color}">${esc(c.conf)}</span></div>
    <p>${esc(c.summary)}</p>
    <div>${c.mech.map((m) => `<span class="chip">${esc(m)}</span>`).join("")}</div>
    <div class="grid g2" style="margin-top:10px">
      <div class="callout read"><small>Evidence for</small><ul class="t">${c.for.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div class="callout" style="border-color:#6b4a2d;background:#1e150b"><small>Evidence against / gaps</small><ul class="t">${c.against.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
    </div>
    <div class="callout why"><small>Test that would settle it</small>${esc(c.test)}</div>
    <small class="muted">PubMed</small><br>${cite(...c.cites)}${AHC_BY[c.key] ? `<br><small class="muted">Academic health centres</small><br>${ahc(...AHC_BY[c.key])}` : ""}
  </div>
  <div class="card"><h2>Pick a cause</h2><div class="grid" style="grid-template-columns:minmax(0,1fr)">${causes.map((x) => `<button type="button" class="mcard${x.id === openId ? " sel" : ""}" data-c="${x.id}" style="border-left-color:${x.color}"><div class="mc-h"><span><b>${x.id}</b> ${esc(x.name)}</span></div><div style="font-size:12px;margin-top:3px">${esc(x.conf)} \u00b7 explains ${x.explains.join(", ") || "\u2014"}</div></button>`).join("")}</div></div>
</div>
<div class="card sec"><h2>Top-ranked hypothesis</h2>
  <div class="grid g4">
    <div class="callout"><small>1 \u00b7 Driver</small><b>${esc(causes[0].name)}</b><br><span class="muted">${esc(causes[0].conf)}</span></div>
    <div class="callout"><small>2 \u00b7 Mechanism</small><b>${esc(causes[0].mech.join("; "))}</b><br>${cite(...causes[0].cites.slice(0, 3))}</div>
    <div class="callout"><small>3 \u00b7 Signals it would explain</small><b>${causes[0].explains.length ? esc(causes[0].explains.join(", ")) : "none yet"}</b><br><span class="muted">Links are statistical associations, not proven causes.</span></div>
    <div class="callout"><small>4 \u00b7 Where it may not fit</small><b>${esc(causes[0].against[0] || "")}</b></div>
  </div></div>
<div class="card sec"><h2>Considered and set aside</h2><div class="grid g2">${RULED_OUT.map((r) => `<div class="callout"><b>${esc(r.t)}</b><p class="muted" style="margin:4px 0">${esc(r.w)}</p>${cite(...r.c)}</div>`).join("")}</div></div>`;
    main.querySelectorAll("[data-c]").forEach((el) => el.addEventListener("click", () => { openId = el.dataset.c; draw(); }, { signal: ctx.signal }));
  };
  draw();
  if (byKey) { const g = main.querySelector(".grid.gr"); if (g) g.scrollIntoView({ block: "start" }); }
}
