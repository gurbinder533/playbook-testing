import { loadData, chrome, showError, gate, esc } from "../lib/core.js";
import { R, SRC, AHC, pmUrl } from "../lib/refs.js";
import { citedKeys } from "../lib/cited.js";

export default async function render(ctx) {
  const main = chrome(ctx, "references");
  let st;
  try { st = await loadData(ctx); } catch (e) { showError(ctx, main, e); return; }
  if (ctx.signal.aborted) return;
  if (gate(main, st, "Literature references", '<p class="sub">This tab lists only the literature cited in the analysis on the other tabs, so it stays empty until records exist.</p>')) return;
  let cited;
  try { cited = citedKeys(st); } catch (e) { showError(ctx, main, e); return; }
  const x = cited.x || { pm: [], src: [], ahc: [] };
  const rows = [...cited.c].filter((k) => R[k]).map((k) => ({ k, pmid: R[k][0], who: R[k][1], title: R[k][2], url: pmUrl(k) }));
  for (const r of x.pm) if (!rows.some((q) => q.pmid === r.pmid)) rows.push({ k: "p" + r.pmid, pmid: r.pmid, who: r.label, title: r.title, url: r.url });
  rows.sort((a, b) => a.who.localeCompare(b.who));
  const ahcRows = [...cited.a].filter((k) => AHC[k]).map((k) => AHC[k]);
  for (const r of x.ahc) if (!ahcRows.some((q) => q[0] === r.url)) ahcRows.push([r.url, r.inst, r.title, !!r.blocked]);
  ahcRows.sort((a, b) => a[1].localeCompare(b[1]) || a[2].localeCompare(b[2]));
  const srcRows = [...cited.s].filter((k) => SRC[k]).map((k) => SRC[k]);
  for (const r of x.src) if (!srcRows.some((q) => q[0] === r.url)) srcRows.push([r.url, r.title]);
  if (!rows.length && !ahcRows.length && !srcRows.length) {
    main.innerHTML = `<h1>Literature references</h1><div class="card upnote"><b>Nothing cited yet.</b> None of the analysis on the other tabs cites literature for the records. References appear here when it does.</div>`;
    return;
  }
  const draw = (q) => {
    const s = (q || "").toLowerCase(), list = rows.filter((r) => !s || (r.title + r.who + r.pmid).toLowerCase().includes(s));
    main.querySelector("#rows").innerHTML = list.map((r) => `<tr><td><a href="${r.url}" target="_blank" rel="noopener"><b>PMID ${r.pmid}</b></a></td><td>${esc(r.title)}</td><td class="muted">${esc(r.who)}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">No matches</td></tr>`;
    main.querySelector("#cnt").textContent = list.length + " of " + rows.length;
  };
  main.innerHTML = `
<h1>Literature references</h1>
<p class="sub">Only the literature cited in the analysis on the other tabs for the records: ${rows.length} PubMed record${rows.length === 1 ? "" : "s"}, ${ahcRows.length} health-centre article${ahcRows.length === 1 ? "" : "s"} and ${srcRows.length} published protocol${srcRows.length === 1 ? "" : "s"}. A literature link shows that evidence exists on the topic; it does not mean the study was done in people like you.</p>
${rows.length ? `<div class="card"><h2>PubMed (${rows.length})</h2><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><input id="q" type="search" placeholder="Filter by topic, author or PMID" style="flex:1;min-width:220px;padding:8px 12px;border-radius:10px;border:1px solid var(--line);background:#0c1530;color:var(--ink)"><span class="muted" id="cnt"></span></div>
<div class="scroll" style="max-height:560px;margin-top:10px"><table class="tbl"><thead><tr><th>PubMed</th><th>Title</th><th>First author / journal</th></tr></thead><tbody id="rows"></tbody></table></div></div>` : ""}
${ahcRows.length ? `<div class="card sec"><h2>Academic health centre articles (${ahcRows.length})</h2><p class="muted">Reference articles and practice summaries from Mayo Clinic, Cleveland Clinic, Johns Hopkins and Harvard Health. They are patient-education and clinical-practice summaries rather than peer-reviewed studies, so they are shown separately from PubMed. Johns Hopkins pages blocked our automated link check; open them in your browser to confirm.</p><div class="scroll" style="max-height:420px"><table class="tbl"><thead><tr><th>Institution</th><th>Article</th></tr></thead><tbody>${ahcRows.map((a) => `<tr><td>${esc(a[1])}</td><td><a href="${a[0]}" target="_blank" rel="noopener">${esc(a[2])}</a>${a[3] ? ' <span class="muted">(link check blocked)</span>' : ""}</td></tr>`).join("")}</tbody></table></div></div>` : ""}
${srcRows.length ? `<div class="card sec"><h2>Published protocols cited (non-PubMed)</h2><p class="muted">The biohackers' own published material that the Protocols tab cites for this person's protocols. Practice-based, not peer-reviewed; sponsor mentions and book or event promotions appear on some pages.</p><ul class="t">${srcRows.map((s) => `<li><a href="${s[0]}" target="_blank" rel="noopener">${esc(s[1])}</a></li>`).join("")}</ul></div>` : ""}
<div class="card sec"><h2>Method &amp; limits</h2><ul class="t"><li>Values were extracted from the source PDFs, photographs and handwritten notes with an AI vision model, then unit-harmonised (e.g. mg/dL \u2192 mmol/L) and merged by test date. A reading with the same marker and date as an existing one replaces it rather than duplicating it, and any converted value is labelled in the Trends table.</li><li>Some handwriting is uncertain; the original documents are the source of truth.</li><li>Reference ranges come from the printed lab ranges where available, otherwise from guidelines; ranges differ between labs, ages, sexes and populations (female ranges are applied when the records say so).</li><li>Multi-metric signals and root causes are hypotheses to take to a clinician, not diagnoses.</li></ul></div>`;
  const q = main.querySelector("#q");
  if (q) { draw(""); q.addEventListener("input", () => draw(q.value), { signal: ctx.signal }); }
}
