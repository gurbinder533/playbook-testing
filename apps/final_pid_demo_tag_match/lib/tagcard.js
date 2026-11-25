import { esc, setImg } from "./app.js";

// Shared by the sheet page's "Historian match" view. `showOn` carries a request from the Tag matching tab
// (open this sheet in that view with this tag highlighted) and back (filter the tab to this sheet).
export const showOn = { tag: "", go: false, sheet: "" };
let reviewer = "", note = "";

const COL = { auto: "#16a34a", confirmed: "#16a34a", review: "#f59e0b", unmatched: "#dc2626", none: "#94a3b8" };
const LABEL = { auto: "Auto-matched", confirmed: "Confirmed by reviewer", review: "Needs review", unmatched: "Unmatched", none: "Placeholder / no tag" };
const CLS = { auto: "auto", confirmed: "conf", review: "review", unmatched: "unm", none: "off" };
const band = (s) => (s >= 0.92 ? "hi" : s >= 0.7 ? "mid" : "lo");
const bar = (s) => (s == null ? `<span class="muted">\u2014</span>` : `<span class="tmbar ${band(s)}"><i style="width:${Math.round(s * 100)}%"></i></span><b class="tmpct">${Math.round(s * 100)}%</b>`);
const badge = (k) => `<span class="tmb ${CLS[k]}">${esc(LABEL[k])}</span>`;
const tms = (h) => (h instanceof Date ? h.getTime() : new Date(h).getTime());

