// SPACE host. Runs SPACE Studio as built (the file under space/ is the pack's Studio, untouched),
// adds the pack's proposed Read-result patch plus one small hook, and answers the Studio's
// messages: space:auth, space:job, and the upload that becomes a Corvic Plan Read.
const PIPELINE = "/pipeline/18685";
const LIB_KEYS = ["TEX", "TEXAVG", "PAL", "SCH", "COMP", "FUR", "CAB", "CTH", "HAN", "HFIN", "HTH", "CRP", "ROOM"];

// Additive hook, appended after the Studio: sends the reading-sized plan image with the request
// (the Studio's own space:read-request carries only a file name), and places the plan under the
// walls once a result is loaded. Nothing in the Studio is edited.
const HOOK = `(function(){
  var UL = window.UL; if (!UL) return;
  var send = UL.sendRead;
  UL.sendRead = function(){
    var img = document.querySelector('.ulthumb img'), nm = document.querySelector('.ulmeta b'), pg = document.querySelector('.ulmeta select');
    var payload = { type: 'space:read-upload', file: nm ? nm.textContent : 'plan', page: pg ? +pg.value || 1 : 1, mime: 'image/jpeg', image: img ? img.src : '' };
    send.apply(this, arguments);
    try { parent.postMessage(payload, '*'); } catch (e) {}
  };
  window.addEventListener('message', function(e){
    var d = e.data || {};
    if (d.type === 'space:read-result' && e.source === window.parent) {
      setTimeout(function(){ try { UL.useAsUL(); } catch (x) {} try { go(1); } catch (x) {} }, 60);
    }
  });
})();`;

async function text(path, signal) {
  const r = await fetch(path, { signal });
  if (!r.ok) throw new Error(path + " " + r.status);
  return r.text();
}

