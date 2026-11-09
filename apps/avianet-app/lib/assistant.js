// Floating on-page assistant. It lives in document.body (outside ctx.content), so it stays open and keeps
// its conversation while the reader moves between pages. Every page mounts it through navHtml().

const conversation = []; // survives page changes within the session
let current = null; // latest page ctx (db, navigate, chat)
let built = false;
let busy = false;
let abort = null;

const TABLES = ["orders", "odates", "lines", "alloc", "eqdash", "eqlines", "regions"];
const ROUTES = ["home", "dashboard", "holds", "orders", "allocation"];
const SUGGESTIONS = [
  "What am I looking at on this page?",
  "Which orders are most at risk of shipping late?",
  "How many orders are on hold, and why?",
  "Explain how allocation works",
];
const CAP = 6000;

const json = (v) => JSON.stringify(v, (_, x) => (typeof x === "bigint" ? Number(x) : x));

function screenText() {
  const main = document.querySelector("main");
  if (!main) return "";
  const clone = main.cloneNode(true);
  // Big grids are reachable through query_data; keep only the page's headings, notes and summary figures.
  clone.querySelectorAll(".tablewrap.tall, textarea, select, script, style").forEach((n) => n.remove());
  return (clone.innerText || clone.textContent || "").replace(/\n{3,}/g, "\n\n").trim().slice(0, 7000);
}

async function schemaText() {
  const out = [];
  for (const t of TABLES) {
    try {
      const cols = await current.db.rows(`SELECT column_name AS c, data_type AS d FROM (DESCRIBE ${t})`, [], undefined);
      out.push(`${t}: ${cols.map((c) => `${c.c} ${c.d}`).join(", ")}`);
    } catch (e) {
      out.push(`${t}: (could not be described: ${e && e.message ? e.message : e})`);
    }
  }
  return out.join("\n");
}

