import { loadData, chrome, showError, gate, f, dstr, esc, M, GROUPS, groupsOf, statusOf, therapyMarks } from "../lib/core.js";
import { lineChart, seriesFor } from "../lib/charts.js";
import { metricCard, pill, bandOf, gantt, wireGantt } from "../lib/ui.js";

let grp = "Lipids", sel = null, showTh = true;
const ML = 170; // shared left gutter: y-axis ticks for the line chart, therapy names for the timeline

export default async function render(ctx) {
  const main = chrome(ctx, "trends");
  let st;
  try { st = await loadData(ctx); } catch (e) { showError(ctx, main, e); return; }
  if (ctx.signal.aborted) return;

  if (gate(main, st, "Longitudinal trends")) return;
  const GR = groupsOf(st).filter((g) => Object.keys(M).some((k) => M[k].g === g && st.series[k] && st.series[k].length));
  if (!GR.length) { main.innerHTML = `<h1>Longitudinal trends</h1><div class="card upnote"><b>No numeric markers found yet.</b> The records contain no readable test results.</div>`; return; }
  // A link from the Overview radar (`trends?g=<domain>`) pre-selects that domain.
  let want = null;
  try { want = new URLSearchParams(window.location.search).get("g"); } catch (_) { /* ignore */ }
  if (!want && window.__trendsGroup) want = window.__trendsGroup;
  if (!want) { try { want = sessionStorage.getItem("trendsGroup"); } catch (_) { /* ignore */ } }
  let wantK = null; // a protocol chip links trends?k=<marker key>
  try { wantK = new URLSearchParams(window.location.search).get("k"); } catch (_) { /* ignore */ }
  if (wantK && M[wantK] && GR.includes(M[wantK].g)) want = M[wantK].g;
  window.__trendsGroup = null; try { sessionStorage.removeItem("trendsGroup"); } catch (_) { /* ignore */ }
  if (want && GR.includes(want) && want !== grp) { grp = want; sel = null; } else if (want && GR.includes(want)) sel = null;
  if (!GR.includes(grp)) { grp = GR[0]; sel = null; }
  if (wantK && M[wantK] && M[wantK].g === grp) sel = wantK;
  const therapies = st.ev("therapy"), TH_START = therapies.length ? Math.min(...therapies.map((e) => e.t)) : null, TH_END = therapies.length ? Math.max(...therapies.map((e) => e.t2 || e.t)) : null;
  if (!therapies.length) showTh = false;
  const keysOf = (g) => Object.keys(M).filter((k) => M[k].g === g && st.series[k] && st.series[k].length);
  const draw = () => {
    const keys = keysOf(grp);
    if (!sel || !keys.includes(sel)) sel = keys[0];
    const c = M[sel], s = st.series[sel], ex = st.excl[sel] || [];
    const vals = s.map((p) => p.v), mn = Math.min(...vals), mx = Math.max(...vals), mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const all = s.concat(ex), ts = all.map((p) => p.t);
    let tMin = Math.min(...ts), tMax = Math.max(...ts);
    if (showTh && TH_START != null) { tMin = Math.min(tMin, TH_START); tMax = Math.max(tMax, TH_END); }
    const pad = (tMax - tMin) * 0.04; tMin -= pad; tMax += pad;
    const ser = seriesFor(st, sel, { color: "#5cc8ff" });
    const chart = lineChart({ series: [ser], band: bandOf(sel), marks: showTh ? therapyMarks(st) : [], w: 1000, h: 300, ml: ML, tMin, tMax, noPad: true, dp: c.dp != null ? c.dp : 2, unit: c.u, statusKey: sel, label: c.l + " over time", title: c.l + (c.u ? " (" + c.u + ")" : "") });
    main.innerHTML = `
<h1>Longitudinal trends</h1>
<p class="sub">The same marker pulled from every report it appears in, units harmonised (mg/dL \u2192 mmol/L etc.), plotted on one timeline. Dot colour = status; hollow dot = excluded reading. Click any card to inspect.</p>
<div class="btns">${GR.map((g) => `<button type="button" class="btn${g === grp ? " on" : ""}" data-g="${esc(g)}">${esc(g)} <span class="muted">${keysOf(g).length}</span></button>`).join("")}</div>
<div class="grid g4">${keys.map((k) => metricCard(st, k, k === sel)).join("")}</div>
<div class="card sec" id="detail">
  <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between"><h2 style="margin:0">${esc(c.l)}</h2><div>${pill(statusOf(sel, s[s.length - 1].v))} ${therapies.length ? `<button type="button" class="btn${showTh ? " on" : ""}" id="thtog">Therapy overlay</button>` : ""}</div></div>
  <p class="muted" style="margin:4px 0 8px">${c.rng ? "Reference: " + esc(c.rng) + ". " : ""}Latest <b>${f(s[s.length - 1].v, c.dp != null ? c.dp : 2)} ${esc(c.u || "")}</b> on ${dstr(s[s.length - 1].d)} \u00b7 min ${f(mn, c.dp)} \u00b7 mean ${f(mean, c.dp)} \u00b7 max ${f(mx, c.dp)} \u00b7 ${s.length} readings.</p>
  ${chart}
  ${showTh ? `<h3 style="margin-top:10px">Therapies and treatments recorded in the files (same time axis)</h3>${gantt(st, { w: 1000, ml: ML, tMin, tMax })}<p class="muted" style="font-size:12px">Hover, tap or focus a therapy name for the full text. Correlation on a timeline is not causation: several therapies overlap and BP, weight and labs vary day to day.</p>` : ""}
  <div class="scroll" style="max-height:260px;margin-top:10px"><table class="tbl"><thead><tr><th>Date</th><th>Value</th><th>Status</th><th>Source document</th></tr></thead><tbody>${all.slice().sort((a, b) => b.t - a.t).map((p) => `<tr style="${p.why ? "opacity:.6;text-decoration:line-through" : ""}"><td>${dstr(p.d)}</td><td><b>${f(p.v, c.dp != null ? c.dp : 2)}</b> ${esc(c.u || "")}</td><td>${p.why ? `<span class="pill flag" title="${esc(p.why)}">excluded</span>` : pill(statusOf(sel, p.v))}</td><td class="muted">${esc(p.src || "")}${p.note ? " \u2014 " + esc(p.note) : ""}${p.why ? " \u2014 " + esc(p.why) : ""}</td></tr>`).join("")}</tbody></table></div>
</div>`;
    main.querySelectorAll("[data-g]").forEach((b) => b.addEventListener("click", () => { grp = b.dataset.g; sel = null; draw(); }, { signal: ctx.signal }));
    main.querySelectorAll("[data-k]").forEach((b) => b.addEventListener("click", () => { sel = b.dataset.k; draw(); const d = main.querySelector("#detail"); if (d) d.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, { signal: ctx.signal }));
    wireGantt(main, ctx.signal);
    const tg = main.querySelector("#thtog"); if (tg) tg.addEventListener("click", () => { showTh = !showTh; draw(); }, { signal: ctx.signal });
  };
  draw();
  if (wantK) { const d = main.querySelector("#detail"); if (d) d.scrollIntoView({ block: "start" }); }
}
