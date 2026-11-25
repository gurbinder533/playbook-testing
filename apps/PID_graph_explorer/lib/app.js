import { esc } from "@corvic/live";

export { esc };

/** Carries a question from the graph explorer to the chat page. */
export const handoff = { prefill: "" };

/** The stored target app.yaml declares under pipelines[]. */
export const PIPELINE_URL = "/pipeline/25499";

/** How many drawings one person may keep in the app. */
export const UPLOAD_LIMIT = 5;

/** Files deleted this session: a delete is not readable at once, so the page remembers it. */
export const removedFiles = new Set();

/**
 * The reader's uploaded file names. The uploads table holds the PDFs' bytes, so it is
 * never bound as a source (it outgrows the live-read limit); the artifact listing returns
 * names only, and the server decides whose files a reader gets.
 */
export async function listDrawings(signal) {
  const r = await fetch("/artifact/drawings/", { signal });
  if (!r.ok) throw new Error(`Couldn't list your uploads (${r.status}).`);
  const j = await r.json();
  const files = Array.isArray(j.artifact_file) ? j.artifact_file : [];
  return files
    .map((f) => ({ path: String(f.path || ""), mime_type: f.mime_type || "application/pdf", size: Number(f.size) || 0 }))
    .filter((f) => f.path && !removedFiles.has(f.path))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Whether adding these paths keeps a person within the limit (a path they already have replaces, not adds). */
export function uploadRoom(existing, adding, limit = UPLOAD_LIMIT) {
  const fresh = new Set(adding.filter((p) => !existing.has(p)));
  return { total: existing.size + fresh.size, allowed: existing.size + fresh.size <= limit, spare: Math.max(0, limit - existing.size) };
}

export const cleanFile = (f) =>
  String(f || "").replace(/\s*\[\s*pages?[^\]]*\]/i, "").replace(/\.pdf$/i, "");

export const fmtBytes = (n) => {
  n = Number(n) || 0;
  if (!n) return "";
  if (n > 1048576) return (n / 1048576).toFixed(1) + " MB";
  if (n > 1024) return Math.round(n / 1024) + " KB";
  return n + " B";
};

// A UMD build is not an ES module: it is a <script> awaited once and kept in <head>.
export function loadScript(src) {
  const existing = document.head.querySelector(`script[src="${src}"]`);
  if (existing) return existing.corvicLoaded;
  const script = document.createElement("script");
  script.src = src;
  script.corvicLoaded = new Promise((resolve, reject) => {
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error(`could not load ${src}`)));
  });
  document.head.append(script);
  return script.corvicLoaded;
}

const LOGO = `<svg class="logo" viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" rx="10" fill="#5a44c4"/><g stroke="#c0b3ff" stroke-width="1.6" fill="none"><path d="M10 11 L18 18 L27 11 M18 18 L18 27 M10 11 L10 25"/></g><circle cx="10" cy="11" r="3" fill="#fff"/><circle cx="27" cy="11" r="3" fill="#fbbf24"/><circle cx="18" cy="18" r="3.4" fill="#fff"/><circle cx="18" cy="27" r="3" fill="#c0b3ff"/><circle cx="10" cy="25" r="3" fill="#7c5ce4"/></svg>`;

const TABS = [
  { path: "home", label: "Overview" },
  { path: "graph", label: "Graph explorer" },
  { path: "register", label: "Register" },
  { path: "loops", label: "Control loops" },
  { path: "qa", label: "QA review" },
  { path: "ask", label: "Ask the plant", accent: true },
];

/** Draw header + nav synchronously and return the element the page fills. */
export function renderChrome(ctx, current) {
  const base = String(current || "home").split("/")[0] || "home";
  const tabs = TABS.map(
    (t) =>
      `<a class="tab${t.accent ? " tab-accent" : ""}" href="${t.path}"${t.path === base ? ' aria-current="page"' : ""}>${t.label}</a>`
  ).join("");
  ctx.content.innerHTML = `<div class="shell"><header class="top"><a class="brand" href="home">${LOGO}<span class="brand-name">P&amp;ID Graph Studio</span></a><nav class="nav">${tabs}</nav><div class="vt" id="vt" role="group" aria-label="Data set"><button type="button" data-v="mine">My drawings</button><button type="button" data-v="sample">Sample set</button></div><span class="built">Built on <b>Corvic</b></span></header><div id="vb"></div><main id="main" class="main"></main></div>`;
  wireView(ctx);
  return ctx.content.querySelector("#main");
}

const trim = (s) => String(s ?? "").trim();

