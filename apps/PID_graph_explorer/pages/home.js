import { esc, renderChrome, loadModel, cleanFile, fmtBytes, summaryText, wireRun, showLoadError, writeErrorText, listDrawings, uploadRoom, removedFiles, UPLOAD_LIMIT } from "../lib/app.js";

const pending = []; // uploaded this session; a write is not readable until the next load
let flash = "";
const quotaState = { limited: true, paths: new Set() };
const MORE = `To work with more than ${UPLOAD_LIMIT} drawings, use Corvic directly: this app keeps uploads to ${UPLOAD_LIMIT} per person.`;
const delRow = (path) => `<button type="button" class="btn btn-sm" data-act="ask" data-path="${esc(path)}" aria-label="Delete ${esc(path)}">Delete</button>`;
const delAsk = (path) => `<span class="fine">Delete this file?</span><button type="button" class="btn btn-sm danger" data-act="yes" data-path="${esc(path)}">Yes, delete</button><button type="button" class="btn btn-sm" data-act="no" data-path="${esc(path)}">Cancel</button>`;
const IDLE = (typeof matchMedia === "function" && matchMedia("(hover: none)").matches) ? "tap to browse your device" : "or drop them here";
const names = (files) => (files.length === 1 ? files[0].name : `${files.length} files: ${files.slice(0, 2).map((f) => f.name).join(", ")}${files.length > 2 ? ", ..." : ""}`);

const ART = `<svg viewBox="0 0 360 260" role="img" aria-label="A small plant graph"><defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#c0b3ff"/></marker></defs><g stroke="#c0b3ff" stroke-width="2" fill="none" marker-end="url(#ar)"><path d="M40 130 L110 130"/><path d="M150 130 L215 90"/><path d="M150 130 L215 175"/><path d="M255 90 L318 90"/><path d="M255 175 L318 175"/></g><g stroke="#fbbf24" stroke-width="1.6" stroke-dasharray="5 4" fill="none"><path d="M130 112 L130 50 L235 50 L235 72"/><path d="M130 148 L130 215 L235 215 L235 193"/></g><circle cx="130" cy="130" r="24" fill="#fbbf24"/><text x="130" y="134" text-anchor="middle" font-size="11" font-weight="700" fill="#130944">TK-101</text><circle cx="235" cy="90" r="17" fill="#34d399"/><circle cx="235" cy="175" r="17" fill="#34d399"/><circle cx="130" cy="50" r="11" fill="#a78bfa"/><circle cx="130" cy="215" r="11" fill="#a78bfa"/><circle cx="40" cy="130" r="9" fill="#2dd4bf"/><circle cx="330" cy="90" r="9" fill="#2dd4bf"/><circle cx="330" cy="175" r="9" fill="#2dd4bf"/><text x="130" y="34" text-anchor="middle" font-size="10" fill="#c0b3ff">TT-105</text><text x="235" y="232" text-anchor="middle" font-size="10" fill="#c0b3ff">FCV-110</text></svg>`;