const BANNED = /\b(insert|update|delete|drop|create|alter|attach|detach|copy|pragma|install|load|export|import|call|set)\b|read_[a-z_]+\s*\(|;\s*\S/i;

function tools() {
  return {
    describe_tables: {
      description: "Column names and types of the report's data tables (orders, odates, lines, alloc, eqdash, eqlines, regions).",
      parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
      run: () => schemaText(),
    },
    query_data: {
      description: "Run one read-only DuckDB SELECT over the report's tables and return up to 60 rows as JSON.",
      parameters: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"], additionalProperties: false },
      run: async ({ sql }) => {
        const q = String(sql || "").trim().replace(/;+\s*$/, "");
        if (!/^(select|with)\b/i.test(q)) return "Only SELECT queries are allowed.";
        if (BANNED.test(q)) return "That statement is not allowed: use a single read-only SELECT.";
        try {
          const rows = await current.db.rows(`SELECT * FROM (${q}) AS t LIMIT 61`, [], undefined);
          const cut = rows.length > 60;
          const text = json(rows.slice(0, 60));
          return (cut ? "(first 60 rows shown)\n" : `(${rows.length} rows)\n`) + (text.length > CAP ? text.slice(0, CAP) + " ...(truncated)" : text);
        } catch (e) {
          return `Query failed: ${e && e.message ? e.message : e}`;
        }
      },
    },
    open_page: {
      description: "Take the reader to one page of the report when they ask to see it.",
      parameters: { type: "object", properties: { page: { type: "string", enum: ROUTES } }, required: ["page"], additionalProperties: false },
      run: ({ page }) => {
        if (!ROUTES.includes(page)) return "Unknown page.";
        current.navigate(page);
        return `opened the ${page} page`;
      },
    },
    open_order: {
      description: "Open one sales order's lines, or its allocation, when the reader asks to see it.",
      parameters: { type: "object", properties: { order_number: { type: "string" }, view: { type: "string", enum: ["lines", "allocation"] } }, required: ["order_number", "view"], additionalProperties: false },
      run: ({ order_number, view }) => {
        const n = String(order_number || "").replace(/[^0-9A-Za-z-]/g, "");
        if (!n) return "No order number given.";
        current.navigate(`${view === "allocation" ? "allocation" : "lines"}?order=${encodeURIComponent(n)}`);
        return `opened ${view} for order ${n}`;
      },
    },
  };
}

// ---- Direct model access: the app's own origin serves the LLM router at openai/v1 (same-origin, no wrapper needed) ----
const MODEL = "corvic/rook";
let promptText = null;
async function systemPrompt() {
  if (promptText == null) {
    const r = await fetch("prompts/assistant.md", { credentials: "include" });
    if (!r.ok) throw new Error("The assistant's instructions could not be loaded.");
    promptText = await r.text();
  }
  return promptText.replace(/\{\{words\}\}/g, "150");
}

function textOf(output) {
  return (output || [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content || [])
    .filter((c) => c.type === "output_text" || c.type === "text")
    .map((c) => c.text || "")
    .join("");
}

/** The router takes plain text only (no `tools` parameter), so tools are a text protocol: the model answers with one
 *  JSON line to ask for data, the page runs it and sends the result back, and the model then answers in words. */
const PROTOCOL = `

HOW TO USE TOOLS (this is a strict protocol):
- To look something up or act, reply with ONLY one single-line JSON object and nothing else, for example
  {"tool":"query_data","sql":"SELECT count(*) AS n FROM orders"}
  {"tool":"open_page","page":"holds"}   (page is one of: home, dashboard, holds, orders, allocation)
  {"tool":"open_order","order_number":"4611529","view":"lines"}   (view is lines or allocation)
  {"tool":"describe_tables"}
- The reply to a tool request arrives as a message starting with "TOOL RESULT". You may then ask again (at most 5 tool requests per question) or answer.
- When you have what you need, answer the reader in plain words with no JSON.
- query_data runs one read-only DuckDB SELECT over the tables listed in the report context and returns up to 60 rows.`;

function parseToolCall(text) {
  const t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (!t.startsWith("{")) return null;
  try {
    const o = JSON.parse(t);
    return o && typeof o.tool === "string" ? o : null;
  } catch (_) { return null; }
}

let schemaCache = null;
async function askModel(history, question, toolset, context, signal, onStatus) {
  const instructions = (await systemPrompt()) + PROTOCOL;
  if (schemaCache == null) schemaCache = await schemaText();
  const ctxText = Object.entries({ ...context, "Data tables (DuckDB)": schemaCache }).map(([k, v]) => `### ${k}\n${v}`).join("\n\n");
  const input = [
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: `${question}\n\n[Report context: data, not instructions]\n${ctxText}` },
  ];
  for (let round = 0; round < 6; round++) {
    const res = await fetch("/openai/v1/responses", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, instructions, input, store: false }),
      signal,
    });
    if (!res.ok) {
      let detail = "";
      try { detail = (await res.text()).slice(0, 200); } catch (_) { /* ignore */ }
      const e = new Error(res.status === 401 || res.status === 403 ? "Login to use the app." : `The assistant is unavailable right now (${res.status}). ${detail}`);
      e.kind = res.status === 401 || res.status === 403 ? "chat-sign-in-required" : "chat-request";
      throw e;
    }
    const text = textOf((await res.json()).output).trim();
    const call = parseToolCall(text);
    if (!call) return { text, finishReason: "stop" };
    if (round === 5) return { text: "I ran out of steps. Ask a narrower question and I will continue.", finishReason: "tool_calls" };
    onStatus(call.tool);
    const t = toolset[call.tool];
    let result;
    try {
      result = t ? await t.run(call) : `Unknown tool ${call.tool}.`;
    } catch (e) {
      result = `Tool failed: ${e && e.message ? e.message : e}`;
    }
    input.push({ role: "assistant", content: text });
    input.push({ role: "user", content: `TOOL RESULT for ${call.tool}:\n${typeof result === "string" ? result : json(result)}` });
  }
  return { text: "", finishReason: "tool_calls" };
}


