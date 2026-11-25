import { shell, esc, creditHtml, handoff, myIds, vis, KIND_LABEL, trunc } from "../lib/app.js";

let convId = null;
let mode = "grounded";
let convo = [];

const SUGGEST = ["Give me an overview of what is on these drawings", "Which instruments measure level, and where?", "What control loops exist and what do they control?", "What looks uncertain and needs engineer review?"];

export default async function render(ctx) {
  ctx.content.innerHTML = shell("ask", `<div class="chat"><aside class="card left"><button class="btn" id="new" type="button">+ New chat</button><div class="small muted" style="margin-top:6px">YOUR CHATS</div><div id="convs"><p class="muted small">Loading…</p></div></aside>
<section class="card"><div class="row" style="justify-content:space-between"><div><h2 style="margin:0">Ask the plant</h2><div class="muted small" id="st">Loading the plant graph…</div></div><div class="seg" id="mode"><button type="button" data-m="grounded">Grounded Q&amp;A</button><button type="button" data-m="troubleshooting">Troubleshooting</button></div></div>
<div class="log" id="log"></div><div class="sugg" id="sugg"></div><div class="row"><textarea id="q" class="in" rows="2" style="flex:1" placeholder="Ask about a tag, a line, a loop…"></textarea><button class="btn" id="go" type="button">Ask</button></div><p class="muted small" id="err"></p><p class="muted small">Answers come only from the graph extracted from the drawings and can contain reading errors. Check anything safety-relevant against the drawing and with an engineer.</p></section></div>${creditHtml()}`);
  const $ = (s) => ctx.content.querySelector(s);
  const log = $("#log");
  const bubble = (role, text) => { const d = document.createElement("div"); d.className = "msg " + role; d.textContent = text; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
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
  const convs = () => {
    const m = new Map();
    for (const h of hist) { if (!m.has(h.conversation_id)) m.set(h.conversation_id, { id: h.conversation_id, first: h.role === "user" ? h.content : "", mode: h.mode }); else if (!m.get(h.conversation_id).first && h.role === "user") m.get(h.conversation_id).first = h.content; }
    return [...m.values()].reverse();
  };
  const paintConvs = () => { const list = convs(); $("#convs").innerHTML = list.map((c) => `<button type="button" class="conv${c.id === convId ? " on" : ""}" data-id="${esc(c.id)}">${esc(trunc(c.first || "(chat)", 46))}</button>`).join("") || `<p class="muted small">No chats yet.</p>`; };
  const paintLog = () => { log.innerHTML = ""; convo.forEach((m) => bubble(m.role, m.content)); $("#sugg").innerHTML = convo.length ? "" : SUGGEST.map((s) => `<button type="button" class="chip">${esc(s)}</button>`).join(""); ctx.content.querySelectorAll("#mode button").forEach((b) => b.classList.toggle("on", b.dataset.m === mode)); };
  const open = (id) => { convId = id; const rows = hist.filter((h) => h.conversation_id === id); convo = rows.map((h) => ({ role: h.role, content: h.content })); mode = rows[0]?.mode || mode; paintLog(); paintConvs(); };
  if (!convId) { convId = crypto.randomUUID(); convo = []; }
  paintConvs(); paintLog();
  $("#new").addEventListener("click", () => { convId = crypto.randomUUID(); convo = []; paintLog(); paintConvs(); }, { signal: ctx.signal });
  $("#convs").addEventListener("click", (e) => { const b = e.target.closest(".conv"); if (b) open(b.dataset.id); }, { signal: ctx.signal });
  $("#mode").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { mode = b.dataset.m; paintLog(); } }, { signal: ctx.signal });
  const go = $("#go"), q = $("#q"), err = $("#err");
  const ask = async (text) => {
    text = String(text || "").trim(); if (!text) return;
    err.textContent = ""; q.value = ""; $("#sugg").innerHTML = ""; go.disabled = true;
    const cid = convId, md = mode;
    convo.push({ role: "user", content: text }); bubble("user", text);
    const out = bubble("assistant", "…");
    try {
      const system = await ctx.chat.prompt(md === "grounded" ? "grounded" : "troubleshooting", { words: md === "grounded" ? 150 : 220 });
      const reply = await ctx.chat.ask([{ role: "system", content: system }, ...convo.slice(-12)], { signal: ctx.signal, tools, onReply: (s) => { out.textContent = s; } });
      const textOut = reply.text || "I could not produce an answer. Try asking about a specific tag.";
      out.textContent = textOut; convo.push({ role: "assistant", content: textOut });
      const rows = [{ conversation_id: cid, mode: md, role: "user", content: text.slice(0, 11000) }, { conversation_id: cid, mode: md, role: "assistant", content: textOut.slice(0, 11000) }];
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
