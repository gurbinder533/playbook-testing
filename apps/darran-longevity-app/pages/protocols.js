import { loadData, chrome, showError, gate, esc, M, f, dstr } from "../lib/core.js";
import { buildSignals, buildCauses, analysisSnapshot } from "../lib/analysis.js";

// This tab contains NO protocol text. Every card is a row of the generated `proto` table, written by the protocol step AFTER the analysis (signals, root causes, trends, notes) was computed,
// from a fresh web search of the biohackers' published protocols and live PubMed / health-centre references. The page only lays the rows out, numbers them P1, P2 ... in the order written,
// and resolves each row's targets (a signal, a root cause or a trend, by stable key) to the live analysis so the chips link back to the other tabs.
const PM = "https://pubmed.ncbi.nlm.nih.gov/";
const safe = (u) => (/^https:\/\//.test(String(u || "")) ? String(u) : "#");
const brief = (t, n = 46) => { const s = String(t || "").replace(/\s+\u2014.*$/, "").replace(/\s*\([^)]*\)/g, "").trim(); return s.length <= n ? s : s.slice(0, n - 1).replace(/[ ,;:\/&-]+$/, "") + "\u2026"; };
const cards = (st) => (st.protocols || []).filter((p) => p.kind === "protocol");

/** Every reference the cards draw (the References tab lists exactly these, plus what the other tabs cite). */
export function protocolCites(st) {
  const pm = [], src = [], ahc = [], seen = new Set();
  for (const p of (st.protocols || []).filter((q) => q.kind === "protocol" || q.kind === "appraisal")) {
    const r = p.refs || {};
    for (const x of r.pm || []) if (x.pmid && !seen.has("p" + x.pmid)) { seen.add("p" + x.pmid); pm.push({ pmid: String(x.pmid), label: x.label || "PubMed", title: x.title || "", url: PM + x.pmid + "/" }); }
    for (const x of r.ahc || []) if (x.url && !seen.has(x.url)) { seen.add(x.url); ahc.push({ url: x.url, inst: x.inst || "", title: x.title || "", blocked: !!x.blocked }); }
    for (const x of r.src || []) if (x.url && !seen.has(x.url)) { seen.add(x.url); src.push({ url: x.url, title: x.title || x.url, who: x.who || "" }); }
  }
  return { c: new Set(), s: new Set(), a: new Set(), x: { pm, src, ahc } };
}

const pmChips = (a) => (a && a.length ? `<span class="cites">${a.map((x) => `<a class="cite" href="${PM}${esc(x.pmid)}/" target="_blank" rel="noopener" title="${esc(x.title || "")} \u2014 PMID ${esc(x.pmid)}">${esc(x.label || "PubMed")}<i>PMID ${esc(x.pmid)}</i></a>`).join("")}</span>` : "");
const ahcChips = (a) => (a && a.length ? `<span class="cites ahc">${a.map((x) => `<a class="cite" href="${esc(safe(x.url))}" target="_blank" rel="noopener" title="${esc(x.title || "")}${x.blocked ? " (blocked automated link checks)" : ""}">${esc(x.inst || "")}<i>${esc(String(x.title || "").length > 36 ? String(x.title).slice(0, 35) + "\u2026" : x.title || "")}</i></a>`).join("")}</span>` : "");
const srcChips = (a) => (a && a.length ? `<span class="cites src">${a.map((x) => { const [h, t] = String(x.title || "").split(" \u2014 "); return `<a class="cite" href="${esc(safe(x.url))}" target="_blank" rel="noopener" title="${esc(x.title || "")}${x.blocked ? " (blocked automated link checks)" : ""}">${esc(h || "")}<i>${esc(t || "")}</i></a>`; }).join("")}</span>` : "");

function trendFact(st, k) {
  const s = st.series[k], c = M[k];
  if (!s || !s.length || !c) return "";
  const dp = c.dp != null ? c.dp : 1, a = s[0], b = s[s.length - 1];
  return `${c.l}: ${s.length > 1 ? f(a.v, dp) + " \u2192 " : ""}${f(b.v, dp)} ${c.u || ""} (${dstr(b.d)})${c.rng ? " \u00b7 reference " + c.rng : ""}`.replace(/\s+/g, " ");
}