async function buildDoc(signal) {
  const [studio, libTxt, roomTxt, bridge, patch] = await Promise.all([
    "space/SPACE_Studio.html.txt", "space/lib-data.json.txt", "space/room-assets.json.txt",
    "space/bridge.js.txt", "space/studio_read_result_patch.js.txt",
  ].map((p) => text(p, signal)));
  const all = JSON.parse(libTxt);
  all.ROOM = JSON.parse(roomTxt);
  const pick = {};
  LIB_KEYS.forEach((k) => { if (all[k]) pick[k] = all[k]; });
  const head = "<script>window.SPACE_LIB=" + JSON.stringify(pick).replace(/<\//g, "<\\/") +
    ";window.SPACE_UNITS='metric';<\/script><script id=\"space-bridge-src\">" + bridge + "<\/script>";
  return head + studio + "\n<script>" + patch + "<\/script>\n<script>" + HOOK + "<\/script>";
}

export default async function render(ctx) {
  ctx.content.innerHTML = `
<div class="sp-host">
  <iframe class="sp-frame" title="SPACE Studio"></iframe>
  <div class="sp-load" id="spLoad">Opening SPACE Studio…</div>
  <div class="sp-panel" id="spPanel" hidden></div>
  <button type="button" class="sp-pill" id="spPill" hidden><i></i><span></span></button>
</div>`;
  const frame = ctx.content.querySelector(".sp-frame");
  const load = ctx.content.querySelector("#spLoad");
  const panel = ctx.content.querySelector("#spPanel");
  const pill = ctx.content.querySelector("#spPill");
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let activeLabel = "";
  let tone = "";
  let reads = [];

  const setPill = (label, t) => {
    activeLabel = label; tone = t || "";
    pill.className = "sp-pill " + tone;
    pill.querySelector("span").textContent = label || ("Plan reads" + (reads.length ? " · " + reads.length : ""));
    pill.hidden = false;
  };
  const post = (msg) => { try { frame.contentWindow.postMessage(msg, "*"); } catch (e) { ctx.reportError(e); } };

  async function freshReads(where, params) {
    for (const s of ctx.db.sources()) if (s.name === "reads") await ctx.db.registerSource(s.name, s.url);
    return ctx.db.rows(where, params || [], ctx.signal);
  }
  const COLS = "request_id, file_name, status, read_conf, mm_per_px, scale_source, wall_count, label_count, low_conf_walls_json, notes_json, issues_json, model_json, error";

  function deliver(r) {
    let model, low = [], notes = [];
    try { model = JSON.parse(r.model_json); low = JSON.parse(r.low_conf_walls_json || "[]"); notes = JSON.parse(r.notes_json || "[]"); } catch (e) { ctx.reportError(e); }
    if (!model || !model.walls || !model.walls.length) { setPill("Read returned no walls. Nothing is charged: trace it yourself.", "err"); return; }
    const k = r.mm_per_px || 5;
    post({ type: "space:read-result", result: { request_id: r.request_id, status: r.status, model, read_conf: r.read_conf, scale: { mm_per_px: k, source: r.scale_source }, low_conf_walls: low, notes, model_version: "corvic-plan-reader-0.1" } });
    setTimeout(() => post({ type: "space:read", transform: [k, 0, 0, k, 0, 0], confidence: r.read_conf }), 450);
    setPill("Plan read loaded: " + Math.round((r.read_conf || 0) * 100) + "% confidence. Check it in Confirm.", "ok");
  }

  async function poll(id) {
    const t0 = Date.now();
    while (!ctx.signal.aborted && Date.now() - t0 < 12 * 60 * 1000) {
      await new Promise((res) => setTimeout(res, 8000));
      if (ctx.signal.aborted) return;
      setPill("Reading your plan… " + Math.round((Date.now() - t0) / 1000) + "s", "busy");
      try {
        const rows = await freshReads("SELECT " + COLS + " FROM reads WHERE request_id = ?", [id]);
        if (rows.length) {
          if (rows[0].status === "failed") { setPill("Read failed (" + (rows[0].error || "no detail").slice(0, 60) + "). Nothing is charged.", "err"); return; }
          deliver(rows[0]); return;
        }
      } catch (e) { /* the result table fills after the first run: keep waiting */ }
    }
    if (!ctx.signal.aborted) setPill("Still reading. Open Plan reads and load it when it is ready.", "err");
  }

  async function upload(d) {
    if (!d.image) { setPill("No plan image to send.", "err"); return; }
    const id = "r_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    setPill("Sending " + d.file + " to Read…", "busy");
    try {
      await ctx.write.rows("requests", [{ request_id: id, updated_at: new Date().toISOString(), deleted: false, file_name: String(d.file || "plan"), mime: d.mime || "image/jpeg", page: d.page || 1, kind: "HDB", region: "SG", image: d.image }], { signal: ctx.signal });
    } catch (err) {
      ctx.reportError(err);
      setPill(err && err.kind === "write-sign-in-required" ? (err.message || "Login to use the app.") : "Could not send the plan: " + (err && err.message ? err.message : err), "err");
      return;
    }
    try {
      const r = await fetch(PIPELINE, { method: "POST", signal: ctx.signal });
      if (r.headers.get("x-corvic-error-reason") === "SIGN_IN_REQUIRED") { setPill("Login to use the app.", "err"); return; }
      if (r.status === 401 || r.status === 403) {
        // Saved, but this session may not start runs. A run started by anyone allowed to, or on a schedule, picks it up.
        setPill("Plan saved. This session can't start the reader (" + r.status + "); it is read at the next run. Waiting…", "err");
        poll(id);
        return;
      }
      if (!r.ok) throw new Error("The reader could not start (" + r.status + ")");
    } catch (err) {
      if (ctx.signal.aborted) return;
      ctx.reportError(err);
      setPill(String(err.message || err), "err");
      return;
    }
    poll(id);
  }

  async function openPanel() {
    if (!panel.hidden) { panel.hidden = true; return; }
    panel.hidden = false;
    panel.innerHTML = "<h4>Your plan reads</h4><p>Only you see these. Load one back into the Studio.</p><p>Loading…</p>";
    try {
      reads = await freshReads("SELECT " + COLS + " FROM reads LIMIT 50");
    } catch (e) { ctx.reportError(e); reads = []; }
    panel.innerHTML = "<h4>Your plan reads</h4><p>Only you see these. Load one back into the Studio.</p>" +
      (reads.length ? reads.map((r, i) => `<div class="sp-row"><div><b>${esc(r.file_name)}</b><span>${esc(r.status)} · ${Math.round((r.read_conf || 0) * 100)}% · ${r.wall_count} walls</span></div><button type="button" data-i="${i}" ${r.status === "failed" ? "disabled" : ""}>Load</button></div>`).join("") : "<p>Nothing yet. Upload a plan in the Studio and press Send to Read.</p>");
    panel.querySelectorAll("button[data-i]").forEach((b) => b.addEventListener("click", () => { panel.hidden = true; deliver(reads[+b.dataset.i]); }, { signal: ctx.signal }));
    setPill(activeLabel, tone);
  }
  pill.addEventListener("click", openPanel, { signal: ctx.signal });

  window.addEventListener("message", (e) => {
    if (e.source !== frame.contentWindow) return;
    const d = e.data || {};
    if (d.type === "studio:ready") {
      load.hidden = true;
      post({ type: "space:auth", user: { name: "Designer", email: "designer@space.sg" }, plan: "designer", project: null, tour: false });
    } else if (d.type === "space:job") {
      post({ type: "space:job:res", id: d.id, ok: true, units: (d.meta && d.meta.units) || 1 });
    } else if (d.type === "space:read-upload") {
      upload(d);
    }
  }, { signal: ctx.signal });

  try {
    frame.srcdoc = await buildDoc(ctx.signal);
  } catch (err) {
    if (ctx.signal.aborted) return;
    ctx.reportError(err);
    load.textContent = "SPACE Studio could not load: " + (err && err.message ? err.message : err);
    return;
  }
  freshReads("SELECT request_id FROM reads LIMIT 50").then((r) => { reads = r; setPill("", ""); }, () => setPill("", ""));
}
