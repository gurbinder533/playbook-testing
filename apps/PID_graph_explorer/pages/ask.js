import { esc, renderChrome, loadModel, summaryText, cleanFile, handoff, emptyNote, resolveMode } from "../lib/app.js";

const AGENT = "ask";
const session = { mode: "qa", convs: [], cache: null };

const CHIPS = {
  qa: ["Give me an overview of what's on these drawings", "Which instruments measure level, and where?", "What control loops exist and what do they control?", "What looks uncertain and needs engineer review?"],
  troubleshoot: ["Level high alarm on the largest tank - where should I look first?", "A flow reading dropped to zero but the pump is running. What could explain it?", "Temperature is drifting high. What is connected that could cause it?", "Which instruments would help me confirm a blocked outlet line?"],
};

function index(model) {
  const nodes = new Map();
  for (const n of model.nodes) {
    const k = n.tag.toLowerCase();
    const cur = nodes.get(k) || { ...n, sheets: new Set() };
    cur.sheets.add(`${cleanFile(n.file)} p.${n.page}`);
    nodes.set(k, cur);
  }
  const out = new Map(), inn = new Map();
  const push = (m, k, v) => { const a = m.get(k) || []; a.push(v); m.set(k, a); };
  for (const e of model.edges) {
    const rec = { from: e.src, to: e.dst, relation: e.relation, line: e.line || undefined, confidence: e.confidence, sheet: `${cleanFile(e.file)} p.${e.page}` };
    push(out, e.src.toLowerCase(), rec); push(inn, e.dst.toLowerCase(), rec);
  }
  return { nodes, out, inn };
}

function makeTools(model, ix, uncertain) {
  const show = (n) => ({ tag: n.tag, type: n.node_type, subtype: n.subtype, name: n.name, details: n.attrs, confidence: n.confidence, sheets: [...n.sheets].slice(0, 4) });
  const obj = (props, req) => ({ type: "object", properties: props, required: req, additionalProperties: false });
  return {
    find_items: {
      description: "Search equipment, valves and instruments by tag, service name or type (for example 'level transmitter', 'pump', 'TT-105').",
      parameters: obj({ query: { type: "string" } }, ["query"]),
      run: ({ query }) => {
        const q = String(query).toLowerCase();
        const hit = [...ix.nodes.values()].filter((n) => `${n.tag} ${n.name} ${n.subtype} ${n.attrs}`.toLowerCase().includes(q));
        return { matches: hit.length, items: hit.slice(0, 25).map(show) };
      },
    },
    connections_of: {
      description: "Everything directly connected to a tag: what flows into it, what it feeds, and which instruments measure or control it.",
      parameters: obj({ tag: { type: "string" } }, ["tag"]),
      run: ({ tag }) => {
        const k = String(tag).toLowerCase();
        const n = ix.nodes.get(k);
        return { item: n ? show(n) : "not found in the extracted graph", incoming: (ix.inn.get(k) || []).slice(0, 30), outgoing: (ix.out.get(k) || []).slice(0, 30) };
      },
    },
    trace_flow: {
      description: "Follow process flow (flows_to connections) upstream or downstream from a tag, in order, to see the whole path.",
      parameters: obj({ tag: { type: "string" }, direction: { type: "string", enum: ["upstream", "downstream"] }, max_steps: { type: "integer" } }, ["tag", "direction", "max_steps"]),
      run: ({ tag, direction, max_steps }) => {
        const start = String(tag).toLowerCase();
        const limit = Math.max(1, Math.min(Number(max_steps) || 8, 12));
        const seen = new Set([start]);
        const path = [];
        let layer = [start];
        for (let depth = 1; depth <= limit && layer.length; depth++) {
          const next = [];
          for (const k of layer) {
            const edges = (direction === "upstream" ? ix.inn.get(k) : ix.out.get(k)) || [];
            for (const e of edges) {
              if (e.relation !== "flows_to") continue;
              const t = direction === "upstream" ? e.from : e.to;
              if (seen.has(t.toLowerCase())) continue;
              seen.add(t.toLowerCase()); next.push(t.toLowerCase());
              path.push({ step: depth, tag: t, via: e.line, type: ix.nodes.get(t.toLowerCase())?.node_type, sheet: e.sheet });
            }
          }
          layer = next;
          if (path.length > 60) break;
        }
        return { start: tag, direction, path: path.slice(0, 60) };
      },
    },
    instruments_on: {
      description: "The instruments and controllers attached to a piece of equipment or a line: measuring, signalling or controlling it (up to two hops).",
      parameters: obj({ tag: { type: "string" } }, ["tag"]),
      run: ({ tag }) => {
        const k = String(tag).toLowerCase();
        const rels = new Set(["measures", "signals", "controls", "drives"]);
        const first = [...(ix.inn.get(k) || []), ...(ix.out.get(k) || [])].filter((e) => rels.has(e.relation));
        const mids = new Set(first.flatMap((e) => [e.from, e.to]).map((t) => t.toLowerCase()));
        mids.delete(k);
        const second = [...mids].flatMap((m) => [...(ix.inn.get(m) || []), ...(ix.out.get(m) || [])]).filter((e) => rels.has(e.relation) && e.from.toLowerCase() !== k && e.to.toLowerCase() !== k);
        return { direct: first.slice(0, 40), indirect: second.slice(0, 40) };
      },
    },
    list_loops: {
      description: "Control and monitoring loops (sensor, controller, final element). Use variable 'any' for all of them.",
      parameters: obj({ variable: { type: "string", enum: ["any", "temperature", "level", "flow", "pressure", "other"] } }, ["variable"]),
      run: ({ variable }) => ({ loops: model.loops.filter((l) => variable === "any" || l.variable === variable).slice(0, 40).map((l) => ({ loop: l.loop_id, variable: l.variable, sensor: l.sensor_tag, controller: l.controller_tag, final_element: l.final_element_tag, description: l.description, confidence: l.confidence, sheet: `${cleanFile(l.file)} p.${l.page}` })) }),
    },
    list_uncertain: {
      description: "Items and connections the drawing reader flagged as uncertain or low-confidence.",
      parameters: obj({}, []),
      run: () => ({ items: uncertain.slice(0, 40).map((u) => ({ item: u.item, issue: u.issue, kind: u.kind, sheet: `${cleanFile(u.file)} p.${u.page}` })) }),
    },
  };
}