/** One target of a protocol: the chip that links back to the tab where the signal / root cause / trend is shown, the protocol step's one-line reason, and the live facts from the current analysis. */
function targetItem(st, t, L) {
  const line = t.line ? `<span class="tline">${esc(t.line)}</span>` : "";
  const gone = (what) => `<li><span class="tchip gone" title="Rebuild the protocols after the analysis changes">${esc(what)} no longer in the analysis</span>${line}</li>`;
  if (t.type === "signal") {
    const s = L.sigs.get(t.key);
    if (!s) return gone("signal");
    return `<li><a class="tchip sig" href="signals?s=${encodeURIComponent(s.id)}" title="Open signal ${esc(s.id)} on the Signals tab">Signal ${esc(s.id)} \u00b7 ${esc(brief(s.title))} \u00b7 ${esc(s.sev)}</a>${line}<div class="tfact">${esc(s.headline)}</div></li>`;
  }
  if (t.type === "rc") {
    const c = L.rcs.get(t.key);
    if (!c) return gone("root cause");
    return `<li><a class="tchip rc" href="rootcause?c=${encodeURIComponent(c.key)}" title="Open root cause ${esc(c.id)} on the Root Cause tab">Root cause ${esc(c.id)} \u00b7 ${esc(brief(c.name, 40))}</a>${line}<div class="tfact">${esc(c.conf)} \u00b7 explains ${esc(c.explains.join(", ") || "\u2014")}</div></li>`;
  }
  if (t.type === "trend") {
    if (!M[t.key] || !(st.series[t.key] || []).length) return gone("trend");
    return `<li><a class="tchip tr" href="trends?k=${encodeURIComponent(t.key)}" title="Open this trend on the Trends tab">Trend \u00b7 ${esc(brief(M[t.key].l, 38))}</a>${line}<div class="tfact">${esc(trendFact(st, t.key))}</div></li>`;
  }
  return "";
}