/** Every table the graph pages read, as plain arrays (each reader sees only their own). */
const MINE = { sheets: "sheets", equipment: "equipment", connections: "connections", loops: "control_loops", qa: "qa_items", sample: false };
const SAMPLE = { sheets: "sample_sheets", equipment: "sample_equipment", connections: "sample_connections", loops: "sample_loops", qa: "sample_qa_items", sample: true };

/** Which set the reader is looking at: their own drawings, or the shared sample set. */
export const view = { mode: null, auto: false, root: null };

export function paintView(root, mode, auto) {
  if (!root) return;
  root.querySelectorAll("#vt [data-v]").forEach((b) => b.classList.toggle("on", b.dataset.v === mode));
  const vb = root.querySelector("#vb");
  if (!vb) return;
  vb.innerHTML = mode === "sample"
    ? `<div class="vbanner"><b>Sample set</b><span>${auto ? "You have not read any drawings yet, so you are looking at a sample: " : ""}8 real P&amp;ID sheets from the public Pahala WWTP design-build drawings (US EPA, 2021), read by the same pipeline. Everyone sees this set. Switch to <i>My drawings</i> for your own uploads.</span></div>`
    : "";
}

/** Decide mine vs sample (a reader with nothing of their own starts on the sample), and say which tables to read. */
export async function resolveMode(db, signal) {
  // The reader's own files decide what of the graph is theirs: a deleted upload drops out of every page.
  let files = null;
  try { files = new Set((await listDrawings(signal)).map((f) => f.path)); } catch (e) { files = null; }
  if (view.mode === null || view.auto) {
    const r = await db.rows("SELECT DISTINCT file FROM sheets WHERE file <> '__seed__' LIMIT 2000", [], signal);
    const n = r.filter((x) => !files || files.has(x.file)).length;
    if (n > 0) { view.mode = "mine"; view.auto = false; } else { view.mode = "sample"; view.auto = true; }
  }
  paintView(view.root, view.mode, view.auto);
  return view.mode === "sample" ? SAMPLE : { ...MINE, files };
}

function wireView(ctx) {
  view.root = ctx.content;
  paintView(ctx.content, view.mode === "sample" ? "sample" : "mine", view.auto);
  ctx.content.querySelector("#vt").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-v]");
    if (!b || view.mode === b.dataset.v) return;
    view.mode = b.dataset.v; view.auto = false;
    ctx.reload();
  }, { signal: ctx.signal });
}

export async function loadModel(db, signal) {
  const t = await resolveMode(db, signal);
  const m = await loadFrom(db, signal, t);
  if (t.files) {
    const keep = (r) => t.files.has(r.file);
    m.sheets = m.sheets.filter(keep);
    m.nodes = m.nodes.filter(keep);
    m.edges = m.edges.filter(keep);
    m.loops = m.loops.filter(keep);
  }
  m.files = t.files || null;
  return m;
}

async function loadFrom(db, signal, t) {
  const [sheets, nodes, edges, loops] = await Promise.all([
    db.rows(
      `SELECT file, page, is_pid, sheet_title, drawing_number, page_summary, ok, error, n_nodes, n_edges, n_loops, n_uncertain FROM ${t.sheets} WHERE file <> '__seed__' ORDER BY file, page LIMIT 2000`,
      [], signal),
    db.rows(
      `SELECT file, page, tag, node_type, subtype, name, attrs, confidence FROM ${t.equipment} LIMIT 8000`,
      [], signal),
    db.rows(
      `SELECT file, page, src, dst, relation, line, attrs, confidence FROM ${t.connections} LIMIT 12000`,
      [], signal),
    db.rows(
      `SELECT file, page, loop_id, variable, sensor_tag, controller_tag, final_element_tag, description, confidence FROM ${t.loops} LIMIT 1500`,
      [], signal),
  ]);
  for (const n of nodes) n.tag = trim(n.tag);
  for (const e of edges) { e.src = trim(e.src); e.dst = trim(e.dst); }
  return { sheets, nodes, edges, loops, sample: t.sample, qaTable: t.qa };
}

export const sheetKey = (r) => `${r.file}|${r.page}`;
export const sheetLabel = (r) => `${cleanFile(r.file)} \u00b7 p.${r.page}`;

