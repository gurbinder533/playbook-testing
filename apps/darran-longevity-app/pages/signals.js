import { loadData, chrome, showError, gate, esc } from "../lib/core.js";
import * as AN from "../lib/analysis.js";
const buildSignals = AN.buildSignals, sevRank = AN.sevRank, SEV_COLOR = AN.SEV_COLOR, AHC_BY = AN.AHC_BY || {};
import { pill, evidenceTable } from "../lib/ui.js";
import { cite, ahc } from "../lib/refs.js";

let filt = "All";
let pendingJump = null; // a link such as signals?s=F5 (from a protocol chip) opens that signal

/** Short one-line label for the matrix: drops status suffixes and parentheses, cuts at a word boundary. The full title is shown on the signal's own card below. */
const brief = (t) => {
  let s = String(t || "").replace(/\s+\u2014.*$/, "").replace(/\s*\([^)]*\)/g, "").replace(/^\d+\.\s*/, "").trim();
  if (s.length <= 30) return s;
  const cut = s.slice(0, 29), i = cut.lastIndexOf(" ");
  return (i > 14 ? cut.slice(0, i) : cut).replace(/[ ,;:\/&-]+$/, "") + "\u2026";
};

export default async function render(ctx) {
  const main = chrome(ctx, "signals");
  let st;
  try { st = await loadData(ctx); } catch (e) { showError(ctx, main, e); return; }
  if (ctx.signal.aborted) return;
  if (gate(main, st, "Multi-metric signals")) return;
  const all = buildSignals(st).sort((a, b) => sevRank(b.sev) - sevRank(a.sev));
  if (!all.length) { main.innerHTML = `<h1>Multi-metric signals</h1><div class="card upnote"><b>No multi-metric signals right now.</b> None of the markers in the records is outside its reference range or on watch, or too few markers are available to form a pattern. Signals appear here automatically when the data show one.</div>`; return; }
  const doms = [...new Set(all.flatMap((s) => s.domains))];
  const draw = () => {
    const list = all.filter((s) => filt === "All" || s.sev === filt);
    main.innerHTML = `
<h1>Multi-metric signals</h1>
<p class="sub">Patterns that only appear when several markers are read together. Each card lists the evidence behind it, why the combination matters more than any single value, and what to do next. Severity, evidence values and explanations are recomputed from all records every time the page loads.</p>
<div class="card"><h2>Signal \u00d7 domain matrix</h2><p class="muted" style="font-size:12px;margin:-4px 0 8px">Click or tap a row to jump to its details below.</p><div class="scroll" style="max-height:none"><table class="tbl mx"><thead><tr><th>Signal</th>${doms.map((d) => `<th class="dm" title="${esc(d)}"><span>${esc(d)}</span></th>`).join("")}</tr></thead><tbody>${all.map((s) => `<tr class="jump" data-s="${s.id}" tabindex="0" role="link" aria-label="Go to ${s.id}: ${esc(s.title)}" title="Jump to the ${s.id} details below"><td class="sg" title="${esc(s.title)}"><b>${s.id}</b> ${esc(brief(s.title))} ${pill(s.sev)}</td>${doms.map((d) => `<td style="text-align:center">${s.domains.includes(d) ? `<i class="sdot" style="background:${SEV_COLOR[s.sev]}"></i>` : ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>
<div class="btns sec">${["All", "High", "Moderate", "Low", "Resolved"].filter((x) => x === "All" || all.some((s) => s.sev === x)).map((x) => `<button type="button" class="btn${filt === x ? " on" : ""}" data-f="${x}">${x}</button>`).join("")}</div>
<div class="grid" style="grid-template-columns:minmax(0,1fr)">${list.map((s) => `<article class="card sig ${s.sev}" id="${s.id}">
  <div class="sig-h"><b class="muted">${s.id}</b>${pill(s.sev)}<h3>${esc(s.title)}</h3></div>
  <p>${esc(s.headline)}</p>
  <div>${s.domains.map((d) => `<span class="chip hot">${esc(d)}</span>`).join("")}</div>
  ${evidenceTable(s.evidence)}
  <div class="callout why"><small>Why the combination matters</small>${esc(s.why)}</div>
  <div class="callout read"><small>Our reading</small>${esc(s.read)}</div>
  <div><small class="muted">Suggested next steps</small><ul class="t">${s.next.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>
  <div style="margin-top:6px"><small class="muted">PubMed</small><br>${cite(...s.cites)}</div>
  ${AHC_BY[s.id] ? `<div style="margin-top:4px"><small class="muted">Academic health centres</small><br>${ahc(...AHC_BY[s.id])}</div>` : ""}
</article>`).join("")}</div>`;
    const go = (id) => {
      if (filt !== "All" && !list.some((s) => s.id === id)) { filt = "All"; draw(); }
      const el = main.querySelector(`article#${id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 1800);
    };
    main.querySelectorAll("tr.jump").forEach((tr) => {
      tr.addEventListener("click", () => go(tr.dataset.s), { signal: ctx.signal });
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(tr.dataset.s); } }, { signal: ctx.signal });
    });
    main.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { filt = b.dataset.f; draw(); }, { signal: ctx.signal }));
    if (pendingJump) { const id = pendingJump; pendingJump = null; setTimeout(() => { if (!ctx.signal.aborted) go(id); }, 60); }
  };
  try { pendingJump = new URLSearchParams(window.location.search).get("s"); } catch (_) { pendingJump = null; }
  draw();
}
