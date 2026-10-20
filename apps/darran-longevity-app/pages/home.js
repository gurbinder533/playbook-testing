import { loadData, chrome, showError, gate, f, dstr, esc, therapyMarks } from "../lib/core.js";
import { allStatus, radarData, buildSignals, bpSummary, buildWorking, ANNOT, sevRank, planItems } from "../lib/analysis.js";
import { radar, wireRadar, pill } from "../lib/ui.js";
import { lineChart, seriesFor } from "../lib/charts.js";
import { cite } from "../lib/refs.js";
import { pageCites } from "../lib/pagecites.js";

export default async function render(ctx) {
  const main = chrome(ctx, "home");
  let st;
  try { st = await loadData(ctx); } catch (e) { showError(ctx, main, e); return; }
  if (ctx.signal.aborted) return;
  if (gate(main, st, "Health overview")) return;
  const WORKING = buildWorking(st);
  const rows = allStatus(st), order = { crit: 0, flag: 1, watch: 2, ok: 3 };
  const flagged = rows.filter((r) => r.status !== "ok").sort((a, b) => order[a.status] - order[b.status] || b.persist - a.persist || a.label.localeCompare(b.label));
  const sigs = buildSignals(st).sort((a, b) => sevRank(b.sev) - sevRank(a.sev));
  const docs = (st.kinds.doc || []).length, longi = Object.values(st.series).filter((s) => s.length >= 3).length;
  const bp = bpSummary(st);
  const ranks = radarData(rows);
  const marks = therapyMarks(st, true);
  const bpS = [{ ...seriesFor(st, "bp_sys"), name: "Systolic", color: "#ff7a59" }, { ...seriesFor(st, "bp_dia"), name: "Diastolic", color: "#5cc8ff" }];
  const fatS = [{ ...seriesFor(st, "dexa_fat_mass"), name: "Fat mass", color: "#ff7a59" }, { ...seriesFor(st, "dexa_lean"), name: "Lean mass", color: "#3ee0c4" }];
  const ldlS = [{ ...seriesFor(st, "ldl"), name: "LDL", color: "#ffb020" }, { ...seriesFor(st, "hdl"), name: "HDL", color: "#3ee0c4" }];
  const latest = [...st.events.map((e) => e.start), ...Object.values(st.series).filter((s) => s.length).map((s) => s[s.length - 1].d)].sort().pop();
  const fmS = st.series.dexa_fat_mass || [], haveCh = (k) => (st.series[k] || []).length > 0;

  main.innerHTML = `
<h1>Health overview</h1>
<p class="sub">Everything extracted from the records \u2014 lab reports, scans, imaging, clinic notes and screening results \u2014 combined into one picture. Latest record: ${latest ? dstr(latest) : "\u2014"}.</p>
<div class="grid g5">
  <a class="kpi kpi-link" href="records" title="Open Records &amp; Genetics"><div class="l">Source documents</div><div class="n">${docs}</div><div class="d">PDFs, scans, photos &amp; notes read</div></a>
  <a class="kpi kpi-link" href="trends" title="Open Trends"><div class="l">Metrics tracked</div><div class="n">${Object.keys(st.series).length}</div><div class="d">${longi} with 3+ readings over time</div></a>
  <a class="kpi kpi-link" href="home" id="kpi-flagged" title="Jump to the Flagged metrics table"><div class="l">Flagged metrics</div><div class="n" style="color:var(--flag)">${flagged.length}</div><div class="d">${flagged.filter((r) => r.status === "crit").length} high concern \u00b7 ${flagged.filter((r) => r.status === "flag").length} out of range \u00b7 ${flagged.filter((r) => r.status === "watch").length} watch</div></a>
  <a class="kpi kpi-link" href="signals" title="Open Signals"><div class="l">Multi-metric signals</div><div class="n" style="color:var(--crit)">${sigs.filter((s) => s.sev !== "Resolved").length}</div><div class="d">${sigs.filter((s) => s.sev === "High").length} high \u00b7 ${sigs.filter((s) => s.sev === "Moderate").length} moderate \u00b7 ${sigs.filter((s) => s.sev === "Low").length} low${sigs.some((s) => s.sev === "Resolved") ? " \u00b7 " + sigs.filter((s) => s.sev === "Resolved").length + " followed up" : ""}</div></a>
  <div class="kpi"><div class="l">Clinic BP (mean)</div><div class="n">${f(bp.ms, 0)}/${f(bp.md, 0)}</div><div class="d">${bp.n} visit-days \u00b7 ${bp.hiD} with diastolic \u226590</div></div>
</div>

<div class="grid gr sec">
  <div class="card"><h2>Where the signals concentrate</h2><div class="grid" style="grid-template-columns:minmax(0,1fr)">${sigs.filter((s) => s.sev !== "Resolved").slice(0, 5).map((s) => `<a class="card sig ${s.sev}" href="signals" style="text-decoration:none;color:inherit;padding:12px"><div class="sig-h">${pill(s.sev)}<b>${esc(s.title)}</b></div><div class="muted" style="font-size:12.5px">${esc(s.headline)}</div><div style="margin-top:6px">${s.domains.map((d) => `<span class="chip">${esc(d)}</span>`).join("")}</div></a>`).join("")}</div><p class="muted" style="margin-top:8px;font-size:12px">${sigs.length} signals in total \u2014 see the <a href="signals">Signals</a> tab; the shared drivers are on <a href="rootcause">Root Cause</a>; the places on the body are on the <a href="body">3D Body Map</a>.</p></div>
  <div class="card"><h2>Metrics in range, by domain</h2>${radar(ranks)}<p class="muted" style="font-size:12px">Each axis is the share of tracked metrics whose latest value is within its reference range. Dot colour = worst status in the domain. Select a domain name to open it in Trends.</p></div>
</div>

<div class="grid g3 sec">
  <div class="card">${haveCh("bp_sys") || haveCh("bp_dia") ? lineChart({ title: "Blood pressure (mmHg)", series: bpS, band: [null, 129], marks, w: 520, h: 250, dp: 0, unit: "mmHg", label: "Blood pressure over time" }) + `<p class="muted" style="font-size:12px">Green band = under 130 systolic.${marks.length ? " Purple dashed line = start of a weight-loss drug." : ""} ${cite(...pageCites.homeBp(st))}</p>` : `<h2>Blood pressure</h2><p class="muted">No blood-pressure readings in the records yet.</p>`}</div>
  <div class="card">${haveCh("ldl") || haveCh("hdl") ? lineChart({ title: "LDL vs HDL cholesterol (mmol/L)", series: ldlS, band: [null, 2.6], marks, w: 520, h: 250, dp: 2, unit: "mmol/L", label: "LDL and HDL over time" }) + `<p class="muted" style="font-size:12px">Band marks a typical LDL target (&lt;2.6; your clinician may set a different one). ${cite(...pageCites.homeLdl(st))}</p>` : `<h2>LDL and HDL cholesterol</h2><p class="muted">No cholesterol results in the records yet.</p>`}</div>
  <div class="card">${haveCh("dexa_fat_mass") || haveCh("dexa_lean") ? lineChart({ title: "Fat vs lean mass (kg) \u2014 " + (st.scanLabel || "scan"), series: fatS, w: 520, h: 250, dp: 1, unit: "kg", label: "Fat and lean mass over time" }) + `<p class="muted" style="font-size:12px">${fmS.length > 1 ? `Fat mass ${fmS[fmS.length - 1].v - fmS[0].v >= 0 ? "+" : ""}${f(fmS[fmS.length - 1].v - fmS[0].v, 1)} kg between the first and latest scan.` : "One scan so far."} ${cite(...pageCites.homeVat(st))}</p>` : `<h2>Body composition</h2><p class="muted">No body-composition scan in the records yet.</p>`}</div>
</div>

<div class="grid gr sec">
  <div class="card" id="flagged-card"><h2>Flagged metrics</h2><div class="scroll"><table class="tbl"><thead><tr><th>Metric</th><th>Latest</th><th>Reference</th><th>Readings</th><th>Status</th></tr></thead><tbody>${flagged.map((r) => `<tr><td><a href="trends" style="color:inherit"><b>${esc(r.label)}</b></a><div class="muted" style="font-size:11px">${esc(r.group)}${ANNOT[r.key] ? " \u00b7 " + esc(ANNOT[r.key]) : ""}</div></td><td>${f(r.v, r.dp)} <span class="muted">${esc(r.unit)}</span></td><td class="muted">${esc(r.rng)}</td><td>${r.n}</td><td>${pill(r.status)}</td></tr>`).join("")}</tbody></table></div></div>
  <div class="card"><h2>Follow-up items from your own reports</h2>${(() => { const p = planItems(st).filter((x) => x.k === "report").slice(0, 8); return p.length ? `<ul class="t">${p.map((x) => `<li><b>${esc(x.t)}</b> <span class="muted">(${dstr(x.date)})</span><div class="muted" style="font-size:12px">${esc(x.w)}</div></li>`).join("")}</ul>` : '<p class="muted">No follow-up requests found in the clinician notes or imaging reports.</p>'; })()}<h2 style="margin-top:14px">What is working</h2><ul class="t">${WORKING.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>${WORKING.length ? "" : '<p class="muted">Nothing to show yet.</p>'}</div>
</div>`;
  wireRadar(main, ctx.signal);
  const fk = main.querySelector("#kpi-flagged"), fc = main.querySelector("#flagged-card");
  if (fk && fc) fk.addEventListener("click", (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const rm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    fc.scrollIntoView({ behavior: rm ? "auto" : "smooth", block: "start" });
    fc.classList.remove("flash"); void fc.offsetWidth; fc.classList.add("flash");
  }, { signal: ctx.signal });
}