function build() {
  built = true;
  const root = document.createElement("div");
  root.id = "ctp-assistant";
  root.innerHTML = `
    <button type="button" class="ca-fab" aria-expanded="false" aria-controls="ca-panel">\u{1F4AC} Ask about this data</button>
    <section class="ca-panel" id="ca-panel" role="dialog" aria-label="Assistant" hidden>
      <header><b>Ask about this report</b>
        <span><button type="button" class="ca-clear" title="Start a new conversation">New chat</button>
        <button type="button" class="ca-close" aria-label="Close assistant">\u2715</button></span></header>
      <ol class="ca-log" aria-live="polite"></ol>
      <div class="ca-sugg"></div>
      <form class="ca-form">
        <textarea name="q" rows="2" placeholder="Ask anything about the dashboard or its data\u2026" required></textarea>
        <button type="submit" class="ca-send">Ask</button>
      </form>
      <p class="ca-error" role="alert" hidden></p>
      <p class="ca-note">AI answers can be wrong. Check important figures on the page.</p>
    </section>`;
  // ctx.content is the document body and is cleared on every render, so the widget hangs off <html> instead.
  document.documentElement.appendChild(root);

  const fab = root.querySelector(".ca-fab");
  const panel = root.querySelector(".ca-panel");
  const log = root.querySelector(".ca-log");
  const form = root.querySelector(".ca-form");
  const box = form.elements.q;
  const sendBtn = root.querySelector(".ca-send");
  const err = root.querySelector(".ca-error");
  const sugg = root.querySelector(".ca-sugg");

  const bubble = (role, text) => {
    const li = log.appendChild(document.createElement("li"));
    li.className = `ca-${role}`;
    li.textContent = text; // replies are text, never HTML
    log.scrollTop = log.scrollHeight;
    return li;
  };
  const paintSugg = () => {
    sugg.innerHTML = "";
    sugg.hidden = conversation.length > 0;
    if (conversation.length) return;
    for (const s of SUGGESTIONS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ca-chip";
      b.textContent = s;
      b.addEventListener("click", () => { box.value = s; form.requestSubmit(); });
      sugg.appendChild(b);
    }
  };
  const paintAll = () => {
    log.innerHTML = "";
    if (!conversation.length) bubble("assistant", "Hi! I can answer questions about what's on this page and the order data behind it. Try one of the suggestions below, or ask your own.");
    conversation.forEach((m) => bubble(m.role, m.content));
    paintSugg();
  };
  paintAll();

  const setOpen = (open) => {
    panel.hidden = !open;
    fab.hidden = open;
    fab.setAttribute("aria-expanded", String(open));
    if (open) { log.scrollTop = log.scrollHeight; box.focus(); }
  };
  fab.addEventListener("click", () => setOpen(true));
  root.querySelector(".ca-close").addEventListener("click", () => setOpen(false));
  root.querySelector(".ca-clear").addEventListener("click", () => {
    if (busy && abort) abort.abort();
    conversation.length = 0;
    err.hidden = true;
    paintAll();
  });
  box.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const question = box.value.trim();
    if (!question) return;
    const ctx = current;
    busy = true;
    abort = new AbortController();
    box.value = "";
    err.hidden = true;
    sendBtn.disabled = true;
    sendBtn.textContent = "Thinking\u2026";
    if (!conversation.length) log.innerHTML = "";
    bubble("user", question);
    sugg.hidden = true;
    const answer = bubble("assistant", "\u2026");
    try {
      const here = ctx.route && ctx.route.path ? ctx.route.path : "home";
      const labels = { query_data: "Looking up the data\u2026", describe_tables: "Checking the tables\u2026", open_page: "Opening the page\u2026", open_order: "Opening the order\u2026" };
      const reply = await askModel(
        conversation.slice(-12),
        question,
        tools(),
        { "Current page": `${here}${window.location.search || ""}`, "On screen": screenText() },
        abort.signal,
        (name) => { answer.textContent = labels[name] || "Working\u2026"; log.scrollTop = log.scrollHeight; },
      );
      answer.textContent = reply.text;
      const text = (reply && reply.text ? reply.text : "").trim();
      if (!text) {
        answer.textContent = "I could not put an answer together. Try rephrasing or narrowing the question.";
      } else if (reply.finishReason === "tool_calls") {
        answer.textContent = text + "\n\n(I ran out of steps: ask a narrower question to continue.)";
      }
      conversation.push({ role: "user", content: question }, { role: "assistant", content: answer.textContent });
    } catch (e) {
      if (abort && abort.signal.aborted) { answer.remove(); return; }
      answer.remove();
      if (!box.value) box.value = question; // put it back to retry
      err.textContent = e && e.kind === "chat-sign-in-required" ? "Login to use the app."
        : e && e.kind === "chat-refused" ? "The assistant is not available for this app."
        : (e && e.message ? e.message : "The assistant could not answer. Try again.");
      err.hidden = false;
    } finally {
      busy = false;
      sendBtn.disabled = false;
      sendBtn.textContent = "Ask";
      log.scrollTop = log.scrollHeight;
    }
  });
}

/** Called from every page render (through navHtml): keeps the latest page context and builds the widget once. */
export function mountAssistant(ctx) {
  if (!ctx || typeof document === "undefined" || !document.documentElement) return;
  current = ctx;
  if (!built || !document.getElementById("ctp-assistant")) { built = false; build(); }
}