export default async function render(ctx) {
  const main = chrome(ctx, "protocols");
  let st;
  try { st = await loadData(ctx); } catch (e) { showError(ctx, main, e); return; }
  if (gate(main, st, "Longevity protocols")) return;
  if (ctx.signal.aborted) return;
  const snap = analysisSnapshot(st);
  const L = { sigs: new Map(buildSignals(st).map((s) => [s.key, s])), rcs: new Map(buildCauses(st).map((c) => [c.key, c])) };
  const all = st.protocols || [], P = cards(st);
  const basis = (P[0] && P[0].basis) || "";
  const stale = P.length && basis && basis !== snap.fingerprint;
  const embed = `<script type="application/json" id="analysis-snapshot">${JSON.stringify(snap).replace(/</g, "\\u003c")}</script>`;
  const head = `<h1>Longevity protocols for this person's analysis</h1>
<p class="sub">These protocols are written after the analysis, from this person's own <b>Signals</b>, <b>Root causes</b>, flagged <b>Trends</b> and the clinician and imaging notes, and matched to what Peter Attia, Bryan Johnson, Dave Asprey, Andrew Huberman and Pavel Aeon have actually published on each topic (found by a fresh web search) with PubMed and health-centre references behind them. Each card says which signals, root causes and trends it is meant to address, with a chip that opens the details on the other tab. Where none of the five has published anything on a topic, the card says so.</p>
<div class="warn"><b>Not medical advice.</b> Biohacker protocols are one person's regimen, not trials. Some biohacker pages carry affiliate links, supplement shops or sponsor mentions; only the articles are cited, never the products. The clinician who knows this person decides what to adopt, especially for blood tests, imaging, supplements and medicines.</div>`;
  if (!P.length) {
    main.innerHTML = `${head}<div class="card upnote"><b>No protocols have been written for this analysis yet.</b> Protocols are not built into the app: they are generated by a separate step that runs after the analysis (signals, root causes and trends) is complete, searches the web for the biohackers' published protocols on those findings, and writes them as cards. Run that step to fill this tab. The analysis it will use is ${snap.signals.length} signal${snap.signals.length === 1 ? "" : "s"}, ${snap.causes.length} root cause${snap.causes.length === 1 ? "" : "s"} and ${snap.trends.length} flagged trend${snap.trends.length === 1 ? "" : "s"}.</div>${embed}`;
    return;
  }
  const label = new Map(P.map((p, i) => [p.ord, "P" + (i + 1)]));
  const targeted = new Set(P.flatMap((p) => p.targets.filter((t) => t.type === "signal").map((t) => t.key)));
  const open = snap.signals.filter((s) => s.sev !== "Resolved" && !targeted.has(s.key));
  const banner = stale ? `<div class="warn"><b>The analysis has changed since these protocols were written.</b> The signals, root causes or flagged trends are not the same as when the protocols were generated (analysis fingerprint ${esc(basis)} then, ${esc(snap.fingerprint)} now), so some cards may no longer fit and new findings may have no protocol. Rebuild the protocols as the step after the analysis.</div>` : "";
  const summary = `<div class="card"><h2>Built from this analysis</h2><p class="muted" style="margin:0">${snap.signals.length} signal${snap.signals.length === 1 ? "" : "s"} (${snap.signals.filter((s) => s.sev !== "Resolved").length} unresolved), ${snap.causes.length} root cause${snap.causes.length === 1 ? "" : "s"}, ${snap.trends.length} flagged trend${snap.trends.length === 1 ? "" : "s"} \u2192 ${P.length} protocol${P.length === 1 ? "" : "s"}${P[0].generated ? `, written ${esc(P[0].generated)}` : ""}. ${P.map((p, i) => `<a href="#P${i + 1}"><b>P${i + 1}</b></a> ${esc(brief(p.title, 48))}`).join(" \u00b7 ")}</p></div>`;
  const card = (p, i) => {
    const r = p.refs || {}, who = [...new Set((r.src || []).map((x) => x.who).filter(Boolean).flatMap((w) => String(w).split(/[,;/]\s*/)))];
    return `<article class="rec" id="P${i + 1}"><div class="sig-h"><b class="muted">P${i + 1}</b>${who.map((w) => `<span class="who">${esc(w.toUpperCase())}</span>`).join("")}${p.fitT ? `<span class="fit ${esc(p.fit)}">${esc(p.fitT)}</span>` : ""}<h3 style="margin:0">${esc(p.title)}</h3></div>
<div class="callout read"><small>What it addresses for you</small><ul class="tg">${p.targets.map((t) => targetItem(st, t, L)).join("")}</ul></div>
<p style="margin-top:6px">${esc(p.what)}</p>
${p.why ? `<div class="callout why"><small>Why it can help</small>${esc(p.why)}</div>` : ""}
<div class="grid g2"><div><small class="muted">How to start</small><ul class="t">${p.how.map((h) => `<li>${esc(h)}</li>`).join("")}</ul></div>${p.caution ? `<div class="callout" style="border-color:#6b4a2d;background:#1e150b"><small>Caution</small>${esc(p.caution)}</div>` : ""}</div>
${p.whoNote ? `<p class="muted" style="font-size:12.5px">${esc(p.whoNote)}</p>` : ""}
${(r.pm || []).length ? `<div><small class="muted">PubMed evidence</small><br>${pmChips(r.pm)}</div>` : ""}${(r.ahc || []).length ? `<div><small class="muted">Academic health centres</small><br>${ahcChips(r.ahc)}</div>` : ""}${(r.src || []).length ? `<div><small class="muted">Published protocol</small><br>${srcChips(r.src)}</div>` : ""}</article>`;
  };
  const wk = all.find((p) => p.kind === "week");
  const weekDays = wk ? (wk.week || []).map(([d, a]) => [d, (a || []).filter(([o]) => label.has(o)).map(([o, t]) => `${label.get(o)} \u00b7 ${t}`)]).filter(([, a]) => a.length) : [];
  const week = weekDays.length >= 3 ? `<div class="card sec"><h2>${esc(wk.title || "A starter week")}</h2><div class="week">${weekDays.map(([d, a]) => `<div class="day"><b>${esc(d)}</b>${a.map((x) => `<span>${esc(x)}</span>`).join("")}</div>`).join("")}</div><p class="muted" style="font-size:12px;margin-top:8px">Built only from the protocols above.</p></div>` : "";
  const ap = all.filter((p) => p.kind === "appraisal");
  const GL = { hi: "Evidence-based", mid: "Partly supported", lo: "Weak / unsupported" };
  const appraisal = ap.length ? `<div class="card sec"><h2>Appraisal of treatments found in your records</h2><p class="muted">Written by the protocol step for each therapy the records name. Weak evidence is not proof of harm or of no benefit.</p><table class="tbl"><thead><tr><th>Therapy</th><th>In your records</th><th>Evidence</th><th>Level</th><th>References</th></tr></thead><tbody>${ap.map((p) => `<tr><td><b>${esc(p.title)}</b></td><td class="muted">${esc(p.what)}</td><td>${esc(p.why)}</td><td><span class="fit ${esc(p.fit)}">${esc(GL[p.fit] || p.fitT)}</span></td><td>${pmChips((p.refs || {}).pm)}${ahcChips((p.refs || {}).ahc)}</td></tr>`).join("")}</tbody></table></div>` : "";
  const uncovered = open.length ? `<div class="card upnote sec"><b>Unresolved signals without a protocol:</b> ${open.map((s) => `<a class="tchip sig" href="signals?s=${encodeURIComponent(s.id)}">Signal ${esc(s.id)} \u00b7 ${esc(brief(s.title))} \u00b7 ${esc(s.sev)}</a>`).join("")} The protocol step did not write one for these${stale ? " (they may be new since the last build)" : "; see the Signals tab for their suggested next steps"}.</div>` : "";
  main.innerHTML = `${head}${banner}${summary}<div class="grid sec" style="grid-template-columns:minmax(0,1fr)">${P.map(card).join("")}</div>${week}${appraisal}${uncovered}${embed}`;
}
