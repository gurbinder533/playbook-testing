import { shell, esc, creditHtml, table, sevBadge, mountCompare, setImg, myIds, vis, KIND_LABEL, CLASSES, trunc, SEV_RANK } from "../lib/app.js";
import { drawHist, showOn } from "../lib/tagcard.js";

let mode = "slide";
let itemTab = "Equipment";

export default async function render(ctx) {
  const id = decodeURIComponent(ctx.route.params.id || "");
  if (showOn.go) { mode = "hist"; showOn.go = false; }
  ctx.content.innerHTML = shell("home", `<p><a href="home">← All sheets</a></p><div id="body"><p class="muted">Loading the sheet…</p></div>${creditHtml()}`);
  const body = ctx.content.querySelector("#body");
  try {
    const isSample = /^sample-\d\d$/.test(id);
    const sh = (await ctx.db.rows(`SELECT * FROM sheets WHERE drawing_id = ? LIMIT 1`, [id], ctx.signal))[0];
    if (ctx.signal.aborted) return;
    if (!sh) {
      const n = isSample ? id.slice(-2) : "";
      body.innerHTML = `<h1>${isSample ? "Sample sheet " + Number(n) : "Drawing"}</h1><div class="notice info">Not read yet. ${isSample ? "The reader has not produced a result for this sample." : "Press “Read my drawings” on My drawings to read it."}</div>`;
      return;
    }
    if (!sh.is_pid) { body.innerHTML = `<h1>${esc(sh.file || id)}</h1><div class="notice"><b>This does not look like a P&amp;ID.</b> ${esc(sh.note || "")} Upload a piping and instrumentation diagram to read it.</div>`; return; }
    if (!sh.ok) { body.innerHTML = `<h1>${esc(sh.file || id)}</h1><div class="notice"><b>The reader could not finish this drawing.</b> ${esc(sh.error || "Unknown error")} It will be tried again on the next run.</div>`; return; }

    const [syms, key, qa, conns, imgs] = await Promise.all([
      ctx.db.rows(`SELECT symbol_id, kind, type, tag, x0, y0, x1, y1, conf, check_status, connected FROM symbols WHERE drawing_id = ? LIMIT 3000`, [id], ctx.signal),
      ctx.db.rows(`SELECT key_id, cls, x0, y0, x1, y1, status FROM answer_key WHERE drawing_id = ? LIMIT 3000`, [id], ctx.signal),
      ctx.db.rows(`SELECT item_id, tag, kind, reason, severity, conf FROM qa WHERE drawing_id = ? LIMIT 400`, [id], ctx.signal),
      ctx.db.rows(`SELECT line_number, from_tag, to_tag, medium, border_side FROM connections WHERE drawing_id = ? LIMIT 3000`, [id], ctx.signal),
      ctx.db.rows(`SELECT orig_b64, rebuilt_b64 FROM images WHERE drawing_id = ? LIMIT 1`, [id], ctx.signal),
    ]);
    if (ctx.signal.aborted) return;
    const img = imgs[0];
    const cnt = (k) => syms.filter((s) => s.kind === k).length;
    const fields = [["Title", sh.title], ["Drawing number", sh.drawing_number], ["Revision", sh.revision], ["Date", sh.doc_date], ["Project", sh.project], ["Scale", sh.scale], ["Sheet", sh.sheet_no], ["File", sh.file ? sh.file + (sh.page > 1 || !/^sample/.test(id) ? " (page " + sh.page + ")" : "") : ""]];
    const hasKey = key.length > 0;
    body.innerHTML = `
<h1>${esc(sh.title || sh.file || id)}</h1>
<div class="card"><h2>What the reader found</h2>
  <div class="grid g2"><dl class="kv">${fields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v || "—")}</dd>`).join("")}</dl>
  <div class="stats">${[["valves", sh.n_valves], ["instruments", sh.n_instruments], ["equipment", sh.n_equipment - sh.n_pumps - sh.n_tanks], ["pumps", sh.n_pumps], ["tanks", sh.n_tanks], ["connections", sh.n_connections], ["not connected", sh.n_unconnected], ["control loops", sh.n_loops]].map(([l, n]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("")}</div></div></div>
<div class="card" style="margin-top:16px"><h2>Original vs rebuilt</h2>
  <div class="seg" id="modes"><button type="button" data-m="slide">Slide to compare</button><button type="button" data-m="side">Side by side</button><button type="button" data-m="check">Check detections</button><button type="button" data-m="hist">Historian match</button></div>
  <div id="view"></div></div>
<div class="card" style="margin-top:16px"><h2>Extracted items</h2><div class="tabs" id="itabs"></div><div id="items"></div></div>
<div class="card" style="margin-top:16px"><h2>Worth a second look</h2><div id="look"></div></div>`;

    const view = body.querySelector("#view");
    const drawView = () => {
      body.querySelectorAll("#modes button").forEach((b) => b.classList.toggle("on", b.dataset.m === mode));
      if (!img) { view.innerHTML = `<p class="muted">The drawing images are not available.</p>`; return; }
      if (mode === "hist") { drawHist(ctx, view, { id, sh, img, syms }); return; }
      if (mode === "slide") { mountCompare(view, img.orig_b64, img.rebuilt_b64, sh.width, sh.height, ctx.signal); return; }
      if (mode === "side") {
        view.innerHTML = `<div class="grid g2"><div><div class="small muted">Original</div><img class="s-a" style="width:100%;border:1px solid var(--border);border-radius:10px" alt="Original"></div><div><div class="small muted">Rebuilt</div><img class="s-b" style="width:100%;border:1px solid var(--border);border-radius:10px" alt="Rebuilt"></div></div>`;
        setImg(view.querySelector(".s-a"), img.orig_b64, "image/jpeg");
        setImg(view.querySelector(".s-b"), img.rebuilt_b64, "image/png");
        return;
      }
      if (!hasKey) { view.innerHTML = `<div class="notice info">There is no answer key for this drawing, so detections cannot be scored. Showing what was found.</div><div class="det" id="det"><img alt="Original"><svg viewBox="0 0 ${sh.width} ${sh.height}" preserveAspectRatio="none"></svg></div>`; }
      else view.innerHTML = `<div class="legend"><span><i style="background:#16a34a"></i>Found</span><span><i style="background:#dc2626"></i>In the key, not found</span><span><i style="background:#f59e0b"></i>Found, not in the key</span></div><div class="det" id="det"><img alt="Original"><svg viewBox="0 0 ${sh.width} ${sh.height}" preserveAspectRatio="none"></svg></div><div id="score"></div>`;
      const det = view.querySelector("#det");
      setImg(det.querySelector("img"), img.orig_b64, "image/jpeg");
      const sw = Math.max(2, sh.width / 450);
      const R = (o, color, dash) => `<rect x="${o.x0}" y="${o.y0}" width="${Math.max(1, o.x1 - o.x0)}" height="${Math.max(1, o.y1 - o.y0)}" fill="none" stroke="${color}" stroke-width="${sw}" ${dash ? `stroke-dasharray="${sw * 3} ${sw * 2}"` : ""}/>`;
      let g = "";
      if (hasKey) {
        g += syms.filter((s) => s.check_status === "found").map((s) => R(s, "#16a34a")).join("");
        g += key.filter((k) => k.status !== "found").map((k) => R(k, "#dc2626", true)).join("");
        g += syms.filter((s) => s.check_status === "extra").map((s) => R(s, "#f59e0b")).join("");
      } else g += syms.filter((s) => s.kind !== "line label").map((s) => R(s, "#16a34a")).join("");
      det.querySelector("svg").innerHTML = g;
      if (hasKey) {
        const rows = CLASSES.map(([c, l]) => { const k = key.filter((x) => x.cls === c); const f = k.filter((x) => x.status === "found").length; return { l, inKey: k.length, found: f, missed: k.length - f }; });
        const tk = rows.reduce((a, r) => a + r.inKey, 0), tf = rows.reduce((a, r) => a + r.found, 0);
        const nFound = syms.filter((s) => s.check_status === "found").length, nMiss = key.filter((k) => k.status !== "found").length, nExtra = syms.filter((s) => s.check_status === "extra").length;
        view.querySelector("#score").innerHTML = `<p><b>${tf} of ${tk}</b> key symbols found (${tk ? Math.round((100 * tf) / tk) : 0}%). ${nMiss} missed, ${nExtra} found but not in the key. (${nFound} matches drawn in green.)</p>` +
          table([["Symbol type", (r) => esc(r.l)], ["In the key", (r) => r.inKey], ["Found", (r) => r.found], ["Missed", (r) => `<span class="${r.missed ? "badge fail" : ""}">${r.missed}</span>`]], rows) +
          `<p class="muted small">The key is the public PID2Graph hand annotation of this sheet. It lists valves, instruments, pumps and tanks, so heat exchangers and other equipment are not scored. A key symbol counts as found when a detected item of a compatible kind has its centre within 1.5% of the sheet width; each detection matches one key symbol, nearest first.</p>`;
      }
    };
    drawView();
    body.querySelectorAll("#modes button").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.m; drawView(); }, { signal: ctx.signal }));

    const tabsDef = {
      Equipment: () => table([["Tag", (r) => esc(r.tag || "—")], ["Kind", (r) => esc(KIND_LABEL[r.kind] || r.kind)], ["Type", (r) => esc(r.type)], ["Confidence", (r) => Math.round(r.conf * 100) + "%"], ["Connected", (r) => (r.connected ? "yes" : "no")]], syms.filter((s) => ["equipment", "pump", "tank", "off-page connector"].includes(s.kind)), "No equipment found."),
      Instruments: () => table([["Tag", (r) => esc(r.tag || "—")], ["Type", (r) => esc(r.type)], ["Confidence", (r) => Math.round(r.conf * 100) + "%"], ["Connected", (r) => (r.connected ? "yes" : "no")]], syms.filter((s) => s.kind === "instrument"), "No instruments found."),
      Valves: () => table([["Tag", (r) => esc(r.tag || "no printed tag")], ["Type", (r) => esc(r.type)], ["Confidence", (r) => Math.round(r.conf * 100) + "%"], ["Connected", (r) => (r.connected ? "yes" : "no")]], syms.filter((s) => s.kind === "valve"), "No valves found."),
      Lines: () => table([["Line number", (r) => esc(r.line_number || "—")], ["From", (r) => esc(r.from_tag || "(untagged)")], ["To", (r) => esc(r.to_tag || (r.border_side ? "sheet edge: " + r.border_side : "(untagged)"))], ["Medium", (r) => esc(r.medium)]], conns.filter((c) => c.line_number), "No line numbers were read."),
    };
    const tabsEl = body.querySelector("#itabs");
    const itemsEl = body.querySelector("#items");
    const drawItems = () => {
      tabsEl.innerHTML = Object.keys(tabsDef).map((t) => `<button type="button" class="${t === itemTab ? "on" : ""}" data-t="${t}">${t}</button>`).join("");
      itemsEl.innerHTML = tabsDef[itemTab]();
      tabsEl.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { itemTab = b.dataset.t; drawItems(); }, { signal: ctx.signal }));
    };
    drawItems();
    const look = qa.filter((q) => q.severity !== "info").sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9)).slice(0, 12);
    body.querySelector("#look").innerHTML = look.length ? `<ul style="margin:0;padding-left:18px">${look.map((q) => `<li>${sevBadge(q.severity)} <b>${esc(q.tag || KIND_LABEL[q.kind] || q.kind)}</b> — ${esc(trunc(q.reason, 140))}</li>`).join("")}</ul><p><a href="qa">All QA items</a></p>` : `<p class="muted">Nothing flagged.</p>`;
  } catch (e) {
    if (ctx.signal.aborted) return;
    ctx.reportError(e);
    body.innerHTML = `<div class="notice">This sheet could not be loaded. Try Reload in a moment.</div>`;
  }
}