export async function drawHist(ctx, view, { id, sh, img, syms }) {
  const root = document.createElement("div");
  root.innerHTML = `<p class="muted">Loading the historian match\u2026</p>`;
  view.innerHTML = ""; view.appendChild(root);
  const alive = () => !ctx.signal.aborted && root.isConnected;
  let tg, mt, hs, ds;
  try {
    [tg, mt, hs, ds] = await Promise.all([
      ctx.db.rows(`SELECT symbol_id, tag, type FROM tags WHERE drawing_id = ? LIMIT 2000`, [id], ctx.signal),
      ctx.db.rows(`SELECT tag, type, c1_id, c1_name, c1_score, c2_id, c2_name, c2_score, c3_id, c3_name, c3_score, reason, other_claims, status FROM matches WHERE drawing_id = ? LIMIT 2000`, [id], ctx.signal),
      ctx.db.rows(`SELECT tag_id, tag_name, descriptor, eng_units, area FROM histtags LIMIT 2000`, [], ctx.signal),
      ctx.db.rows(`SELECT tag, action, hist_tag_id, hist_tag_name, reviewer FROM (SELECT tag, action, hist_tag_id, hist_tag_name, reviewer, row_number() OVER (PARTITION BY tag ORDER BY __corvic_inserted_at DESC) AS rn FROM decisions WHERE drawing_id = ?) WHERE rn = 1 LIMIT 2000`, [id], ctx.signal).catch((e) => { if (!ctx.signal.aborted) ctx.reportError(e); return []; }),
    ]);
  } catch (e) { if (!alive()) return; ctx.reportError(e); root.innerHTML = `<div class="notice">The historian match could not be loaded yet. Run the Tag matching pipeline and reload.</div>`; return; }
  if (!alive()) return;
  try { const me = await ctx.reader(ctx.signal); if (!reviewer) reviewer = me?.name || me?.email || ""; } catch { /* anonymous: they type a name */ }
  if (!alive()) return;

  const tagBySym = new Map(tg.map((t) => [t.symbol_id, t]));
  const match = new Map(mt.map((m) => [m.tag, m]));
  const dec = new Map(ds.map((d) => [d.tag, d]));
  const hById = new Map(hs.map((h) => [String(h.tag_id), h]));
  const hByName = new Map(hs.map((h) => [String(h.tag_name).toLowerCase(), h]));

  const boxes = [];
  for (const s of syms) {
    if (s.kind !== "instrument") continue;
    const t = tagBySym.get(s.symbol_id);
    const tag = String(t?.tag || s.tag || "").trim();
    const m = tag ? match.get(tag) || null : null, d = tag ? dec.get(tag) || null : null;
    const b = { s, tag, type: t?.type || s.type || "", m, d, i: boxes.length, hid: null, score: null, why: "" };
    if (!tag) { b.key = "none"; b.why = "no tag was read on this symbol"; }
    else if (d && d.action === "reject") { b.key = "unmatched"; b.why = `rejected by ${d.reviewer || "a reviewer"}`; }
    else if (d) {
      b.key = "confirmed"; b.hid = String(d.hist_tag_id);
      const c = m ? [[m.c1_id, m.c1_score], [m.c2_id, m.c2_score], [m.c3_id, m.c3_score]].find((x) => x[0] != null && String(x[0]) === b.hid) : null;
      b.score = c ? c[1] : null; b.why = `${d.action === "pick" ? "picked" : "accepted"} by ${d.reviewer || "a reviewer"}`;
    } else if (!m) { b.key = "none"; b.why = "placeholder or no number in the tag, not matched"; }
    else {
      b.key = m.status === "Auto-matched" ? "auto" : m.status === "Needs review" ? "review" : "unmatched";
      if (b.key !== "unmatched") b.hid = String(m.c1_id);
      b.score = m.c1_score; b.why = m.reason;
    }
    b.hname = b.hid ? (hById.get(b.hid)?.tag_name || d?.hist_tag_name || "") : "";
    boxes.push(b);
  }
  const n = (...ks) => boxes.filter((b) => ks.includes(b.key)).length;
  const sw = Math.max(2, sh.width / 450);

  root.innerHTML = `<div id="hnote" class="notice info" hidden></div>
<div class="legend hlg"><span><i style="background:${COL.auto}"></i>Auto-matched or confirmed <b>${n("auto", "confirmed")}</b></span><span><i style="background:${COL.review}"></i>Needs review <b>${n("review")}</b></span><span><i style="background:${COL.unmatched}"></i>Unmatched or rejected <b>${n("unmatched")}</b></span><span><i style="background:${COL.none}"></i>Placeholder / no tag <b>${n("none")}</b></span><a href="tags" id="htags">Open in Tag matching</a></div>
<div class="row" style="margin:6px 0"><label class="small muted">Reviewing as <input id="hrev" class="in" maxlength="120" placeholder="your name" style="width:170px"></label><span class="muted small">Click a box for its match. Boxes cover the ${boxes.length} instrument symbols on this sheet.</span></div>
<div class="det" id="hdet"><img alt="Original drawing"><svg viewBox="0 0 ${sh.width} ${sh.height}" preserveAspectRatio="none"></svg></div>
${mt.length ? "" : `<div class="notice info" style="margin-top:8px">Historian matching has not been run for this drawing, so every box is grey. It covers the sample sheets for now.</div>`}
<aside class="tmside" id="hside" hidden></aside>`;
  const $ = (s) => root.querySelector(s);
  if (note) { const f = $("#hnote"); f.textContent = note; f.hidden = false; note = ""; }
  $("#hrev").value = reviewer;
  $("#hrev").addEventListener("input", (e) => { reviewer = e.target.value; }, { signal: ctx.signal });
  $("#htags").addEventListener("click", () => { showOn.sheet = id; }, { signal: ctx.signal });
  const imgEl = $("#hdet img");
  setImg(imgEl, img.orig_b64, "image/jpeg");

  let sel = null;
  const hl = showOn.tag ? showOn.tag : ""; showOn.tag = "";
  const paint = () => {
    $("#hdet svg").innerHTML = boxes.map((b) => {
      const s = b.s, pad = sw * 0.8, x = s.x0 - pad, y = s.y0 - pad, w = Math.max(2, s.x1 - s.x0) + 2 * pad, h = Math.max(2, s.y1 - s.y0) + 2 * pad;
      const on = b.i === sel, hot = hl && b.tag === hl;
      return `<rect data-b="${b.i}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="${COL[b.key]}" fill-opacity="${on ? 0.4 : 0.16}" stroke="${COL[b.key]}" stroke-width="${on ? sw * 1.8 : sw}" style="cursor:pointer"><title>${esc(b.tag || "no tag")}</title></rect>${hot || on ? `<rect class="hlp" x="${(x - sw * 2).toFixed(1)}" y="${(y - sw * 2).toFixed(1)}" width="${(w + sw * 4).toFixed(1)}" height="${(h + sw * 4).toFixed(1)}" fill="none" stroke="#991d85" stroke-width="${sw * 1.6}" stroke-dasharray="${sw * 3} ${sw * 2}" pointer-events="none"/>` : ""}`;
    }).join("");
  };

  const cands = (b) => (b.m ? [[b.m.c1_id, b.m.c1_name, b.m.c1_score], [b.m.c2_id, b.m.c2_name, b.m.c2_score], [b.m.c3_id, b.m.c3_name, b.m.c3_score]].filter((c) => c[0] != null) : []);
  const deciders = (b) => `<div class="cands">${cands(b).map((c, j) => { const h = hById.get(String(c[0])); return `<div class="cand${b.hid === String(c[0]) ? " cur" : ""}"><div class="cn"><b>${esc(c[1])}</b><small>${esc(h?.descriptor || "")}${h?.eng_units ? " \u00b7 " + esc(h.eng_units) : ""}${h?.area === id ? " \u00b7 same sheet" : ""}</small></div><div class="cs">${bar(c[2])}</div><button type="button" class="btn sm${j ? " ghost" : ""}" data-act="${j ? "pick" : "accept"}" data-i="${b.i}" data-h="${esc(String(c[0]))}">${j ? "Pick" : "Accept"}</button></div>`; }).join("")}<div class="cand oth"><input class="in" list="hallh" placeholder="Pick another historian tag\u2026" data-other="${b.i}" maxlength="80"><button type="button" class="btn sm ghost" data-act="other" data-i="${b.i}">Use</button><button type="button" class="btn sm danger" data-act="reject" data-i="${b.i}">Reject</button></div></div><datalist id="hallh">${hs.map((h) => `<option value="${esc(h.tag_name)}"></option>`).join("")}</datalist>`;
  const spark = (pts) => {
    const v = pts.filter((p) => p.value != null && Number.isFinite(p.value)); if (v.length < 2) return "";
    const W = 300, H = 96, P = 6; const ts = v.map((p) => tms(p.hour)); const t0 = Math.min(...ts), t1 = Math.max(...ts) || t0 + 1;
    const ys = v.map((p) => p.value); let lo = Math.min(...ys), hi = Math.max(...ys); if (hi === lo) { hi += 1; lo -= 1; }
    const X = (k) => (P + ((ts[k] - t0) / (t1 - t0 || 1)) * (W - 2 * P)).toFixed(1), Y = (k) => (H - P - ((v[k].value - lo) / (hi - lo)) * (H - 2 * P)).toFixed(1);
    const pt = v.map((p, k) => `${X(k)},${Y(k)}`).join(" ");
    const bad = v.map((p, k) => (p.non_good > 0 ? `<circle cx="${X(k)}" cy="${Y(k)}" r="2.4" fill="#dc2626"/>` : "")).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="spark" role="img" aria-label="7-day trend"><polyline points="${pt}" fill="none" stroke="#991d85" stroke-width="1.6" stroke-linejoin="round"/>${bad}</svg><div class="muted small tmrng"><span>${esc(new Date(t0).toISOString().slice(5, 10))}</span><span>min ${lo.toFixed(1)} \u00b7 max ${hi.toFixed(1)}</span><span>${esc(new Date(t1).toISOString().slice(5, 10))}</span></div>`;
  };
  const side = $("#hside");
  let tf = 0;
  const trend = async (hid, units) => {
    const my = ++tf; const box = side.querySelector("#htrend"); if (!box) return;
    try {
      const pts = await ctx.db.rows(`SELECT hour, value, non_good FROM hourly WHERE tag_id = ? ORDER BY hour LIMIT 400`, [String(hid)], ctx.signal);
      if (!alive() || my !== tf) return;
      const bad = pts.reduce((a, p) => a + (Number(p.non_good) || 0), 0);
      const vals = pts.map((p) => p.value).filter((v) => v != null && Number.isFinite(v));
      const avg = vals.length ? vals.reduce((a, c) => a + c, 0) / vals.length : null;
      box.innerHTML = vals.length > 1 ? `${spark(pts)}<dl class="kv" style="margin-top:8px"><dt>Average (7 days)</dt><dd>${avg.toFixed(2)} ${esc(units || "")}</dd><dt>Hourly points</dt><dd>${vals.length}</dd><dt>Non-Good readings</dt><dd>${bad}${bad ? " (red dots)" : ""}</dd></dl>` : `<p class="muted small">No hourly readings for this tag in the last 7 days.</p>`;
    } catch (e) { if (!alive()) return; ctx.reportError(e); box.innerHTML = `<p class="muted small">The trend could not be loaded.</p>`; }
  };
  const openCard = (i) => {
    sel = i; paint();
    if (i == null) { side.hidden = true; return; }
    const b = boxes[i]; const h = b.hid ? hById.get(b.hid) : null;
    side.hidden = false;
    side.innerHTML = `<button class="px" type="button" aria-label="Close" data-close="1">\u2715</button><div class="ptype">${esc(b.type || "Instrument")}</div><div class="ptag">${esc(b.tag || "(no tag)")}</div><div class="pname">${badge(b.key)} ${b.score != null ? Math.round(b.score * 100) + "% \u00b7 " : ""}${esc(b.why)}</div>${h ? `<h4>Matched historian tag</h4><div><b>${esc(h.tag_name)}</b></div><div class="muted small">${esc(h.descriptor || "")}${h.eng_units ? " \u00b7 " + esc(h.eng_units) : ""}${h.area ? " \u00b7 " + esc(h.area) : ""}</div>` : `<p class="muted small">No historian tag is matched to this symbol.</p>`}${b.m ? `<h4>${b.hid ? "Change the decision" : "Candidates"}</h4>${deciders(b)}` : ""}${h ? `<h4>Last 7 days</h4><div id="htrend"><p class="muted small">Loading\u2026</p></div>` : ""}<p class="small" style="margin-top:12px"><a href="tags" data-tags="1">Open in Tag matching</a></p>`;
    if (h) trend(h.tag_id, h.eng_units);
  };
  paint();
  const first = hl ? boxes.find((b) => b.tag === hl) : null;
  if (first) { openCard(first.i); setTimeout(() => { if (alive()) imgEl.scrollIntoView({ block: "nearest" }); }, 0); }

  const say = (m) => { const f = $("#hnote"); f.textContent = m; f.hidden = !m; };
  root.addEventListener("click", async (e) => {
    if (e.target.closest("[data-close]")) { openCard(null); return; }
    if (e.target.closest("[data-tags]")) { showOn.sheet = id; return; }
    const btn = e.target.closest("button[data-act]");
    if (btn) {
      const b = boxes[Number(btn.dataset.i)]; if (!b || !b.m) return;
      const who = reviewer.trim(); if (!who) { say("Enter your name in \u201cReviewing as\u201d first, so the decision can be attributed."); $("#hrev").focus(); return; }
      let action = btn.dataset.act, hid = btn.dataset.h || "", hname = "";
      if (action === "other") {
        const inp = side.querySelector(`input[data-other="${b.i}"]`); const h = hByName.get(String(inp?.value || "").trim().toLowerCase());
        if (!h) { say("Choose a historian tag from the list (type to search)."); return; }
        action = "pick"; hid = String(h.tag_id);
      }
      if (action !== "reject") hname = hById.get(String(hid))?.tag_name || "";
      const was = btn.textContent; root.querySelectorAll("button[data-act]").forEach((x) => { x.disabled = true; }); btn.textContent = "Saving\u2026";
      try {
        await ctx.write.rows("decisions", [{ drawing_id: id, tag: b.tag, action, hist_tag_id: action === "reject" ? "" : hid, hist_tag_name: hname, reviewer: who.slice(0, 120), note: "" }], { signal: ctx.signal });
        note = action === "reject" ? `Rejected the match for ${b.tag}.` : `${b.tag} is now matched to ${hname}.`;
        showOn.tag = b.tag;
        ctx.reload();
      } catch (err) {
        if (ctx.signal.aborted) return;
        root.querySelectorAll("button[data-act]").forEach((x) => { x.disabled = false; }); btn.textContent = was;
        say(err?.kind === "write-sign-in-required" ? "Login to use the app." : err?.kind === "write-session-expired" ? "Your session expired \u2014 reload and try again. Nothing was saved." : (err?.message || "The decision could not be saved."));
        if (err?.kind !== "write-invalid" && err?.kind !== "write-sign-in-required") ctx.reportError(err);
      }
      return;
    }
    const r = e.target.closest("rect[data-b]"); if (r) openCard(Number(r.dataset.b));
  }, { signal: ctx.signal });
}
