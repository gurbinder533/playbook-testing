import { shell, esc, creditHtml, trunc } from "../lib/app.js";
import { showOn } from "../lib/tagcard.js";

// Page state lives at module level so it survives ctx.reload() after a decision is saved.
let sheetSel = "all", statusSel = "all", q = "", reviewer = "", openKey = null, flash = "";

const ST = {
  auto: { label: "Auto-matched", cls: "auto" },
  review: { label: "Needs review", cls: "review" },
  unmatched: { label: "Unmatched", cls: "unm" },
  confirmed: { label: "Confirmed by reviewer", cls: "conf" },
  off: { label: "Not on any drawing", cls: "off" },
};
const band = (s) => (s >= 0.92 ? "hi" : s >= 0.7 ? "mid" : "lo");
const bar = (s) => (s == null ? `<span class="muted">—</span>` : `<span class="tmbar ${band(s)}"><i style="width:${Math.round(s * 100)}%"></i></span><b class="tmpct">${Math.round(s * 100)}%</b>`);
const badge = (k) => `<span class="tmb ${ST[k].cls}">${esc(ST[k].label)}</span>`;
const sheetNo = (id) => Number(String(id).slice(-2));
const ms = (h) => (h instanceof Date ? h.getTime() : new Date(h).getTime());