export default async function render(ctx) {
  const main = renderChrome(ctx, ctx.route.path);
  const routeId = ctx.route.params.conversation || null;
  main.innerHTML = `
  <div class="chat">
    <aside class="chat-side"><a class="btn btn-primary btn-block" href="ask">+ New chat</a><div class="ctl-l">Your chats</div><div id="convs" class="convs"><div class="ph">Loading...</div></div></aside>
    <section class="chat-main">
      <div class="chat-top"><div><h1>Ask the plant</h1><p id="ctx-line">Loading your plant graph...</p></div>
        <div class="seg" role="group" aria-label="Answer mode"><button type="button" data-m="qa">Grounded Q&amp;A</button><button type="button" data-m="troubleshoot">Troubleshooting</button></div></div>
      <ol class="chat-log" id="log" aria-live="polite"></ol>
      <div class="chips-row" id="starters"></div>
      <form id="cf" class="chat-form"><textarea id="cq" rows="2" placeholder="Ask about equipment, flow paths, instruments, control loops" required></textarea><button class="btn btn-primary" id="csend" type="submit">Ask</button></form>
      <p class="chat-error" id="cerr" role="alert" hidden></p>
      <p class="fine">Answers come from the graph extracted from your drawings and can contain reading errors. Check anything safety-relevant against the drawing and with an engineer.</p>
    </section>
  </div>`;
  const $ = (s) => main.querySelector(s);
  const log = $("#log"), form = $("#cf"), box = $("#cq"), err = $("#cerr"), send = $("#csend");
  const bubble = (role, text) => {
    const li = log.appendChild(document.createElement("li"));
    li.className = `msg-${role}`;
    li.textContent = text;
    log.scrollTop = log.scrollHeight;
    return li;
  };
  const paintMode = () => main.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.m === session.mode));
  const paintStarters = () => {
    $("#starters").innerHTML = session.cache && session.cache.messages.length ? "" : CHIPS[session.mode].map((c) => `<button type="button" class="chip">${esc(c)}</button>`).join("");
  };

  if (!routeId || !session.cache || session.cache.id !== routeId) session.cache = { id: routeId, messages: [] };
  paintMode(); paintStarters();
  main.querySelector(".seg").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-m]"); if (!b) return;
    session.mode = b.dataset.m; paintMode(); paintStarters();
  }, { signal: ctx.signal });
  $("#starters").addEventListener("click", (ev) => {
    const c = ev.target.closest(".chip"); if (!c) return;
    box.value = c.textContent; box.focus();
  }, { signal: ctx.signal });
  if (handoff.prefill) { box.value = handoff.prefill; handoff.prefill = ""; }

  let model, uncertain, past, hist = [];
  try {
    const t = await resolveMode(ctx.db, ctx.signal);
    [model, uncertain, past, hist] = await Promise.all([
      loadModel(ctx.db, ctx.signal),
      ctx.db.rows(`SELECT file, page, kind, item, issue FROM ${t.qa} LIMIT 300`, [], ctx.signal),
      ctx.db.rows("SELECT conversation_id AS id, arg_min(content, created_at) FILTER (WHERE role = 'user') AS title, max(created_at) AS last FROM chat_history WHERE agent_id = ? GROUP BY conversation_id ORDER BY last DESC LIMIT 30", [AGENT], ctx.signal),
      routeId && session.cache.messages.length === 0
        ? ctx.db.rows("SELECT role, content FROM chat_history WHERE agent_id = ? AND conversation_id = ? ORDER BY created_at, role DESC LIMIT 200", [AGENT, routeId], ctx.signal)
        : Promise.resolve([]),
    ]);
  } catch (e) {
    if (ctx.signal.aborted) return;
    $("#ctx-line").textContent = "Couldn't load the plant graph.";
    err.textContent = e.message || String(e); err.hidden = false; ctx.reportError(e);
    return;
  }
  if (ctx.signal.aborted) return;

  if (hist.length) session.cache.messages = hist.map((h) => ({ role: h.role, content: h.content }));
  session.cache.messages.forEach((m) => bubble(m.role, m.content));
  paintStarters();

  const convList = () => {
    const ids = new Set(past.map((p) => p.id));
    const all = [...session.convs.filter((c) => !ids.has(c.id)), ...past.map((p) => ({ id: p.id, title: p.title }))];
    const cur = session.cache.id || routeId;
    $("#convs").innerHTML = all.length
      ? all.map((c) => `<a class="conv${c.id === cur ? " on" : ""}" href="ask/${esc(c.id)}">${esc(String(c.title || "Chat").slice(0, 56))}</a>`).join("")
      : `<div class="fine">Your conversations will appear here.</div>`;
  };
  convList();

  const pidSheets = model.sheets.filter((s) => s.ok && s.is_pid).length;
  const has = model.nodes.length > 0;
  $("#ctx-line").innerHTML = has
    ? `Grounded in <b>${pidSheets}</b> sheet${pidSheets === 1 ? "" : "s"}, <b>${model.nodes.length}</b> tags and <b>${model.edges.length}</b> connections.`
    : `No graph yet. <a href="home">Upload and read a drawing</a> first, or the assistant will have nothing to look up.`;
  if (!has) log.insertAdjacentHTML("beforebegin", emptyNote("Nothing to ask about yet. Read a P&ID on the Overview first."));

  const ix = index(model);
  const tools = makeTools(model, ix, uncertain);
  const summary = summaryText(model, 5000);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = box.value.trim();
    if (!question) return;
    box.value = ""; err.hidden = true; send.disabled = true;
    $("#starters").innerHTML = "";
    bubble("user", question);
    const answer = bubble("assistant", "Looking at the drawings...");
    answer.classList.add("pending");
    try {
      const system = await ctx.chat.prompt(session.mode === "qa" ? "grounded" : "troubleshoot", { words: 200 });
      const reply = await ctx.chat.ask(
        [{ role: "system", content: system }, ...session.cache.messages.slice(-12), { role: "user", content: question }],
        { signal: ctx.signal, context: { "Plant summary": summary || "No sheets have been read yet." }, tools, onReply: (soFar) => { answer.classList.remove("pending"); answer.textContent = soFar; log.scrollTop = log.scrollHeight; } }
      );
      answer.classList.remove("pending");
      if (!reply.text) answer.textContent = "I couldn't put an answer together. Try narrowing the question.";
      if (!session.cache.id) session.cache.id = crypto.randomUUID();
      const id = session.cache.id;
      session.cache.messages.push({ role: "user", content: question }, { role: "assistant", content: reply.text });
      if (!session.convs.some((c) => c.id === id) && !past.some((p) => p.id === id)) session.convs.unshift({ id, title: question });
      convList();
      const now = Date.now();
      try {
        await ctx.write.rows("chat_history", [
          { agent_id: AGENT, conversation_id: id, message_id: crypto.randomUUID(), role: "user", content: question, created_at: new Date(now).toISOString() },
          { agent_id: AGENT, conversation_id: id, message_id: crypto.randomUUID(), role: "assistant", content: reply.text, created_at: new Date(now + 1).toISOString() },
        ], { signal: ctx.signal });
      } catch (werr) {
        if (!ctx.signal.aborted) { err.textContent = werr.kind === "write-sign-in-required" ? werr.message : "This answer wasn't saved to your history."; err.hidden = false; }
      }
    } catch (e) {
      if (ctx.signal.aborted) return;
      answer.remove();
      if (!box.value) box.value = question;
      const denied = /can't chat here|isn't offered|access/i.test(e.message || "");
      err.textContent = e.kind === "chat-sign-in-required" ? "Login to use the app." : denied ? "Chat isn't switched on for your access to this app. Everything else still works. Ask the app's owner to allow chat for your group." : e.message || "The assistant couldn't answer. Try again.";
      err.hidden = false;
    } finally {
      send.disabled = false;
    }
  }, { signal: ctx.signal });
  box.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); form.requestSubmit(); } }, { signal: ctx.signal });
}
