import { loadData, chrome, showError, gate, esc, dstr } from "../lib/core.js";
import { citePage as cite } from "../lib/refs.js";
import { pageCites } from "../lib/pagecites.js";
import { gantt, tcolor, pill, wireGantt } from "../lib/ui.js";

export default async function render(ctx) {
  const main = chrome(ctx, "records");
  let st;
  try { st = await loadData(ctx); } catch (e) { showError(ctx, main, e); return; }
  if (ctx.signal.aborted) return;
  if (gate(main, st, "Records & genetics")) return;
  const docs = st.kinds.doc || [], grid = st.kinds.gene_grid || [];
  const byG = {};
  for (const d of docs) (byG[d.key] = byG[d.key] || []).push(d);
  const gO = Object.keys(byG).sort();
  const det = grid.filter((g) => Number(g.value) === 1), clr = grid.filter((g) => Number(g.value) === 0);
  const th = st.ev("therapy"), tmin = th.length ? Math.min(...th.map((e) => e.t)) - 20 * 864e5 : 0, tmax = th.length ? Math.max(...th.map((e) => e.t2 || e.t)) + 20 * 864e5 : 1;
  const other = (t) => st.ev(t);
  const retina = other("retina")[0], hist = other("history").concat(other("procedure")).sort((a, b) => a.t - b.t), notes = other("note").sort((a, b) => a.t - b.t), note = notes[0], excls = other("exclusion"), arts = other("artifact"), imgs = other("imaging").sort((a, b) => b.t - a.t), excl = excls[0], art = arts[0];
  const imm = [...other("vaccine"), ...other("serology"), ...other("screening")].sort((a, b) => a.t - b.t);

  main.innerHTML = `
<h1>Records &amp; genetics</h1>
<p class="sub">The documents behind every number, plus the immunity and screening history and clinician notes found in the records.</p>
<div class="grid g4">${gO.map((g) => `<div class="kpi"><div class="l">${esc(g)}</div><div class="n">${byG[g].length}</div><div class="d">${byG[g].slice(0, 2).map((d) => esc(d.title.replace(/\.[a-z]+$/i, ""))).join(", ")}${byG[g].length > 2 ? "\u2026" : ""}</div></div>`).join("")}</div>

<div class="grid gl sec">
  ${grid.length ? `<div class="card"><h2>DNA cancer-risk screen \u2014 ${det.length} of ${grid.length} cancer types carry an associated variant</h2>
    <div class="gene">${det.map((g) => `<div class="gtile det"><b>${esc(g.key)}</b><small>${esc(g.title || "variant detail not extracted")}</small></div>`).join("")}${clr.map((g) => `<div class="gtile"><span class="muted">${esc(g.key)}</span><small>no variant</small></div>`).join("")}</div>
    <div class="callout why" style="margin-top:10px"><small>How to read this</small>All flags are GWAS 'associated-with-cancer' variants, not pathogenic mutations: BRCA1/BRCA2 and TP53 were not detected. A common variant nudges risk slightly; it does not mean disease. Icons and tables were read by an AI vision model and should be confirmed against the original report. ${cite(...pageCites.recGene)}</div></div>` : ""}
  <div class="card"><h2>Immunity &amp; screening</h2>${imm.length ? "" : '<p class="muted">No vaccination, serology or screening entries in the records yet.</p>'}<table class="tbl"><tbody>${imm.map((e) => `<tr><td style="white-space:nowrap">${dstr(e.start)}</td><td><b>${esc(e.title)}</b><div class="muted" style="font-size:11.5px">${esc(e.detail)}</div></td></tr>`).join("")}</tbody></table></div>
</div>

${th.length ? `<div class="card sec"><h2>Therapy and treatment log</h2>${gantt(st, { w: 1000, ml: 170, tMin: tmin, tMax: tmax })}
  <div class="scroll" style="max-height:340px;margin-top:8px"><table class="tbl"><thead><tr><th>Therapy</th><th>Period</th><th>Sessions</th><th>Detail</th></tr></thead><tbody>${th.slice().sort((a, b) => a.t - b.t).map((e) => `<tr><td><i class="sdot" style="background:${tcolor(e.title)}"></i> <b>${esc(e.title)}</b></td><td style="white-space:nowrap">${dstr(e.start)}${e.end ? " \u2192 " + dstr(e.end) : ""}</td><td>${e.n}</td><td class="muted">${esc(e.detail)}</td></tr>`).join("")}</tbody></table></div>
  <p class="muted" style="font-size:12px;margin-top:6px">Counts and dates were transcribed from handwritten logs and are approximate. For evidence ratings of each therapy see <a href="protocols">Protocols</a>.</p></div>` : ""}

<div class="grid g2 sec">
  <div class="card"><h2>Clinician note &amp; history</h2>
    ${!notes.length && !hist.length ? '<p class="muted">No clinician notes or history entries in the records yet.</p>' : ""}<div class="scroll" style="max-height:460px">${notes.map((n) => `<div class="callout read"><small>${dstr(n.start)} \u00b7 ${esc(n.src)}</small><b>${esc(n.title)}</b><br>${esc(n.detail)}</div>`).join("")}
    ${hist.map((h) => `<div class="callout"><small>${dstr(h.start)} \u00b7 ${esc(h.type)}</small><b>${esc(h.title)}</b><br><span class="muted">${esc(h.detail)}</span></div>`).join("")}</div></div>
  <div class="card"><h2>Imaging reports (${imgs.length})</h2>${imgs.length ? "" : '<p class="muted">No imaging reports found in the uploaded files.</p>'}<div class="scroll" style="max-height:300px">${imgs.map((n) => `<div class="callout why"><small>${dstr(n.start)} \u00b7 ${esc(n.src)}</small><b>${esc(n.title)}</b><br><span class="muted">${esc(n.detail)}</span></div>`).join("")}</div>
  ${retina ? `<h3 style="margin-top:10px">Eye / retinal screening</h3><div class="callout why"><small>${dstr(retina.start)}</small>${esc(retina.detail)}</div><p class="muted" style="font-size:12px">${cite(...pageCites.recRetina)}</p>` : '<p class="muted" style="font-size:12px;margin-top:8px">No retinal / AI eye-screening report was found in the uploaded files (visual acuity and eye-pressure readings are on the Trends tab).</p>'}
  ${excls.length || arts.length ? `<h3 style="margin-top:10px">Data-quality notes (${excls.length + arts.length})</h3><div class="scroll" style="max-height:260px">${excls.map((x) => `<div class="warn"><b>Excluded \u00b7 ${esc(x.key)} ${dstr(x.start)}: ${esc(x.title)}</b><br>${esc(x.detail)}</div>`).join("")}${arts.map((x) => `<div class="warn"><b>${esc(x.title)}</b><br>${esc(x.detail)}</div>`).join("")}</div>` : ""}</div>
</div>

<div class="card sec"><h2>All source documents (${docs.length})</h2><div class="scroll"><table class="tbl"><thead><tr><th>Group</th><th>Document</th><th>Date</th><th>Values extracted</th></tr></thead><tbody>${docs.slice().sort((a, b) => a.key.localeCompare(b.key) || String(a.obs_date).localeCompare(String(b.obs_date))).map((d) => `<tr><td>${esc(d.key)}</td><td>${esc(d.title)}</td><td class="muted">${d.obs_date ? dstr(d.obs_date) : "\u2014"}</td><td>${Number(d.value) || "\u2014"}</td></tr>`).join("")}</tbody></table></div><p class="muted" style="font-size:12px;margin-top:6px">Values were extracted from scans and handwriting by an AI vision model and normalised; page-level failures were retried. Verify critical numbers against the originals.</p></div>`;
  wireGantt(main, ctx.signal);
}
