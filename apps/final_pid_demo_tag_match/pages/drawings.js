import { shell, esc, creditHtml, myIds, sheetHref, trunc } from "../lib/app.js";

const PIPELINE = "/pipeline/28418";
const MAX_FILES = 5, MAX_BYTES = 30 * 1024 * 1024;
let pendingDelete = null;
let note = "";

export default async function render(ctx) {
  ctx.content.innerHTML = shell("drawings", `<h1>My drawings</h1><p class="muted">Upload a PDF, PNG or JPG. <b>Results are visible to everyone in your organization.</b> Up to 5 files, 40 pages per file.</p>
<div class="grid g2"><div class="card"><h2>1 · Upload</h2><div class="drop"><input type="file" id="file" multiple><div class="muted small" style="margin-top:6px">PDF pages are read at high resolution; small images are scaled up.</div></div>
<div class="row" style="margin-top:10px"><span class="muted small">Pages</span><input class="in" id="pf" type="number" min="1" placeholder="from" style="width:90px"><span class="muted small">to</span><input class="in" id="pt" type="number" min="1" placeholder="to" style="width:90px"><span class="muted small">optional, applies to PDFs</span></div>
<div class="row" style="margin-top:10px"><button class="btn" id="up" type="button">Upload</button><span class="small" id="upmsg"></span></div></div>
<div class="card"><h2>2 · Read my drawings</h2><p class="muted small">Starts the reader on everything uploaded. Reading takes about two minutes per page. Press Refresh to pick up results.</p><div class="row"><button class="btn" id="run" type="button">Read my drawings</button><button class="btn ghost" id="ref" type="button">Refresh</button></div><p class="small" id="runmsg"></p></div></div>
<div class="card" style="margin-top:16px"><h2>Your files</h2><div id="files"><p class="muted">Loading…</p></div></div>${creditHtml()}`);
  const $ = (s) => ctx.content.querySelector(s);
  const fileInput = $("#file");
  fileInput.setAttribute("accept", ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg");
  let log = [], status = [];
  const load = async () => {
    log = await ctx.db.rows(`SELECT upload_id, file, mime, page_from, page_to, action, __corvic_inserted_at AS at FROM uplog ORDER BY __corvic_inserted_at LIMIT 500`, [], ctx.signal);
    const ids = await myIds(ctx);
    status = ids.length ? await ctx.db.rows(`SELECT upload_id, drawing_id, page, ok, is_pid, note, error FROM sheets WHERE source = 'upload' AND upload_id IN (${ids.map((i) => `'${i}'`).join(",")}) ORDER BY upload_id, page LIMIT 500`, [], ctx.signal) : [];
  };
  const active = () => { const m = new Map(); for (const l of log) { if (l.action === "added") m.set(l.upload_id, l); else m.delete(l.upload_id); } return [...m.values()]; };
  const paint = () => {
    const files = active();
    $("#files").innerHTML = files.length ? `<div class="flist">${files.map((f) => {
      const st = status.filter((s) => s.upload_id === f.upload_id);
      const ok = st.filter((s) => s.ok && s.is_pid), notpid = st.filter((s) => s.ok && !s.is_pid), fail = st.filter((s) => !s.ok);
      const badge = !st.length ? `<span class="badge unread">Waiting to be read</span>` : fail.length && !ok.length ? `<span class="badge fail">Could not read</span>` : notpid.length && !ok.length ? `<span class="badge fail">Not a P&amp;ID</span>` : `<span class="badge read">${ok.length} P&amp;ID sheet${ok.length === 1 ? "" : "s"} read</span>`;
      const msgs = [...notpid.map((s) => `<div class="notice">Page ${s.page}: this does not look like a P&amp;ID. ${esc(s.note || "")}</div>`), ...fail.map((s) => `<div class="notice">Page ${s.page}: ${esc(trunc(s.error, 200))}</div>`)].join("");
      const range = f.page_from || f.page_to ? ` · pages ${f.page_from || 1}–${f.page_to || "end"}` : "";
      const del = pendingDelete === f.upload_id ? `<span class="small">Delete this file and its results?</span><button class="btn danger sm" data-ok="${esc(f.upload_id)}" type="button">Delete</button><button class="btn ghost sm" data-no="1" type="button">Cancel</button>` : `<button class="btn ghost sm" data-del="${esc(f.upload_id)}" type="button">Delete</button>`;
      return `<div><div class="frow"><div><b>${esc(f.file)}</b><div class="muted small">${esc(String(f.mime).replace("application/", "").replace("image/", ""))}${range}</div></div><div class="row">${badge}${ok.slice(0, 6).map((s) => `<a class="btn sm ghost" href="${sheetHref(s.drawing_id)}">Open p.${s.page}</a>`).join("")}${del}</div></div>${msgs}</div>`;
    }).join("")}</div>` : `<p class="muted">No files yet. Upload a drawing to get started.</p>`;
    $("#upmsg").textContent = note;
    $("#files").querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => { pendingDelete = b.dataset.del; paint(); }, { signal: ctx.signal }));
    $("#files").querySelectorAll("[data-no]").forEach((b) => b.addEventListener("click", () => { pendingDelete = null; paint(); }, { signal: ctx.signal }));
    $("#files").querySelectorAll("[data-ok]").forEach((b) => b.addEventListener("click", async () => {
      const f = active().find((x) => x.upload_id === b.dataset.ok); if (!f) return;
      b.disabled = true; b.textContent = "Deleting…";
      try {
        await ctx.write.remove("uploads", `pg${f.page_from || 0}-${f.page_to || 0}/${f.upload_id}/${f.file}`, { signal: ctx.signal });
        await ctx.write.rows("uplog", [{ upload_id: f.upload_id, file: f.file, mime: f.mime, page_from: f.page_from || 0, page_to: f.page_to || 0, action: "deleted" }], { signal: ctx.signal });
        pendingDelete = null; note = "Deleted " + f.file + "."; ctx.reload();
      } catch (e) { if (ctx.signal.aborted) return; b.disabled = false; b.textContent = "Delete"; $("#upmsg").textContent = e?.message || "Could not delete."; if (e?.kind !== "write-sign-in-required") ctx.reportError(e); }
    }, { signal: ctx.signal }));
  };
  try { await load(); } catch (e) { if (ctx.signal.aborted) return; ctx.reportError(e); $("#files").innerHTML = `<p class="muted">Your files could not be loaded. Try Refresh.</p>`; return; }
  if (ctx.signal.aborted) return;
  paint();
  const up = $("#up");
  up.addEventListener("click", async () => {
    const files = [...fileInput.files]; const msg = $("#upmsg");
    if (!files.length) { msg.textContent = "Choose a file first."; return; }
    const pf = Math.max(0, parseInt($("#pf").value || "0", 10) || 0), pt = Math.max(0, parseInt($("#pt").value || "0", 10) || 0);
    if (pt && pf && pt < pf) { msg.textContent = "The last page must be after the first page."; return; }
    if (active().length + files.length > MAX_FILES) { msg.textContent = `At most ${MAX_FILES} files per person. Delete one first.`; return; }
    for (const f of files) { if (!/\.(pdf|png|jpe?g)$/i.test(f.name)) { msg.textContent = `${f.name}: only PDF, PNG and JPG files.`; return; } if (f.size > MAX_BYTES) { msg.textContent = `${f.name} is over 30 MB.`; return; } }
    up.disabled = true; msg.textContent = "Uploading…";
    try {
      for (const f of files) {
        const id = crypto.randomUUID(); const mime = /\.pdf$/i.test(f.name) ? "application/pdf" : /\.png$/i.test(f.name) ? "image/png" : "image/jpeg";
        const isPdf = mime === "application/pdf"; const a = isPdf ? pf : 0, b = isPdf ? pt : 0;
        const safe = f.name.replace(/[\/\\]/g, "_").slice(0, 150);
        await ctx.write.file("uploads", `pg${a}-${b}/${id}/${safe}`, f, { contentType: mime, signal: ctx.signal });
        await ctx.write.rows("uplog", [{ upload_id: id, file: safe, mime, page_from: a, page_to: b, action: "added" }], { signal: ctx.signal });
        log.push({ upload_id: id, file: safe, mime, page_from: a, page_to: b, action: "added" });
      }
      fileInput.value = ""; note = `Uploaded ${files.length} file${files.length === 1 ? "" : "s"}. Press “Read my drawings”.`; paint();
    } catch (e) { if (ctx.signal.aborted) return; msg.textContent = e?.kind === "write-sign-in-required" ? "Login to use the app." : (e?.message || "Upload failed."); if (e?.kind !== "write-invalid" && e?.kind !== "write-sign-in-required") ctx.reportError(e); }
    finally { up.disabled = false; }
  }, { signal: ctx.signal });
  const run = $("#run"), runmsg = $("#runmsg");
  run.addEventListener("click", async () => {
    run.disabled = true; runmsg.textContent = "Starting…";
    try {
      const r = await fetch(PIPELINE, { method: "POST", signal: ctx.signal });
      if (r.headers.get("x-corvic-error-reason") === "SIGN_IN_REQUIRED") { run.disabled = false; runmsg.textContent = "Login to use the app."; return; }
      if (r.status === 401 || r.status === 403) throw new Error("You can't start this run. Reload the page; if it still fails, ask the app's owner to let you run pipelines.");
      if (r.status === 429) throw new Error("This has been run a lot recently. Try again later.");
      if (!r.ok) throw new Error(`Couldn't start the run (${r.status}). Try again in a minute.`);
      runmsg.textContent = r.status === 202 ? "A run is already going. Press Refresh in a few minutes to see results." : "Run started. Reading takes a couple of minutes per page. Press Refresh to see results.";
    } catch (e) { if (ctx.signal.aborted) return; run.disabled = false; runmsg.textContent = e.message; ctx.reportError(e); }
  }, { signal: ctx.signal });
  $("#ref").addEventListener("click", () => { note = ""; ctx.reload(); }, { signal: ctx.signal });
}