const SHELL = `
<section class="hero">
  <div class="hero-copy">
    <div class="eyebrow">P&amp;ID to knowledge graph</div>
    <h1>Give your troubleshooting assistant the plant context it's missing.</h1>
    <p>Upload piping &amp; instrumentation drawings. A Corvic pipeline reads every sheet in zoomed sections, maps equipment, instruments, lines and control loops into a graph. Then you explore it, review the doubtful bits and chat with your drawings.</p>
    <div class="hero-cta"><a class="btn btn-amber" href="ask">Ask the plant</a><a class="btn btn-ghost" href="graph">Open graph explorer</a></div>
  </div>
  <div class="hero-art">${ART}</div>
</section>

<ol class="steps">
  <li><b>1</b><span>Upload PDFs</span></li>
  <li><b>2</b><span>Read my drawings</span></li>
  <li><b>3</b><span>Explore &amp; review</span></li>
  <li><b>4</b><span>Ask the plant</span></li>
</ol>

<div class="grid2">
  <section class="card" id="upload-card">
    <h2>1 &middot; Upload drawings</h2>
    <p class="sub">Digital or scanned PDFs. Each person's uploads are private to them. For a large document, enter the page range holding the P&amp;IDs so only those sheets are read (up to 40 sheets per file).</p>
    <form id="upload-form" class="upload">
      <label class="drop"><input type="file" id="file" accept="application/pdf,.pdf" multiple /><span class="drop-t"><b>Choose PDF files</b><i id="chosen">or drop them here</i></span></label>
      <div class="range"><span>Pages</span><input type="number" id="from" min="1" placeholder="from" aria-label="First page" /><span>to</span><input type="number" id="to" min="1" placeholder="to" aria-label="Last page" /><em>optional, applies to all chosen files</em></div>
      <div class="row"><button class="btn btn-primary" id="upload-btn" type="submit">Upload</button><span class="msg" id="upload-msg" role="status"></span></div>
    </form>
    <p class="quota" id="quota" role="status"></p>
    <div id="files" class="files"><div class="ph">Loading your files...</div></div>
    <details class="sample"><summary>No drawings handy?</summary><p>The GitHub repo <b>ScottDuncanAI / public-chemical-manufacturing-datasets</b> links real P&amp;ID sets, for example the Pahala WWTP drawings (digital PDF, P&amp;IDs on pages 9-25) and the Virden WWTF set (scanned images, pages 5-14). Download one, upload it here and enter the page range.</p></details>
  </section>
  <section class="card run" id="run-card">
    <h2>2 &middot; Read my drawings</h2>
    <p class="sub">Starts the <b>P&amp;ID Knowledge Graph</b> pipeline: each sheet is rendered at high resolution, a vision model reads it section by section, and the results land as graph tables this app reads live.</p>
    <ul class="ticks"><li>Equipment, valves, instruments, lines and off-page streams</li><li>Flow paths, measurements and control loops</li><li>Every doubtful tag or connection flagged for your review</li></ul>
    <div class="row"><button class="btn btn-amber" id="run-btn" type="button">Read my drawings</button><button class="btn" id="refresh-btn" type="button">Refresh results</button></div>
    <p class="msg" id="run-msg" role="status"></p>
    <p class="fine">Results update when the run finishes: press Refresh results to pick them up. The pipeline can also be scheduled from its page in Corvic.</p>
  </section>
</div>

<div class="kpis" id="kpis"><div class="ph">Loading graph totals...</div></div>

<section class="card"><h2>Drawing sheets</h2><div id="sheets"><div class="ph">Loading sheets...</div></div></section>

<section class="card"><h2>Plant summary</h2><p class="sub">A readable plant description built from the graph: the context an LLM needs to troubleshoot your process. Select the text to copy it; the chat already uses it.</p><pre class="summary" id="summary">Loading...</pre></section>

<section class="card corvic">
  <h2>What's running underneath</h2>
  <div class="feat">
    <div><b>Data pipeline</b><span>Upload watch, sheet splitter, vision extraction, graph tables. Re-run or schedule it; only new files are read.</span></div>
    <div><b>Live tables</b><span>Every page reads the pipeline's output in your browser with SQL. Nothing is baked in.</span></div>
    <div><b>Private by person</b><span>Your drawings, graph, QA decisions and chats are visible only to you (room members can see all).</span></div>
    <div><b>Grounded chat</b><span>Questions are answered by looking things up in your graph, with sheet citations, or in troubleshooting mode.</span></div>
  </div>
</section>`;

