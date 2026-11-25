import { shell, esc, creditHtml, handoff, myIds, vis, KIND_LABEL, trunc } from "../lib/app.js";
import { md } from "../lib/md.js";
import { mountChart } from "../lib/plot.js";

let convId = null;
let mode = "grounded";
let convo = [];

const SUGGEST = ["Give me an overview of what is on these drawings", "Which instruments measure level, and where?", "What control loops exist and what do they control?", "What looks uncertain and needs engineer review?", "What did the historian record for PT 14085 over the last 7 days?", "Which drawing tags have no confident historian match?", "Plot PT 14085 over the last 7 days"];

export default async function render(ctx) {
  ctx.content.innerHTML = shell("ask", `<div class="chat"><aside class="card left"><button class="btn" id="new" type="button">+ New chat</button><div class="small muted" style="margin-top:6px">YOUR CHATS</div><div id="convs"><p class="muted small">Loading…</p></div></aside>
<section class="card"><div class="row" style="justify-content:space-between"><div><h2 style="margin:0">Ask the plant</h2><div class="muted small" id="st">Loading the plant graph…</div></div><div class="seg" id="mode"><button type="button" data-m="grounded">Grounded Q&amp;A</button><button type="button" data-m="troubleshooting">Troubleshooting</button></div></div>
<div class="log" id="log"></div><div class="sugg" id="sugg"></div><div class="row"><textarea id="q" class="in" rows="2" style="flex:1" placeholder="Ask about a tag, a line, a loop…"></textarea><button class="btn" id="go" type="button">Ask</button></div><p class="muted small" id="err"></p><p class="muted small">Answers come only from the graph extracted from the drawings and from the historian snapshot (hourly averages of the last 7 days, not live data). Both can contain errors, and historian matches are automatic unless a reviewer decided. Check anything safety-relevant against the drawing and with an engineer.</p></section></div>${creditHtml()}`);
  const $ = (s) => ctx.content.querySelector(s);
  const log = $("#log");
  ctx.content.querySelector("main.page")?.classList.add("askwide");
  ctx.content.querySelector(".topin")?.classList.add("askwide");
  // Assistant replies are rendered as markdown (escaped first); the reader's own messages stay plain text.
  const setMsg = (el, t) => { if (el.classList.contains("assistant")) el.innerHTML = md(t); else el.textContent = t; };
  const stick = () => { if (log.scrollHeight - log.scrollTop - log.clientHeight < 140) log.scrollTop = log.scrollHeight; };
  const bubble = (role, text) => { const d = document.createElement("div"); d.className = "msg " + role; setMsg(d, text); log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
  let syms = [], conns = [], loops = [], qa = [], sheets = [], hist = [];
  try {
    const v = "1=1";
    [sheets, syms, conns, loops, qa, hist] = await Promise.all([
      ctx.db.rows(`SELECT drawing_id, title FROM sheets WHERE ok AND ${v} LIMIT 100`, [], ctx.signal),
      ctx.db.rows(`SELECT drawing_id, symbol_id, kind, type, tag, conf, connected FROM symbols WHERE ${v} LIMIT 6000`, [], ctx.signal),
      ctx.db.rows(`SELECT drawing_id, from_id, to_id, line_number, medium, border_side FROM connections WHERE ${v} LIMIT 9000`, [], ctx.signal),
      ctx.db.rows(`SELECT drawing_id, loop, sensor_tag, controller_tag, final_tag FROM loops WHERE ${v} LIMIT 1500`, [], ctx.signal),
      ctx.db.rows(`SELECT drawing_id, tag, kind, reason, severity FROM qa WHERE ${v} LIMIT 3000`, [], ctx.signal),
      ctx.db.rows(`SELECT conversation_id, mode, role, content, __corvic_inserted_at AS at FROM chats ORDER BY __corvic_inserted_at LIMIT 2000`, [], ctx.signal).catch(() => []),
    ]);
  } catch (e) { if (ctx.signal.aborted) return; ctx.reportError(e); $("#st").textContent = "The plant graph could not be loaded."; return; }
  if (ctx.signal.aborted) return;
  const byId = new Map(syms.map((s) => [s.symbol_id, s]));
  const title = new Map(sheets.map((s) => [s.drawing_id, s.title]));
  const sh = (id) => `sheet ${Number(String(id).slice(-2)) || id} (${title.get(id) || id})`;
  const lbl = (s) => (s ? s.tag || `${KIND_LABEL[s.kind] || s.kind}${s.type ? " " + s.type : ""} [${s.symbol_id}]` : "sheet edge");
  $("#st").textContent = `${syms.length} items and ${conns.length} connections on ${sheets.length} sheets`;
  const find = (q) => { q = String(q || "").toLowerCase().trim(); return syms.filter((s) => q && ((s.tag || "").toLowerCase().includes(q) || (s.type || "").toLowerCase().includes(q))); };
  const nb = (s) => {
    const o = (side) => conns.filter((c) => c[side] === s.symbol_id);
    return { coming_in: o("to_id").map((c) => ({ from: lbl(byId.get(c.from_id)), line: c.line_number, medium: c.medium })), going_out: o("from_id").map((c) => ({ to: c.to_id ? lbl(byId.get(c.to_id)) : "sheet edge " + c.border_side, line: c.line_number, medium: c.medium })) };
  };
  const tools = {
    find_tag: { description: "Find items whose tag or type contains the text.", parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false }, run: ({ text }) => find(text).slice(0, 15).map((s) => ({ tag: s.tag, kind: s.kind, type: s.type, sheet: sh(s.drawing_id), connected: s.connected })) },
    neighbours: { description: "What comes into and goes out of a tag.", parameters: { type: "object", properties: { tag: { type: "string" } }, required: ["tag"], additionalProperties: false }, run: ({ tag }) => find(tag).filter((s) => (s.tag || "").toLowerCase() === String(tag).toLowerCase()).slice(0, 4).map((s) => ({ tag: s.tag, sheet: sh(s.drawing_id), ...nb(s) })) },
    path_between: { description: "Shortest connection path between two tags on the same sheet.", parameters: { type: "object", properties: { from_tag: { type: "string" }, to_tag: { type: "string" } }, required: ["from_tag", "to_tag"], additionalProperties: false }, run: ({ from_tag, to_tag }) => {
      const a = syms.filter((s) => (s.tag || "").toLowerCase() === String(from_tag).toLowerCase()), b = syms.filter((s) => (s.tag || "").toLowerCase() === String(to_tag).toLowerCase());
      for (const s of a) { const t = b.find((x) => x.drawing_id === s.drawing_id); if (!t) continue;
        const adj = new Map(); for (const c of conns) if (c.drawing_id === s.drawing_id && c.to_id) { (adj.get(c.from_id) || adj.set(c.from_id, []).get(c.from_id)).push(c.to_id); (adj.get(c.to_id) || adj.set(c.to_id, []).get(c.to_id)).push(c.from_id); }
        const prev = new Map([[s.symbol_id, null]]); const qu = [s.symbol_id];
        while (qu.length) { const x = qu.shift(); if (x === t.symbol_id) break; for (const y of adj.get(x) || []) if (!prev.has(y)) { prev.set(y, x); qu.push(y); } }
        if (!prev.has(t.symbol_id)) continue; const p = []; for (let x = t.symbol_id; x; x = prev.get(x)) p.unshift(lbl(byId.get(x))); return { sheet: sh(s.drawing_id), path: p }; }
      return { path: null, note: "No path found in the extracted graph (the tags may be on different sheets or a connection was missed)." }; } },
    loops_for_tag: { description: "Control loops that include a tag.", parameters: { type: "object", properties: { tag: { type: "string" } }, required: ["tag"], additionalProperties: false }, run: ({ tag }) => { const t = String(tag).toLowerCase(); return loops.filter((l) => [l.sensor_tag, l.controller_tag, l.final_tag].some((x) => (x || "").toLowerCase() === t)).slice(0, 10).map((l) => ({ loop: l.loop, sensor: l.sensor_tag, controller: l.controller_tag, final_element: l.final_tag, sheet: sh(l.drawing_id) })); } },
    items_on_sheet: { description: "List tagged items on a sheet (sheet number 0-11 for samples), of one kind or 'any'.", parameters: { type: "object", properties: { sheet: { type: "string" }, kind: { type: "string" } }, required: ["sheet", "kind"], additionalProperties: false }, run: ({ sheet, kind }) => { const ids = sheets.filter((s) => s.drawing_id.endsWith("-" + String(sheet).padStart(2, "0")) || (s.title || "").toLowerCase().includes(String(sheet).toLowerCase())).map((s) => s.drawing_id); return syms.filter((s) => ids.includes(s.drawing_id) && s.tag && (!kind || s.kind === kind || kind === "any")).slice(0, 60).map((s) => ({ tag: s.tag, kind: s.kind, type: s.type })); } },
    qa_items: { description: "Flagged or uncertain items, optionally for one tag (empty string for all).", parameters: { type: "object", properties: { tag: { type: "string" } }, required: ["tag"], additionalProperties: false }, run: ({ tag }) => qa.filter((q) => !tag || (q.tag || "").toLowerCase().includes(String(tag).toLowerCase())).filter((q) => q.severity !== "info").slice(0, 25).map((q) => ({ tag: q.tag, kind: q.kind, severity: q.severity, reason: q.reason, sheet: sh(q.drawing_id) })) },
  };
  // ---- Historian: tag matches, tags and 7 days of hourly averages (a snapshot, not live) ----
  let matches = [], htags = [], hstats = [], hdaily = [], decs = [], histNote = "";
  try {
    [matches, htags, hstats, hdaily, decs] = await Promise.all([
      ctx.db.rows(`SELECT drawing_id, tag, type, c1_id, c1_name, c1_score, c2_id, c2_name, c2_score, c3_id, c3_name, c3_score, reason, other_claims, status FROM matches LIMIT 2000`, [], ctx.signal),
      ctx.db.rows(`SELECT tag_id, tag_name, descriptor, eng_units, area FROM histtags LIMIT 2000`, [], ctx.signal),
      ctx.db.rows(`SELECT tag_id, count(value) AS points, avg(value) AS avg, min(value) AS mn, max(value) AS mx, arg_max(value, hour) FILTER (WHERE value IS NOT NULL) AS last_value, strftime(max(hour), '%Y-%m-%d %H:%M') AS last_hour, strftime(min(hour), '%Y-%m-%d %H:%M') AS first_hour, sum(non_good) AS non_good FROM hourly GROUP BY tag_id LIMIT 2000`, [], ctx.signal),
      ctx.db.rows(`SELECT tag_id, strftime(hour, '%Y-%m-%d') AS day, avg(value) AS v, sum(non_good) AS ng FROM hourly GROUP BY tag_id, strftime(hour, '%Y-%m-%d') ORDER BY tag_id, day LIMIT 4000`, [], ctx.signal),
      ctx.db.rows(`SELECT drawing_id, tag, action, hist_tag_id, hist_tag_name, reviewer FROM (SELECT drawing_id, tag, action, hist_tag_id, hist_tag_name, reviewer, row_number() OVER (PARTITION BY drawing_id, tag ORDER BY __corvic_inserted_at DESC) AS rn FROM decisions) WHERE rn = 1 LIMIT 3000`, [], ctx.signal).catch(() => []),
    ]);
  } catch (e) { if (ctx.signal.aborted) return; ctx.reportError(e); histNote = "The historian data could not be loaded, so historian questions cannot be answered right now."; }
  if (ctx.signal.aborted) return;
  const r2 = (x) => (x == null || !Number.isFinite(Number(x)) ? null : Math.round(Number(x) * 100) / 100);
  const norm = (s) => String(s || "").toUpperCase().replace(/^[^.]*\./, "").replace(/\.(DACA\.)?(PV|MEAS|OUT)$/, "").replace(/[ _/-]/g, "");
  const hById = new Map(htags.map((h) => [String(h.tag_id), h]));
  const hStat = new Map(hstats.map((s) => [String(s.tag_id), s]));
  const hDaily = new Map(); for (const d of hdaily) { const k = String(d.tag_id); if (!hDaily.has(k)) hDaily.set(k, []); hDaily.get(k).push({ day: d.day, average: r2(d.v), non_good: Number(d.ng) || 0 }); }
  const decBy = new Map(decs.map((d) => [d.drawing_id + "|" + d.tag, d]));
  const eff = matches.map((m) => {
    const d = decBy.get(m.drawing_id + "|" + m.tag);
    const cands = [[m.c1_id, m.c1_name, m.c1_score], [m.c2_id, m.c2_name, m.c2_score], [m.c3_id, m.c3_name, m.c3_score]].filter((c) => c[0] != null).map((c) => ({ historian_tag: c[1], score: c[2], id: String(c[0]) }));
    const o = { drawing_id: m.drawing_id, sheet: sh(m.drawing_id), tag: m.tag, type: m.type, status: m.status, confidence: m.c1_score, reason: m.reason, other_drawing_tags_wanting_it: Math.max(0, (m.other_claims || 0) - 1), candidates: cands, reviewer_decision: null, hid: m.status === "Unmatched" ? null : String(m.c1_id), historian_tag: m.status === "Unmatched" ? null : m.c1_name };
    if (d && d.action === "reject") { o.status = "Rejected by reviewer"; o.hid = null; o.historian_tag = null; o.confidence = null; o.reviewer_decision = `rejected by ${d.reviewer || "a reviewer"}`; }
    else if (d) { o.status = "Confirmed by reviewer"; o.hid = String(d.hist_tag_id); o.historian_tag = d.hist_tag_name || hById.get(o.hid)?.tag_name || null; o.confidence = (cands.find((c) => c.id === o.hid) || {}).score ?? null; o.reviewer_decision = `${d.action === "pick" ? "picked" : "accepted"} by ${d.reviewer || "a reviewer"}`; }
    return o;
  });
  const outMatch = (o) => ({ drawing_tag: o.tag, sheet: o.sheet, type: o.type, status: o.status, historian_tag: o.historian_tag, confidence: o.confidence, reason: o.reason, closest_candidates: o.candidates.map((c) => `${c.historian_tag} (${Math.round((c.score || 0) * 100)}%)`), reviewer_decision: o.reviewer_decision, other_drawing_tags_wanting_the_same_historian_tag: o.other_drawing_tags_wanting_it });
  const readingsOf = (hid) => { const h = hById.get(String(hid)); if (!h) return null; const s = hStat.get(String(hid)); return { historian_tag: h.tag_name, description: h.descriptor, units: h.eng_units, area: h.area || null, period_utc: s ? `${s.first_hour} to ${s.last_hour}` : null, hourly_points: s ? Number(s.points) : 0, average: s ? r2(s.avg) : null, min: s ? r2(s.mn) : null, max: s ? r2(s.mx) : null, last_hourly_average: s ? r2(s.last_value) : null, last_hour_utc: s ? s.last_hour : null, non_good_readings: s ? Number(s.non_good) || 0 : null, daily_averages: hDaily.get(String(hid)) || [] }; };
  const resolveHist = (text) => {
    const n = norm(text); if (!n) return { err: "no tag given" };
    const direct = htags.filter((h) => norm(h.tag_name) === n);
    if (direct.length === 1) return { hid: String(direct[0].tag_id), how: "historian tag name" };
    const ms = eff.filter((o) => norm(o.tag) === n);
    if (!ms.length) return { err: `No historian tag or drawing tag found for "${text}".` };
    const withHist = ms.filter((o) => o.hid);
    if (!withHist.length) return { err: `Drawing tag ${ms[0].tag} has no confident historian match (status: ${ms[0].status}).`, match: outMatch(ms[0]) };
    return { hid: withHist[0].hid, how: `drawing tag ${withHist[0].tag} on ${withHist[0].sheet}, status ${withHist[0].status}`, match: outMatch(withHist[0]) };
  };
  const none = { type: "object", properties: {}, required: [], additionalProperties: false };
  Object.assign(tools, {
    historian_overview: { description: "How many drawing tags are auto-matched, need review or are unmatched against the historian, how many historian tags are on no drawing, and what period the readings cover. Call this for general historian questions.", parameters: none, run: () => {
      if (histNote) return { note: histNote };
      const c = {}; for (const o of eff) c[o.status] = (c[o.status] || 0) + 1;
      const used = new Set(eff.filter((o) => o.hid).map((o) => o.hid));
      const per = hstats[0];
      return { drawing_tags_matched_against_historian: eff.length, by_status: c, historian_tags: htags.length, historian_tags_not_on_any_drawing: htags.filter((h) => !used.has(String(h.tag_id))).length, hourly_average_period_utc: per ? `${per.first_hour} to ${per.last_hour}` : null, note: "Snapshot of hourly averages, not live. Matches are automatic unless a reviewer decided." }; } },
    historian_match_for_tag: { description: "The historian tag matched to a drawing tag (for example 'PT 14085'), with status, confidence, reason, the closest candidates and any reviewer decision.", parameters: { type: "object", properties: { tag: { type: "string" } }, required: ["tag"], additionalProperties: false }, run: ({ tag }) => {
      if (histNote) return { note: histNote };
      const n = norm(tag); const ms = eff.filter((o) => norm(o.tag) === n);
      if (!ms.length) { const near = eff.filter((o) => n && norm(o.tag).includes(n)).slice(0, 8).map((o) => o.tag); return { found: false, note: "No drawing tag with a matching result (placeholder tags such as 'TE XXX' and tags without a number are not matched).", similar: near }; }
      return ms.slice(0, 4).map(outMatch); } },
    historian_readings: { description: "7-day hourly-average readings of a historian tag, given either the historian tag name (like 'U100.PT14085.PV' or 'PT14085') or a drawing tag (like 'PT 14085'): units, average, min, max, last value, daily averages and the count of non-Good readings.", parameters: { type: "object", properties: { tag: { type: "string" } }, required: ["tag"], additionalProperties: false }, run: ({ tag }) => {
      if (histNote) return { note: histNote };
      const r = resolveHist(tag); if (!r.hid) return r;
      const out = readingsOf(r.hid); return { found_by: r.how, match: r.match || null, ...out }; } },
    find_historian_tag: { description: "Search historian tags by words in the tag name or description (for example 'temperature' or 'FT10'), with units, area and the drawing tags matched to each.", parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false }, run: ({ text }) => {
      if (histNote) return { note: histNote };
      const t = String(text || "").toLowerCase().trim(), n = norm(text); if (!t) return [];
      return htags.filter((h) => String(h.tag_name).toLowerCase().includes(t) || String(h.descriptor || "").toLowerCase().includes(t) || (n && norm(h.tag_name).includes(n))).slice(0, 12).map((h) => { const ms = eff.filter((o) => o.hid === String(h.tag_id)); return { historian_tag: h.tag_name, description: h.descriptor, units: h.eng_units, area: h.area || null, drawing_tags: ms.slice(0, 5).map((o) => `${o.tag} (${o.sheet})`), on_any_drawing: ms.length > 0 }; }); } },
    match_review_items: { description: "Drawing tags whose historian match needs review or is unmatched, least certain first. Give a sheet number 0-11 or an empty string for all sheets.", parameters: { type: "object", properties: { sheet: { type: "string" } }, required: ["sheet"], additionalProperties: false }, run: ({ sheet }) => {
      if (histNote) return { note: histNote };
      const s = String(sheet || "").trim();
      return eff.filter((o) => (o.status === "Needs review" || o.status === "Unmatched") && (!s || o.drawing_id.endsWith("-" + s.padStart(2, "0")))).sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0)).slice(0, 25).map(outMatch); } },
    historian_tags_not_on_drawings: { description: "Historian tags that no drawing tag is matched to (spares or tags missing from the drawings).", parameters: none, run: () => {
      if (histNote) return { note: histNote };
      const used = new Set(eff.filter((o) => o.hid).map((o) => o.hid));
      return htags.filter((h) => !used.has(String(h.tag_id))).slice(0, 40).map((h) => ({ historian_tag: h.tag_name, description: h.descriptor, units: h.eng_units, area: h.area || null })); } },
  });
  // ---- Charts: the assistant picks what to plot, the page draws it from the data it read ----
  // A chart is saved with its answer as a small recipe (which tags, or the match-status bars) and redrawn from the
  // live data whenever the chat is shown, so charts survive a refresh, a change of page and reopening an old chat.
  let pendingCharts = [];
  const CHART_MARK = /\n*\[\[charts:(\[.*\])\]\]\s*$/s;
  const chartMark = (recipes) => (recipes.length ? `\n\n[[charts:${JSON.stringify(recipes)}]]` : "");
  const splitMsg = (content) => {
    const s = String(content ?? ""); const m = CHART_MARK.exec(s); if (!m) return { text: s, charts: [] };
    let charts = []; try { charts = JSON.parse(m[1]); } catch { charts = []; }
    charts = (Array.isArray(charts) ? charts : []).slice(0, 4).filter((c) => c && (c.k === "b" || (c.k === "l" && Array.isArray(c.ids) && c.ids.length && c.ids.length <= 4 && c.ids.every((i) => typeof i === "string" && hById.has(i))))).map((c) => (c.k === "b" ? { k: "b" } : { k: "l", ids: c.ids }));
    return { text: s.slice(0, m.index), charts };
  };
  const barSpec = () => {
    const ids = [...new Set(eff.map((o) => o.drawing_id))].sort();
    const defs = [["Auto-matched", "#16a34a"], ["Confirmed by reviewer", "#991d85"], ["Needs review", "#f59e0b"], ["Unmatched", "#dc2626"], ["Rejected by reviewer", "#7f1d1d"]];
    return { kind: "bars", title: "Historian match status of drawing tags, by sheet (current)", categories: ids.map((id) => "S" + (Number(id.slice(-2)) || id)), segments: defs.map(([name, color]) => ({ name, color, values: ids.map((id) => eff.filter((o) => o.drawing_id === id && o.status === name).length) })) };
  };
  const specFor = async (rc) => {
    if (rc.k === "b") return barSpec();
    const hs = rc.ids.map((i) => hById.get(String(i))).filter(Boolean); if (!hs.length) return null;
    const series = []; for (const h of hs) { const pts = await hourlyOf(h.tag_id); if (ctx.signal.aborted) return null; series.push({ name: shortName(h.tag_name), pts }); }
    const u = hs[0].eng_units || "";
    return { kind: "line", units: u, series, title: `${series.map((s) => s.name).join(", ")} \u00b7 ${u || "no units given"} \u00b7 hourly average, last 7 days (UTC)` };
  };
  const addCharts = (after, recipes) => {
    if (!recipes.length || !after.parentNode) return;
    const cb = document.createElement("div"); cb.className = "chartbox"; after.after(cb);
    (async () => { for (const rc of recipes) { let spec = null; try { spec = await specFor(rc); } catch (e) { if (!ctx.signal.aborted) ctx.reportError(e); } if (ctx.signal.aborted || !cb.isConnected) return; if (spec) { cb.appendChild(mountChart(spec, ctx.signal)); stick(); } } if (!cb.children.length) cb.remove(); })();
  };
  const hourlyOf = (hid) => ctx.db.rows(`SELECT hour, value, non_good FROM hourly WHERE tag_id = ? ORDER BY hour LIMIT 400`, [String(hid)], ctx.signal);
  const shortName = (n) => String(n || "").replace(/^[^.]*\./, "");
  Object.assign(tools, {
    plot_historian_readings: { description: "Draw a line chart under your answer of the 7-day hourly averages of one to four historian tags. Give historian tag names like 'PT14085' or drawing tags like 'PT 14085'. Tags with the same units share one chart; hours with non-Good readings are marked red. The page draws the picture, you cannot see it: you get the numbers behind it, so describe those in a sentence or two.", parameters: { type: "object", properties: { tags: { type: "array", items: { type: "string" } } }, required: ["tags"], additionalProperties: false }, run: async ({ tags }) => {
      if (histNote) return { note: histNote };
      const asked = (Array.isArray(tags) ? tags : []).map((t) => String(t || "").trim()).filter(Boolean).slice(0, 4);
      if (!asked.length) return { error: "No tag was given." };
      const problems = [], picked = [], seen = new Set();
      for (const t of asked) { const r = resolveHist(t); if (!r.hid) { problems.push({ tag: t, problem: r.err }); continue; } if (seen.has(r.hid)) continue; seen.add(r.hid); picked.push({ asked: t, hid: r.hid, how: r.how }); }
      const groups = new Map(); const summary = [];
      for (const p of picked) {
        const h = hById.get(p.hid); const pts = await hourlyOf(p.hid); if (ctx.signal.aborted) return { error: "cancelled" };
        const vals = pts.map((x) => x.value).filter((v) => v != null && Number.isFinite(Number(v))).map(Number);
        summary.push({ historian_tag: h.tag_name, found_by: p.how, units: h.eng_units || null, hourly_points: vals.length, average: vals.length ? r2(vals.reduce((a, b) => a + b, 0) / vals.length) : null, min: vals.length ? r2(Math.min(...vals)) : null, max: vals.length ? r2(Math.max(...vals)) : null, non_good_readings: pts.reduce((a, x) => a + (Number(x.non_good) || 0), 0) });
        const u = h.eng_units || ""; if (!groups.has(u)) groups.set(u, []); groups.get(u).push({ hid: p.hid });
      }
      for (const [, series] of groups) pendingCharts.push({ k: "l", ids: series.map((s) => s.hid) });
      return { charts_drawn: groups.size, note: groups.size > 1 ? "Tags have different units, so they are drawn as separate charts." : "The chart is shown under your answer.", series: summary, problems };
    } },
    plot_match_summary: { description: "Draw a bar chart under your answer of the historian match status of the drawing tags, one bar per sheet (auto-matched, needs review, unmatched, and reviewer decisions). The page draws it; you get the totals.", parameters: none, run: () => {
      if (histNote) return { note: histNote };
      const segments = barSpec().segments;
      pendingCharts.push({ k: "b" });
      const totals = {}; for (const s of segments) totals[s.name] = s.values.reduce((a, b) => a + b, 0);
      return { chart_drawn: true, drawing_tags: eff.length, totals_by_status: totals, note: "The chart is shown under your answer." };
    } },
  });
  if (!histNote) $("#st").textContent += ` \u00b7 ${htags.length} historian tags, ${eff.length} matched`;

  const convs = () => {
    const m = new Map();
    for (const h of hist) { if (!m.has(h.conversation_id)) m.set(h.conversation_id, { id: h.conversation_id, first: h.role === "user" ? h.content : "", mode: h.mode }); else if (!m.get(h.conversation_id).first && h.role === "user") m.get(h.conversation_id).first = h.content; }
    return [...m.values()].reverse();
  };
  const paintConvs = () => { const list = convs(); $("#convs").innerHTML = list.map((c) => `<button type="button" class="conv${c.id === convId ? " on" : ""}" data-id="${esc(c.id)}">${esc(trunc(c.first || "(chat)", 46))}</button>`).join("") || `<p class="muted small">No chats yet.</p>`; };
  const paintLog = () => { log.innerHTML = ""; convo.forEach((m) => { const b = bubble(m.role, m.content); if (m.charts && m.charts.length) addCharts(b, m.charts); }); $("#sugg").innerHTML = convo.length ? "" : SUGGEST.map((s) => `<button type="button" class="chip">${esc(s)}</button>`).join(""); ctx.content.querySelectorAll("#mode button").forEach((b) => b.classList.toggle("on", b.dataset.m === mode)); };
  const open = (id) => { convId = id; const rows = hist.filter((h) => h.conversation_id === id); convo = rows.map((h) => { const s = h.role === "assistant" ? splitMsg(h.content) : { text: h.content, charts: [] }; return { role: h.role, content: s.text, charts: s.charts }; }); mode = rows[0]?.mode || mode; paintLog(); paintConvs(); };
  if (!convId) { convId = crypto.randomUUID(); convo = []; }
  paintConvs(); paintLog();
  $("#new").addEventListener("click", () => { convId = crypto.randomUUID(); convo = []; paintLog(); paintConvs(); }, { signal: ctx.signal });
  $("#convs").addEventListener("click", (e) => { const b = e.target.closest(".conv"); if (b) open(b.dataset.id); }, { signal: ctx.signal });
  $("#mode").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { mode = b.dataset.m; paintLog(); } }, { signal: ctx.signal });
  const go = $("#go"), q = $("#q"), err = $("#err");
  const ask = async (text) => {
    text = String(text || "").trim(); if (!text) return;
    err.textContent = ""; q.value = ""; $("#sugg").innerHTML = ""; go.disabled = true;
    const cid = convId, md = mode; pendingCharts = [];
    convo.push({ role: "user", content: text }); bubble("user", text);
    const out = bubble("assistant", "…");
    try {
      const system = await ctx.chat.prompt(md === "grounded" ? "grounded" : "troubleshooting", { words: md === "grounded" ? 150 : 220 });
      const reply = await ctx.chat.ask([{ role: "system", content: system }, ...convo.slice(-12).map(({ role, content }) => ({ role, content }))], { signal: ctx.signal, tools, onReply: (s) => { setMsg(out, s); stick(); } });
      const textOut = reply.text || "I could not produce an answer. Try asking about a specific tag.";
      setMsg(out, textOut);
      const recipes = pendingCharts.slice(0, 4); pendingCharts = [];
      addCharts(out, recipes); convo.push({ role: "assistant", content: textOut, charts: recipes });
      const rows = [{ conversation_id: cid, mode: md, role: "user", content: text.slice(0, 11000) }, { conversation_id: cid, mode: md, role: "assistant", content: textOut.slice(0, 11000) + chartMark(recipes) }];
      try { await ctx.write.rows("chats", rows, { signal: ctx.signal }); hist.push(...rows); paintConvs(); } catch (we) { if (we?.kind === "write-sign-in-required") err.textContent = "Login to keep your chat history."; else if (!ctx.signal.aborted) ctx.reportError(we); }
    } catch (e) {
      if (ctx.signal.aborted) return;
      out.remove(); convo.pop(); q.value = text;
      err.textContent = e?.kind === "chat-sign-in-required" ? "Login to use the app." : (e?.message || "The assistant could not answer.");
    } finally { go.disabled = false; }
  };
  go.addEventListener("click", () => ask(q.value), { signal: ctx.signal });
  q.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q.value); } }, { signal: ctx.signal });
  $("#sugg").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (b) ask(b.textContent); }, { signal: ctx.signal });
  if (handoff.q) { const h = handoff.q; handoff.q = ""; ask(h); }
}
