import { loadData, chrome, showError, gate, f, dstr, esc, scanBlurb, M } from "../lib/core.js";
import { lineChart, seriesFor, bars, pctBar } from "../lib/charts.js";
import { citePage as cite } from "../lib/refs.js";
import { pageCites } from "../lib/pagecites.js";

export default async function render(ctx) {
  const main = chrome(ctx, "composition");
  let st;
  try { st = await loadData(ctx); } catch (e) { showError(ctx, main, e); return; }
  if (ctx.signal.aborted) return;
  if (gate(main, st, "Body composition")) return;
  const S = (k) => st.series[k] || [];
  const L = (k) => st.last(k), F = (k) => st.first(k);
  const has = (k) => S(k).length > 0;
  const scans = [...new Set(["dexa_weight", "dexa_fat_mass", "dexa_lean", "dexa_fat_pct", "dexa_vat", "vfa", "dexa_tscore"].flatMap((k) => S(k).map((p) => p.d)))].sort();
  if (!scans.length && !has("weight") && !has("bmi") && !has("waist")) {
    main.innerHTML = `<h1>Body composition</h1><div class="card upnote"><b>No body-composition data in the records.</b> This page fills in when a body-composition scan report (or a log with weight and waist) is among them.</div>`;
    return;
  }
  const at = (k, d) => { const p = S(k).find((x) => x.d === d) || (st.excl[k] || []).find((x) => x.d === d); return p ? p.v : null; };
  const reg = (st.kinds.regional || []).map((r) => { const [kind, part] = String(r.key).split("|"); return { kind, part, pct: Number(r.value), peer: Number(r.detail) }; }).filter((r) => r.part);
  const bmd = (st.kinds.bmd || []).map((r) => ({ part: r.key, pct: Number(r.value) })).sort((a, b) => a.pct - b.pct);
  const card = (html) => (html ? `<div class="card">${html}</div>` : "");
  const chart = (o, keys) => (keys.some(has) ? lineChart(o) : "");
  const comp = chart({ title: "Body composition (kg) \u2014 " + (st.scanLabel || "scan"), series: [{ ...seriesFor(st, "dexa_fat_mass"), name: "Fat mass", color: "#ff7a59" }, { ...seriesFor(st, "dexa_lean"), name: "Lean mass", color: "#3ee0c4" }, { ...seriesFor(st, "dexa_weight"), name: "Total mass", color: "#8ea0c4", width: 1.4 }].filter((s) => s.pts.length), w: 640, h: 290, dp: 1, unit: "kg", label: "Body masses over time" }, ["dexa_fat_mass", "dexa_lean", "dexa_weight"]);
  const bf = chart({ title: "Body fat %", series: [{ ...seriesFor(st, "dexa_fat_pct"), color: "#ffb020" }], band: [null, 25], w: 640, h: 230, dp: 1, unit: "%", statusKey: "dexa_fat_pct", label: "Body fat percentage" }, ["dexa_fat_pct"]);
  const vat = chart({ title: "Visceral fat (kg) \u2014 hollow = excluded outlier", series: [{ ...seriesFor(st, "dexa_vat"), color: "#ff7a59" }], band: [null, 0.5], w: 640, h: 230, dp: 2, unit: "kg", statusKey: "dexa_vat", label: "Visceral fat over time" }, ["dexa_vat"]);
  const vfa = chart({ title: M.vfa.l + " (" + M.vfa.u + ")", series: [{ ...seriesFor(st, "vfa"), color: "#ff7a59" }], band: [null, M.vfa.hi != null ? M.vfa.hi : null], w: 640, h: 230, dp: 1, unit: M.vfa.u, statusKey: "vfa", label: "Visceral fat area over time" }, ["vfa"]);
  const ts = chart({ title: "Bone T-score (total body)", series: [{ ...seriesFor(st, "dexa_tscore"), color: "#5cc8ff" }], band: [-1, null], w: 640, h: 230, dp: 1, unit: "", statusKey: "dexa_tscore", label: "T-score over time" }, ["dexa_tscore"]);
  const wt = chart({ title: "Weight (kg)", series: [{ ...seriesFor(st, "weight"), color: "#5cc8ff" }], w: 640, h: 230, dp: 1, unit: "kg", label: "Body weight over time" }, ["weight"]);
  const kpi = (l, k, dp, unit, d) => (has(k) ? `<div class="kpi"><div class="l">${l}</div><div class="n">${f(L(k).v, dp)}${unit}</div><div class="d">${d || dstr(L(k).d)}</div></div>` : "");
  const chg = (k, dp) => (S(k).length > 1 ? `${L(k).v - F(k).v >= 0 ? "+" : ""}${f(L(k).v - F(k).v, dp)} vs first scan` : dstr(L(k).d));
  const kpis = [kpi("Body fat", "dexa_fat_pct", 1, "%", chg("dexa_fat_pct", 1) ), has("dexa_fat_mass") ? kpi("Fat mass", "dexa_fat_mass", 1, " kg", chg("dexa_fat_mass", 1)) : "", has("dexa_lean") ? kpi("Lean mass", "dexa_lean", 1, " kg", chg("dexa_lean", 1)) : "", (has("dexa_vat") ? kpi("Visceral fat", "dexa_vat", 2, " kg", "") : kpi("Visceral fat area", "vfa", 1, " cm\u00b2", "")), has("almi") ? `<div class="kpi"><div class="l">ALMI / FFMI</div><div class="n">${f(L("almi").v, 2)}${has("ffmi") ? " / " + f(L("ffmi").v, 1) : ""}</div><div class="d">kg/m\u00b2</div></div>` : "", kpi("Weight", "weight", 1, " kg"), kpi("BMI", "bmi", 1, ""), kpi("Waist", "waist", 0, " cm")].filter(Boolean).slice(0, 5);
  main.innerHTML = `
<h1>Body composition</h1>
<p class="sub">${scans.length ? `${scans.length} scan date${scans.length > 1 ? "s" : ""} from ${dstr(scans[0])} to ${dstr(scans[scans.length - 1])}. ` : ""}${esc(scanBlurb(st))}</p>
<div class="grid g5">${kpis.join("")}</div>
<div class="grid g2 sec">${card(comp + (comp && S("dexa_fat_mass").length > 1 ? `<p class="muted" style="font-size:12px">Fat mass ${F("dexa_fat_mass").v} \u2192 ${L("dexa_fat_mass").v} kg between the first and latest scan; lean mass ${has("dexa_lean") ? F("dexa_lean").v + " \u2192 " + L("dexa_lean").v + " kg" : "not measured"}.</p>` : "")) }${card(bf + vat + vfa + wt)}</div>
${reg.length || bmd.length ? `<div class="grid g3 sec">
  ${reg.some((r) => r.kind === "fat") ? `<div class="card"><h2>Fat by region \u2014 % of ideal (InBody, latest)</h2>${bars(reg.filter((r) => r.kind === "fat").map((r) => ({ label: r.part, value: r.pct, max: 120, color: "#ff7a59", text: r.pct + "%" })))}<p class="muted" style="font-size:12px">Ideal value is 100%. ${has("android_gynoid") ? `Android/gynoid ratio ${f(L("android_gynoid").v, 2)} (above 1.0 = apple-shaped fat distribution). ` : ""}${cite(...pageCites.compFat)}</p></div>` : ""}
  ${reg.some((r) => r.kind === "lean") ? `<div class="card"><h2>Lean mass by region \u2014 % of ideal (InBody, latest)</h2>${bars(reg.filter((r) => r.kind === "lean").map((r) => ({ label: r.part, value: r.pct, max: 120, color: "#3ee0c4", text: r.pct + "%" })))}<p class="muted" style="font-size:12px">Ideal value is 100%. ${cite(...pageCites.compLean)}</p></div>` : ""}
  ${bmd.length ? `<div class="card"><h2>Bone density \u2014 percentile vs peers</h2>${bmd.map((b) => pctBar(b.part, b.pct)).join("")}<p class="muted" style="font-size:12px">A normal total-body T-score can hide low percentiles at the spine, ribs or legs. ${cite(...pageCites.compBmd)}</p></div>` : ""}
</div>` : ""}
<div class="grid g2 sec">${card(ts)}${scans.length ? `<div class="card"><h2>Scan history</h2><div class="scroll" style="max-height:250px"><table class="tbl"><thead><tr><th>Date</th><th>Mass</th><th>Fat</th><th>Lean</th><th>BF%</th><th>Visceral</th><th>T</th></tr></thead><tbody>${scans.slice().reverse().map((d) => `<tr><td>${dstr(d)}</td><td>${f(at("dexa_weight", d), 1)}</td><td>${f(at("dexa_fat_mass", d), 1)}</td><td>${f(at("dexa_lean", d), 1)}</td><td>${f(at("dexa_fat_pct", d), 1)}</td><td>${at("dexa_vat", d) != null ? f(at("dexa_vat", d), 2) + " kg" : at("vfa", d) != null ? f(at("vfa", d), 1) + " cm\u00b2" : "\u2014"}</td><td>${f(at("dexa_tscore", d), 1)}</td></tr>`).join("")}</tbody></table></div><p class="muted" style="font-size:12px">Values extracted from the scan reports; compare scans from the same device and conditions.</p></div>` : ""}</div>`;
}