/** A readable plant summary: the context to hand an LLM. Built from the live graph. */
export function summaryText(model, maxChars = 9000) {
  const pid = model.sheets.filter((s) => s.ok && s.is_pid);
  if (!pid.length) return "";
  const out = [];
  const eq = model.nodes.filter((n) => n.node_type === "equipment");
  const ins = model.nodes.filter((n) => n.node_type === "instrument").length;
  const valves = model.nodes.filter((n) => n.node_type === "valve").length;
  out.push(
    `PLANT SUMMARY - ${pid.length} P&ID sheet${pid.length === 1 ? "" : "s"}; ${eq.length} equipment items, ${valves} valves, ${ins} instruments, ${model.edges.length} connections, ${model.loops.length} control/monitoring loops.`
  );
  out.push("");
  for (const s of pid) {
    const k = sheetKey(s);
    const here = (r) => sheetKey(r) === k;
    const tags = model.nodes.filter((n) => here(n) && n.node_type === "equipment").map((n) => n.tag).slice(0, 14);
    const loops = model.loops.filter(here).map((l) => l.loop_id).slice(0, 10);
    out.push(`${sheetLabel(s)} - ${s.sheet_title || "untitled"}${s.drawing_number ? " (" + s.drawing_number + ")" : ""}`);
    if (s.page_summary) out.push(`  ${s.page_summary}`);
    if (tags.length) out.push(`  Equipment: ${tags.join(", ")}`);
    if (loops.length) out.push(`  Loops: ${loops.join(", ")}`);
    out.push("");
  }
  const text = out.join("\n");
  return text.length > maxChars ? text.slice(0, maxChars) + "\n... (truncated)" : text;
}

let runStartedAt = 0;

/**
 * The Run button for the app's pipeline. First press asks to confirm (a run reads every
 * sheet with a vision model); the second POSTs. A success means "started", never "done".
 */
export function wireRun(ctx, button, status) {
  let armed = false;
  const idle = () => { button.textContent = "Read my drawings"; };
  if (Date.now() - runStartedAt < 600000) {
    button.disabled = true;
    status.textContent = "A run was started a moment ago. Results appear as sheets finish - press Refresh results in a few minutes.";
  }
  button.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      button.textContent = "Confirm - start reading";
      status.textContent = "This reads every uploaded sheet with a vision model and can take several minutes. Press again to start.";
      return;
    }
    button.disabled = true;
    status.textContent = "Starting...";
    try {
      const response = await fetch(PIPELINE_URL, { method: "POST", signal: ctx.signal });
      if (response.headers.get("x-corvic-error-reason") === "SIGN_IN_REQUIRED") {
        button.disabled = false; armed = false; idle();
        status.textContent = "Login to use the app.";
        return;
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error("You can't start this run. Reload the page; if it still fails, ask the app's owner to let you run pipelines.");
      }
      if (response.status === 429) throw new Error("This has been run a lot recently. Try again later.");
      if (!response.ok) throw new Error(`Couldn't start the run (${response.status}). Try again in a minute.`);
      runStartedAt = Date.now();
      button.textContent = "Run started";
      status.textContent = response.status === 202
        ? "A run is already under way. New sheets appear when it finishes - press Refresh results then."
        : "Run started. Each sheet takes about half a minute; press Refresh results to see new results.";
    } catch (err) {
      if (ctx.signal.aborted) return;
      button.disabled = false; armed = false; idle();
      status.textContent = err instanceof Error ? err.message : String(err);
      ctx.reportError(err);
    }
  }, { signal: ctx.signal });
}

export function emptyNote(text, href = "home", cta = "Go to Overview") {
  return `<div class="empty-note"><div class="empty-ico">&#9676;</div><p>${esc(text)}</p><a class="btn btn-primary" href="${href}">${esc(cta)}</a></div>`;
}

export function showLoadError(ctx, main, err) {
  if (ctx.signal.aborted) return;
  main.innerHTML = `<div class="load-note">Couldn't load data: ${esc(err && err.message ? err.message : String(err))}</div>`;
  ctx.reportError(err);
}

/** What a reader should be told when a write (an upload, a review decision) fails. */
export function writeErrorText(err, what = "save that") {
  const kind = err && err.kind;
  const status = Number(err && err.status) || 0;
  if (kind === "write-sign-in-required") return err.message || "Login to use the app.";
  if (kind === "write-session-expired") return "Your session expired - reload the page and try again. Nothing was saved.";
  if (kind === "write-rejected" && (status === 401 || status === 403)) return `Your access to this app doesn't allow you to ${what}. Ask the app's owner to let your group add files, then reload (error ${status}).`;
  if (kind === "write-rejected" && status === 413) return "That file is too large to upload. Try a smaller file or a page range.";
  if (kind === "write-refused") return `This app isn't set up to ${what} right now (${err.message}). Tell the app's owner.`;
  if (kind === "write-rejected") return `Couldn't ${what}${status ? ` (error ${status})` : ""}${err.detail ? `: ${String(err.detail).slice(0, 160)}` : ". Try again in a minute."}`;
  return `Couldn't ${what}: ${(err && err.message) || err}`;
}

export const confBadge = (c) => {
  const v = String(c || "").toLowerCase();
  return `<span class="badge conf-${v === "high" || v === "medium" || v === "low" ? v : "na"}">${esc(v || "-")}</span>`;
};