export default async function render(ctx) {
  const main = renderChrome(ctx, ctx.route.path);
  main.innerHTML = SHELL;
  const $ = (s) => main.querySelector(s);

  wireRun(ctx, $("#run-btn"), $("#run-msg"));
  const refresh = $("#refresh-btn");
  refresh.addEventListener("click", () => {
    refresh.disabled = true;
    refresh.textContent = "Refreshing...";
    ctx.reload();
  }, { signal: ctx.signal });

  const fileInput = $("#file");
  fileInput.addEventListener("change", () => {
    const n = fileInput.files.length;
    $("#chosen").textContent = n ? names([...fileInput.files]) : IDLE;
  }, { signal: ctx.signal });
  if (flash) { $("#upload-msg").textContent = flash; flash = ""; }
  $("#chosen").textContent = IDLE;
  const drop = $("label.drop");
  for (const ev of ["dragenter", "dragover"]) drop.addEventListener(ev, () => drop.classList.add("over"), { signal: ctx.signal });
  for (const ev of ["dragleave", "drop", "dragend"]) drop.addEventListener(ev, () => drop.classList.remove("over"), { signal: ctx.signal });

  $("#upload-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const files = [...fileInput.files];
    const msg = $("#upload-msg");
    if (!files.length) { msg.textContent = "Choose a PDF first."; return; }
    const notPdf = files.filter((f) => !/\.pdf$/i.test(f.name) && f.type !== "application/pdf");
    if (notPdf.length) { msg.textContent = `Only PDF files can be read. Remove: ${notPdf.map((f) => f.name).join(", ")}`; return; }
    const a = $("#from").value.trim(), b = $("#to").value.trim();
    const range = a ? ` [pages ${a}${b ? "-" + b : ""}]` : "";
    if (quotaState.limited) {
      const paths = files.map((f) => `${f.name.replace(/\.pdf$/i, "").replace(/[\[\]\/\\]/g, "_")}${range}.pdf`);
      const q = uploadRoom(quotaState.paths, paths);
      if (!q.allowed) {
        msg.textContent = q.spare === 0
          ? `You've reached the ${UPLOAD_LIMIT}-file limit. Delete a file below to add another. ${MORE}`
          : `You can add ${q.spare} more file${q.spare === 1 ? "" : "s"}. Choose fewer files or delete one below. ${MORE}`;
        return;
      }
    }
    const btn = $("#upload-btn");
    btn.disabled = true; btn.textContent = "Uploading..."; msg.textContent = "";
    try {
      for (const f of files) {
        const base = f.name.replace(/\.pdf$/i, "").replace(/[\[\]\/\\]/g, "_");
        const path = `${base}${range}.pdf`;
        await ctx.write.file("drawings", path, f, { contentType: "application/pdf", signal: ctx.signal });
        removedFiles.delete(path);
        if (!pending.some((p) => p.path === path)) pending.push({ path, size: f.size });
      }
      flash = `Uploaded ${files.length} file${files.length === 1 ? "" : "s"}. Next: press Read my drawings.`;
      ctx.reload();
    } catch (err) {
      if (ctx.signal.aborted) return;
      btn.disabled = false; btn.textContent = "Upload";
      msg.textContent = writeErrorText(err, "upload files");
      ctx.reportError(err);
    }
  }, { signal: ctx.signal });

  let model, files, qa, mine, reader;
  try {
    [model, files, mine, reader] = await Promise.all([
      loadModel(ctx.db, ctx.signal),
      listDrawings(ctx.signal),
      ctx.db.rows("SELECT file, count(*) AS n, count(*) FILTER (WHERE ok AND is_pid) AS pid, count(*) FILTER (WHERE NOT ok) AS bad FROM sheets WHERE file <> '__seed__' GROUP BY file LIMIT 500", [], ctx.signal),
      ctx.reader(ctx.signal).catch(() => null),
    ]);
    const qrows = await ctx.db.rows(`SELECT file, count(*) AS n FROM ${model.qaTable} GROUP BY file LIMIT 2000`, [], ctx.signal);
    qa = [{ n: qrows.filter((r) => !model.files || model.files.has(r.file)).reduce((a, r) => a + Number(r.n), 0) }];
  } catch (err) {
    showLoadError(ctx, main, err);
    return;
  }
  if (ctx.signal.aborted) return;

  const known = new Set(files.map((f) => f.path));
  const all = [...files, ...pending.filter((p) => !known.has(p.path) && !removedFiles.has(p.path))];
  quotaState.paths = new Set(all.map((f) => f.path));
  // Room members see every file, so the per-person limit cannot be counted for them.
  quotaState.limited = !(reader && reader.everyRow);
  if (quotaState.limited) {
    const left = Math.max(0, UPLOAD_LIMIT - all.length);
    $("#quota").innerHTML = left > 0
      ? `<b>${all.length} of ${UPLOAD_LIMIT}</b> files used. ${left} more can be added. Delete a file to free a place.`
      : `<b>${all.length} of ${UPLOAD_LIMIT}</b> files used. Delete a file to add another. ${MORE}`;
    if (left === 0) {
      fileInput.disabled = true; $("#upload-btn").disabled = true;
      drop.classList.add("full"); $("#chosen").textContent = "limit reached";
    }
  }
  // The file list is about the reader's own uploads, whichever set the page is showing.
  const sheetCount = new Map(mine.map((m) => [m.file, m]));
  $("#files").innerHTML = all.length
    ? all.map((f) => {
        const m = sheetCount.get(f.path);
        const n = m ? m.n : 0;
        const state = !n ? `<span class="badge conf-na">waiting for a run</span>`
          : m.bad === n ? `<span class="badge conf-low">couldn't be read</span>`
          : !m.pid ? `<span class="badge conf-medium">read &middot; no P&amp;ID sheets found</span>`
          : `<span class="badge conf-high">${m.pid} P&amp;ID sheet${m.pid === 1 ? "" : "s"} read</span>`;
        return `<div class="file"><span class="pdf">PDF</span><span class="fname">${esc(f.path)}</span><span class="fsize">${fmtBytes(f.size)}</span>${state}<span class="fact">${delRow(f.path)}</span></div>`;
      }).join("")
    : `<div class="ph">No drawings uploaded yet.</div>`;

  $("#files").addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    const path = b.dataset.path;
    const cell = b.closest(".fact");
    const msg = $("#upload-msg");
    if (b.dataset.act === "ask") { cell.innerHTML = delAsk(path); return; }
    if (b.dataset.act === "no") { cell.innerHTML = delRow(path); return; }
    cell.querySelectorAll("button").forEach((x) => { x.disabled = true; });
    msg.textContent = "Deleting...";
    try {
      await ctx.write.remove("drawings", path, { signal: ctx.signal });
      removedFiles.add(path);
      const i = pending.findIndex((p) => p.path === path);
      if (i >= 0) pending.splice(i, 1);
      flash = `Deleted ${path}. Its sheets no longer appear in your graph.`;
      ctx.reload();
    } catch (err) {
      if (ctx.signal.aborted) return;
      msg.textContent = writeErrorText(err, "delete that file");
      cell.innerHTML = delRow(path);
      ctx.reportError(err);
    }
  }, { signal: ctx.signal });

  if (model.sample) {
    const n = model.sheets.filter((s) => s.ok).length;
    $("#files").insertAdjacentHTML("afterbegin", `<div class="file sample-file"><span class="pdf">PDF</span><span class="fname">Pahala WWTP design-build drawings (US EPA, 2021)</span><span class="fsize">pages 10-17</span><span class="badge conf-high">sample &middot; ${n} sheet${n === 1 ? "" : "s"} read</span></div>`);
  }
  const pid = model.sheets.filter((s) => s.ok && s.is_pid).length;
  const count = (t) => model.nodes.filter((n) => n.node_type === t).length;
  const kpi = (v, l, cls = "") => `<div class="kpi ${cls}"><div class="kpi-v">${v}</div><div class="kpi-l">${l}</div></div>`;
  $("#kpis").innerHTML =
    kpi(pid, "P&amp;ID sheets read") + kpi(count("equipment"), "Equipment") + kpi(count("instrument"), "Instruments") +
    kpi(model.edges.length, "Connections") + kpi(model.loops.length, "Control loops") +
    kpi(qa[0]?.n ?? 0, "Items to review", "warn");

  $("#sheets").innerHTML = model.sheets.length
    ? `<div class="sheet-list">` + model.sheets.slice(0, 80).map((s) => {
        if (!s.ok) return `<article class="sheet bad"><div class="sh-h"><b>${esc(cleanFile(s.file))} &middot; p.${s.page}</b><span class="badge conf-low">couldn't read</span></div><p>${esc(s.error)}</p></article>`;
        if (!s.is_pid) return `<article class="sheet muted"><div class="sh-h"><b>${esc(cleanFile(s.file))} &middot; p.${s.page}</b><span class="badge conf-na">not a P&amp;ID</span></div><p>${esc(s.sheet_title || s.page_summary || "Skipped")}</p></article>`;
        return `<article class="sheet"><div class="sh-h"><b>${esc(cleanFile(s.file))} &middot; p.${s.page}</b><span class="dn">${esc(s.drawing_number)}</span></div><h3>${esc(s.sheet_title)}</h3><p>${esc(s.page_summary)}</p><div class="chips"><span>${s.n_nodes} items</span><span>${s.n_edges} connections</span><span>${s.n_loops} loops</span><span class="${s.n_uncertain ? "warn" : ""}">${s.n_uncertain} to review</span></div></article>`;
      }).join("") + `</div>`
    : `<div class="empty-inline">Nothing read yet. Upload a PDF above, then press <b>Read my drawings</b>.</div>`;

  const text = summaryText(model);
  $("#summary").textContent = text || "The plant summary appears here once sheets have been read.";
}