export default async function render(ctx) {
  ctx.content.innerHTML = shell("tags", `<h1>Tag matching</h1><p class="muted">Each instrument tag read from the drawings is matched to a tag in the plant historian, with a confidence score. Close calls go to a reviewer. Your decisions are saved and override the automatic match.</p>
<div id="flash" class="notice info" hidden></div>
<div class="tmpills" id="pills"></div>
<div class="card" style="margin-top:14px"><div class="row"><label class="small muted">Sheet <select id="sheet" class="in" style="width:auto"></select></label><label class="small muted">Status <select id="status" class="in" style="width:auto"></select></label><input id="q" class="in" type="search" placeholder="Search a tag, historian tag or type" style="flex:1;min-width:200px"><label class="small muted">Reviewing as <input id="rev" class="in" placeholder="your name" maxlength="120" style="width:170px"></label></div><p class="muted small" id="srcnote" style="margin:8px 0 0"></p></div>
<div class="card" style="margin-top:14px"><h2 style="margin-top:0">Review queue <span class="muted small" id="qn"></span></h2><p class="muted small" style="margin-top:-6px">Least certain first. Accept the best candidate, pick another, or reject if none is right.</p><div id="queue"><p class="muted">Loading…</p></div></div>
<div class="card" style="margin-top:14px"><h2 style="margin-top:0">All tags <span class="muted small" id="tn"></span></h2><div id="list"><p class="muted">Loading…</p></div></div>
<datalist id="allh"></datalist><aside class="tmside" id="side" hidden></aside>${creditHtml()}`);
  const $ = (s) => ctx.content.querySelector(s);
  if (showOn.sheet) { sheetSel = showOn.sheet; showOn.sheet = ""; }
  if (flash) { const f = $("#flash"); f.textContent = flash; f.hidden = false; flash = ""; }
  let sheets = [], base = [], hist = [], decs = [], tagN = 0, span = null, decErr = "";
  try {
    [sheets, base, hist, decs, tagN, span] = await Promise.all([
      ctx.db.rows(`SELECT drawing_id, title FROM sheets WHERE ok AND source = 'sample' ORDER BY drawing_id LIMIT 60`, [], ctx.signal),
      ctx.db.rows(`SELECT match_key, drawing_id, tag, type, c1_id, c1_name, c1_score, c2_id, c2_name, c2_score, c3_id, c3_name, c3_score, reason, other_claims, same_area, status FROM matches LIMIT 2000`, [], ctx.signal),
      ctx.db.rows(`SELECT tag_id, tag_name, descriptor, eng_units, area FROM histtags LIMIT 2000`, [], ctx.signal),
      ctx.db.rows(`SELECT drawing_id, tag, action, hist_tag_id, hist_tag_name, reviewer, decided_at FROM (SELECT drawing_id, tag, action, hist_tag_id, hist_tag_name, reviewer, __corvic_inserted_at AS decided_at, row_number() OVER (PARTITION BY drawing_id, tag ORDER BY __corvic_inserted_at DESC) AS rn FROM decisions) WHERE rn = 1 LIMIT 3000`, [], ctx.signal).catch((e) => { if (!ctx.signal.aborted) { ctx.reportError(e); decErr = String(e?.message || e).slice(0, 160); } return []; }),
      ctx.db.rows(`SELECT count(DISTINCT drawing_id || '|' || tag) AS n FROM tags WHERE source = 'sample' AND trim(coalesce(tag, '')) <> ''`, [], ctx.signal).then((r) => r[0]?.n ?? 0),
      ctx.db.rows(`SELECT strftime(min(hour), '%Y-%m-%d') AS a, strftime(max(hour), '%Y-%m-%d') AS b FROM hourly`, [], ctx.signal).then((r) => r[0] || null),
    ]);
  } catch (e) { if (ctx.signal.aborted) return; ctx.reportError(e); $("#list").innerHTML = `<p class="muted">The tag matches could not be loaded yet. Run the Tag matching pipeline and reload.</p>`; $("#queue").innerHTML = ""; return; }
  if (ctx.signal.aborted) return;
  if (decErr) { const f = $("#flash"); f.textContent = `Reviewer decisions could not be loaded (${decErr}). Counts and colours show the automatic matches only.`; f.hidden = false; }
  if (!base.length) { $("#list").innerHTML = `<p class="muted">No matches yet. Run the Tag matching pipeline, then reload.</p>`; $("#queue").innerHTML = ""; return; }

  const title = new Map(sheets.map((s) => [s.drawing_id, s.title]));
  const histById = new Map(hist.map((h) => [String(h.tag_id), h]));
  const histByName = new Map(hist.map((h) => [String(h.tag_name).toLowerCase(), h]));
  const dec = new Map(decs.map((d) => [d.drawing_id + "|" + d.tag, d]));
  const sheetLabel = (id) => `Sheet ${sheetNo(id)}`;

  // The match each tag has now: the automatic one, unless a reviewer decided.
  const rows = base.map((r, i) => {
    const d = dec.get(r.match_key);
    const o = { ...r, i, d, reviewed: !!d };
    if (!d) {
      o.key = r.status === "Auto-matched" ? "auto" : r.status === "Needs review" ? "review" : "unmatched";
      o.hid = o.key === "unmatched" ? null : String(r.c1_id);
      o.score = r.c1_score;
      o.why = r.reason;
    } else if (d.action === "reject") {
      o.key = "unmatched"; o.hid = null; o.score = null; o.why = `rejected by ${d.reviewer || "a reviewer"}`;
    } else {
      o.key = "confirmed"; o.hid = String(d.hist_tag_id);
      const c = [[r.c1_id, r.c1_score], [r.c2_id, r.c2_score], [r.c3_id, r.c3_score]].find((x) => x[0] != null && String(x[0]) === o.hid);
      o.score = c ? c[1] : null; o.why = `${d.action === "pick" ? "picked" : "accepted"} by ${d.reviewer || "a reviewer"}`;
    }
    o.hname = o.hid ? (histById.get(o.hid)?.tag_name || d?.hist_tag_name || "") : "";
    return o;
  });
  const used = new Set(rows.filter((r) => r.hid).map((r) => r.hid));
  const offs = hist.filter((h) => !used.has(String(h.tag_id)));
  const count = (k) => rows.filter((r) => r.key === k).length;
  const skipped = Math.max(0, Number(tagN) - base.length);

  $("#allh").innerHTML = hist.map((h) => `<option value="${esc(h.tag_name)}"></option>`).join("");
  $("#pills").innerHTML = [["auto", count("auto")], ["review", count("review")], ["unmatched", count("unmatched")], ["off", offs.length], ["confirmed", count("confirmed")]].map(([k, n]) => `<button type="button" class="tmpill ${ST[k].cls}${statusSel === k ? " on" : ""}" data-st="${k}"><b>${n}</b><span>${esc(ST[k].label)}</span></button>`).join("");
  $("#sheet").innerHTML = `<option value="all">All sheets</option>` + sheets.map((s) => `<option value="${esc(s.drawing_id)}">${sheetLabel(s.drawing_id)} · ${esc(trunc(s.title || "", 30))}</option>`).join("");
  $("#status").innerHTML = `<option value="all">All statuses</option>` + Object.keys(ST).map((k) => `<option value="${k}">${esc(ST[k].label)}</option>`).join("");
  $("#sheet").value = sheetSel; $("#status").value = statusSel; $("#q").value = q;
  $("#srcnote").textContent = `${hist.length} historian tags` + (span?.a && span?.b ? ` \u00b7 hourly averages ${String(span.a).slice(0, 10)} to ${String(span.b).slice(0, 10)}` : "") + ` \u00b7 ${base.length} drawing tags matched` + (skipped ? ` \u00b7 ${skipped} without a readable number (such as "TE XXX") skipped` : "");
  try { const me = await ctx.reader(ctx.signal); if (!reviewer) reviewer = me?.name || me?.email || ""; } catch { /* anonymous reader: they type a name */ }
  if (ctx.signal.aborted) return;
  $("#rev").value = reviewer;

  const candidates = (r) => [[r.c1_id, r.c1_name, r.c1_score], [r.c2_id, r.c2_name, r.c2_score], [r.c3_id, r.c3_name, r.c3_score]].filter((c) => c[0] != null);
  const deciders = (r) => `<div class="cands">${candidates(r).map((c, j) => { const h = histById.get(String(c[0])); return `<div class="cand${r.hid === String(c[0]) ? " cur" : ""}"><div class="cn"><b>${esc(c[1])}</b><small>${esc(h?.descriptor || "")}${h?.eng_units ? " · " + esc(h.eng_units) : ""}${h?.area === r.drawing_id ? " · same sheet" : ""}</small></div><div class="cs">${bar(c[2])}</div><button type="button" class="btn sm${j ? " ghost" : ""}" data-act="${j ? "pick" : "accept"}" data-i="${r.i}" data-h="${esc(String(c[0]))}">${j ? "Pick" : "Accept"}</button></div>`; }).join("")}<div class="cand oth"><input class="in" list="allh" placeholder="Pick another historian tag…" data-other="${r.i}" maxlength="80"><button type="button" class="btn sm ghost" data-act="other" data-i="${r.i}">Use</button><button type="button" class="btn sm danger" data-act="reject" data-i="${r.i}">Reject</button></div></div>`;

  const visible = () => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (sheetSel === "all" || r.drawing_id === sheetSel) && (statusSel === "all" || r.key === statusSel)
      && (!s || r.tag.toLowerCase().includes(s) || (r.hname || r.c1_name || "").toLowerCase().includes(s) || (r.type || "").toLowerCase().includes(s)));
  };
  const drawQueue = () => {
    const pend = rows.filter((r) => !r.reviewed && (r.key === "review" || r.key === "unmatched") && (sheetSel === "all" || r.drawing_id === sheetSel)).sort((a, b) => a.score - b.score || a.drawing_id.localeCompare(b.drawing_id) || a.tag.localeCompare(b.tag));
    $("#qn").textContent = `${pend.length} waiting`;
    $("#queue").innerHTML = pend.length ? pend.slice(0, 30).map((r) => `<div class="rq"><div class="rqh"><a data-open="${r.i}" class="tg">${esc(r.tag)}</a><a href="sheet/${encodeURIComponent(r.drawing_id)}" data-show="1" data-tag="${esc(r.tag)}" class="small">Show on drawing</a><span class="muted small">${sheetLabel(r.drawing_id)} · ${esc(r.type || "")}</span>${badge(r.key === "review" ? "review" : "unmatched")}<span class="small">${esc(r.why)}${r.other_claims > 1 ? ` · ${r.other_claims - 1} other drawing tag${r.other_claims > 2 ? "s" : ""} want the same tag` : ""}</span></div>${deciders(r)}</div>`).join("") + (pend.length > 30 ? `<p class="muted small">Showing the 30 least certain of ${pend.length}. Decide some, or narrow by sheet.</p>` : "") : `<p class="muted">Nothing waiting for review${sheetSel === "all" ? "" : " on this sheet"}.</p>`;
  };
  const drawList = () => {
    if (statusSel === "off") {
      const s = q.trim().toLowerCase();
      const l = offs.filter((h) => (sheetSel === "all" || h.area === sheetSel || !h.area) && (!s || String(h.tag_name).toLowerCase().includes(s) || String(h.descriptor || "").toLowerCase().includes(s)));
      $("#tn").textContent = `${l.length} historian tag${l.length === 1 ? "" : "s"}`;
      $("#list").innerHTML = l.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Historian tag</th><th>Description</th><th>Units</th><th>Area</th><th>Status</th></tr></thead><tbody>${l.map((h) => `<tr class="clk" data-open="h:${esc(String(h.tag_id))}"><td><b>${esc(h.tag_name)}</b></td><td>${esc(h.descriptor || "")}</td><td>${esc(h.eng_units || "")}</td><td>${esc(h.area || "—")}</td><td>${badge("off")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">No historian tags here.</p>`;
      return;
    }
    const l = visible().sort((a, b) => a.drawing_id.localeCompare(b.drawing_id) || a.tag.localeCompare(b.tag));
    $("#tn").textContent = `${l.length} tag${l.length === 1 ? "" : "s"}`;
    $("#list").innerHTML = l.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Drawing tag</th><th>Sheet</th><th>Type</th><th>Best historian tag</th><th>Confidence</th><th>Status</th><th>Reason</th></tr></thead><tbody>${l.slice(0, 400).map((r) => `<tr class="clk" data-open="${r.i}"><td><b>${esc(r.tag)}</b></td><td>${sheetLabel(r.drawing_id)}</td><td>${esc(trunc(r.type || "", 28))}</td><td>${r.hname ? esc(r.hname) : `<span class="muted">${r.reviewed ? "none" : "closest: " + esc(r.c1_name || "—")}</span>`}</td><td class="nw">${bar(r.score)}</td><td>${badge(r.key)}</td><td class="small">${esc(r.why)}</td></tr>`).join("")}</tbody></table></div>${l.length > 400 ? `<p class="muted small">Showing 400 of ${l.length}. Use the filters to narrow.</p>` : ""}` : `<p class="muted">No tags match these filters.</p>`;
  };

  // Side card: tag details and a 7-day trend of the matched historian tag.
  const side = $("#side");
  let trendFor = 0;
  const spark = (pts) => {
    const v = pts.filter((p) => p.value != null && Number.isFinite(p.value)); if (v.length < 2) return "";
    const W = 300, H = 96, P = 6; const ts = v.map((p) => ms(p.hour)); const t0 = Math.min(...ts), t1 = Math.max(...ts) || t0 + 1;
    const ys = v.map((p) => p.value); let lo = Math.min(...ys), hi = Math.max(...ys); if (hi === lo) { hi += 1; lo -= 1; }
    const pt = v.map((p, k) => `${(P + ((ts[k] - t0) / (t1 - t0 || 1)) * (W - 2 * P)).toFixed(1)},${(H - P - ((p.value - lo) / (hi - lo)) * (H - 2 * P)).toFixed(1)}`).join(" ");
    const bad = v.map((p, k) => (p.non_good > 0 ? `<circle cx="${(P + ((ts[k] - t0) / (t1 - t0 || 1)) * (W - 2 * P)).toFixed(1)}" cy="${(H - P - ((p.value - lo) / (hi - lo)) * (H - 2 * P)).toFixed(1)}" r="2.4" fill="#dc2626"/>` : "")).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="spark" role="img" aria-label="7-day trend"><polyline points="${pt}" fill="none" stroke="#991d85" stroke-width="1.6" stroke-linejoin="round"/>${bad}</svg><div class="muted small tmrng"><span>${esc(String(new Date(t0).toISOString().slice(5, 10)))}</span><span>min ${lo.toFixed(1)} \u00b7 max ${hi.toFixed(1)}</span><span>${esc(String(new Date(t1).toISOString().slice(5, 10)))}</span></div>`;
  };
  const fillTrend = async (hid, unitsFallback) => {
    const my = ++trendFor; const box = side.querySelector("#trend"); if (!box) return;
    try {
      const pts = await ctx.db.rows(`SELECT hour, value, non_good FROM hourly WHERE tag_id = ? ORDER BY hour LIMIT 400`, [String(hid)], ctx.signal);
      if (ctx.signal.aborted || my !== trendFor) return;
      const bad = pts.reduce((a, p) => a + (Number(p.non_good) || 0), 0);
      const vals = pts.map((p) => p.value).filter((v) => v != null && Number.isFinite(v));
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      box.innerHTML = vals.length > 1 ? `${spark(pts)}<dl class="kv" style="margin-top:8px"><dt>Average (7 days)</dt><dd>${avg.toFixed(2)} ${esc(unitsFallback || "")}</dd><dt>Hourly points</dt><dd>${vals.length}</dd><dt>Non-Good readings</dt><dd>${bad}${bad ? " (red dots)" : ""}</dd></dl>` : `<p class="muted small">No hourly readings for this tag in the last 7 days.</p>`;
    } catch (e) { if (ctx.signal.aborted) return; ctx.reportError(e); box.innerHTML = `<p class="muted small">The trend could not be loaded.</p>`; }
  };
  const openSide = (k) => {
    openKey = k; if (k == null) { side.hidden = true; return; }
    let h, head;
    if (String(k).startsWith("h:")) { h = histById.get(String(k).slice(2)); head = `<div class="ptype">Historian tag</div><div class="ptag">${esc(h?.tag_name || "")}</div><div class="pname">${badge("off")} Not matched to any drawing tag</div>`; }
    else {
      const r = rows[Number(k)]; if (!r) { side.hidden = true; return; }
      h = r.hid ? histById.get(r.hid) : null;
      head = `<div class="ptype">${esc(r.type || "Drawing tag")} \u00b7 ${sheetLabel(r.drawing_id)}</div><div class="ptag">${esc(r.tag)}</div><div class="pname">${badge(r.key)} ${r.score != null ? Math.round(r.score * 100) + "% \u00b7 " : ""}${esc(r.why)}</div>${h ? `<h4>Matched historian tag</h4><div><b>${esc(h.tag_name)}</b></div><div class="muted small">${esc(h.descriptor || "")}${h.eng_units ? " \u00b7 " + esc(h.eng_units) : ""}${h.area ? " \u00b7 " + esc(h.area) : ""}</div>` : `<p class="muted small">No historian tag is matched to this drawing tag.</p>`}`;
      head += `<h4>${r.hid ? "Change the decision" : "Candidates"}</h4>${deciders(r)}<p class="small" style="margin-top:12px"><a href="sheet/${encodeURIComponent(r.drawing_id)}" data-show="1" data-tag="${esc(r.tag)}">Show on drawing</a></p>`;
    }
    side.hidden = false;
    side.innerHTML = `<button class="px" type="button" aria-label="Close" data-close="1">\u2715</button>${head}${h ? `<h4>Last 7 days</h4><div id="trend"><p class="muted small">Loading\u2026</p></div>` : ""}`;
    if (h) fillTrend(h.tag_id, h.eng_units);
  };

  const redraw = () => { drawQueue(); drawList(); };
  redraw();
  if (openKey != null) openSide(openKey);
  const setPills = () => ctx.content.querySelectorAll("#pills .tmpill").forEach((b) => b.classList.toggle("on", b.dataset.st === statusSel));

  $("#sheet").addEventListener("change", (e) => { sheetSel = e.target.value; redraw(); }, { signal: ctx.signal });
  $("#status").addEventListener("change", (e) => { statusSel = e.target.value; setPills(); redraw(); }, { signal: ctx.signal });
  $("#q").addEventListener("input", (e) => { q = e.target.value; drawList(); }, { signal: ctx.signal });
  $("#rev").addEventListener("input", (e) => { reviewer = e.target.value; }, { signal: ctx.signal });
  $("#pills").addEventListener("click", (e) => { const b = e.target.closest("[data-st]"); if (!b) return; statusSel = statusSel === b.dataset.st ? "all" : b.dataset.st; $("#status").value = statusSel; setPills(); redraw(); }, { signal: ctx.signal });

  const say = (m) => { const f = $("#flash"); f.textContent = m; f.hidden = !m; };
  ctx.content.addEventListener("click", async (e) => {
    const sh = e.target.closest("a[data-show]"); if (sh) { showOn.tag = sh.dataset.tag; showOn.go = true; return; }
    const c = e.target.closest("[data-close]"); if (c) { openSide(null); return; }
    const btn = e.target.closest("button[data-act]");
    if (btn) {
      const r = rows[Number(btn.dataset.i)]; if (!r) return;
      const who = reviewer.trim(); if (!who) { say("Enter your name in \u201cReviewing as\u201d first, so the decision can be attributed."); $("#rev").focus(); return; }
      let action = btn.dataset.act, hid = btn.dataset.h || "", hname = "";
      if (action === "other") {
        const inp = ctx.content.querySelector(`input[data-other="${r.i}"]`); const h = histByName.get(String(inp?.value || "").trim().toLowerCase());
        if (!h) { say("Choose a historian tag from the list (type to search)."); return; }
        action = "pick"; hid = String(h.tag_id);
      }
      if (action !== "reject") hname = histById.get(String(hid))?.tag_name || "";
      const was = btn.textContent; ctx.content.querySelectorAll("button[data-act]").forEach((b) => { b.disabled = true; }); btn.textContent = "Saving\u2026";
      try {
        await ctx.write.rows("decisions", [{ drawing_id: r.drawing_id, tag: r.tag, action, hist_tag_id: action === "reject" ? "" : hid, hist_tag_name: hname, reviewer: who.slice(0, 120), note: "" }], { signal: ctx.signal });
        flash = action === "reject" ? `Rejected the match for ${r.tag}.` : `${r.tag} is now matched to ${hname}.`;
        ctx.reload();
      } catch (err) {
        if (ctx.signal.aborted) return;
        ctx.content.querySelectorAll("button[data-act]").forEach((b) => { b.disabled = false; }); btn.textContent = was;
        say(err?.kind === "write-sign-in-required" ? "Login to use the app." : err?.kind === "write-session-expired" ? "Your session expired \u2014 reload and try again. Nothing was saved." : (err?.message || "The decision could not be saved."));
        if (err?.kind !== "write-invalid" && err?.kind !== "write-sign-in-required") ctx.reportError(err);
      }
      return;
    }
    const o = e.target.closest("[data-open]"); if (o && !e.target.closest("button,input")) openSide(o.dataset.open);
  }, { signal: ctx.signal });
}
