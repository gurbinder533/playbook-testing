import { esc, renderChrome, showLoadError, chip, statusLabel, statusClass, num } from "../lib/app.js";
import { WriteRejectedError, WriteSessionExpiredError } from "@corvic/live";

const ISSUES = ["Wall missing", "Wall should not be there", "Wall in wrong place", "Wall thickness", "Door missing", "Door in wrong place", "Door swing direction", "Window or opening", "Room label or type", "Scale", "Other"];
const ID_OK = /^[A-Za-z0-9_-]+$/;

// Module state outlives ctx.reload().
let selected = "";
let reviewer = "";
let flash = "";
let layers = { image: true, rooms: true, walls: true, openings: true, pins: true };

function parseJson(text, fallback) {
  try { const v = JSON.parse(text || ""); return v ?? fallback; } catch { return fallback; }
}

function latestBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const prev = m.get(r[key]);
    if (!prev || String(r.updated_at || "") >= String(prev.updated_at || "")) m.set(r[key], r);
  }
  return [...m.values()];
}

/** Turn the reader's reading into drawable shapes in one frame, whichever unit the model used. */
function buildModel(reading) {
  const scale = Number(reading?.scale?.scale_mm_per_px) || 0;
  // Door-check marks come back as d1..dn in image pixels, a different frame from the walls: leave them out.
  const walls = (reading?.walls || []).filter((w) => !/^d\d+$/.test(String(w.id)));
  const rooms = reading?.rooms || [];
  const xs = [], ys = [];
  for (const w of walls) { xs.push(w.x1, w.x2); ys.push(w.y1, w.y2); }
  for (const r of rooms) for (const p of r.polygon || []) { xs.push(p[0]); ys.push(p[1]); }
  if (!xs.length) return null;
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const extent = Math.max(maxX - minX, maxY - minY);
  // A flat is 6 to 15 m across: a frame wider than 3000 units is millimetres, otherwise image pixels.
  const isMm = extent > 3000 || !scale;
  const mmToFrame = isMm ? 1 : 1 / scale;
  const byId = new Map(walls.map((w) => [w.id, w]));
  const openings = [];
  for (const o of reading?.openings || []) {
    const w = byId.get(o.wall_id);
    if (!w) continue;
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const a = (Number(o.offset_mm) || 0) * mmToFrame, b = a + (Number(o.width_mm) || 0) * mmToFrame;
    openings.push({ ...o, x1: w.x1 + ux * a, y1: w.y1 + uy * a, x2: w.x1 + ux * b, y2: w.y1 + uy * b });
  }
  const pad = extent * 0.05;
  return { walls, rooms, openings, mmToFrame, isMm, scale, box: { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad }, extent };
}

function svgFor(m, pins) {
  const u = m.extent / 400; // one drawing unit for strokes
  const room = (r) => {
    const pts = (r.polygon || []).map((p) => `${p[0]},${p[1]}`).join(" ");
    const low = (r.confidence ?? 1) < 0.5;
    const cx = (r.polygon || []).reduce((s, p) => s + p[0], 0) / Math.max((r.polygon || []).length, 1);
    const cy = (r.polygon || []).reduce((s, p) => s + p[1], 0) / Math.max((r.polygon || []).length, 1);
    return `<g class="l-rooms"><polygon points="${pts}" fill="${low ? "#f1d9d1" : "#dfe6d3"}" fill-opacity="0.55" stroke="none" data-kind="room" data-id="${esc(r.id)}"/><text x="${cx}" y="${cy}" text-anchor="middle" font-size="${u * 7}" fill="#2b2a26" pointer-events="none">${esc(r.label_text || r.program_guess || r.id)}</text></g>`;
  };
  const wall = (w) => {
    const t = Math.max((Number(w.thickness_mm) || 120) * m.mmToFrame, u * 1.2);
    const low = (w.confidence ?? 1) < 0.5;
    return `<line class="l-walls" x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="${low ? "#a8503b" : "#2b2a26"}" stroke-width="${t}" ${low ? `stroke-dasharray="${u * 6} ${u * 4}"` : ""} stroke-linecap="butt" data-kind="wall" data-id="${esc(w.id)}"><title>${esc(w.id)}: confidence ${num(w.confidence, 2)}</title></line>`;
  };
  const colors = { door: "#a67b3d", window: "#3f7fa6", opening: "#5f6f4b" };
  const opening = (o) => `<line class="l-openings" x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${colors[o.kind] || "#7a7466"}" stroke-width="${u * 5}" stroke-linecap="round" data-kind="${esc(o.kind)}" data-id="${esc(o.id)}"><title>${esc(o.kind)} ${esc(o.id)} on ${esc(o.wall_id)}, ${num(o.width_mm)} mm, confidence ${num(o.confidence, 2)}</title></line>`;
  const pin = (p) => `<g class="l-pins"><circle cx="${p.x}" cy="${p.y}" r="${u * 6}" fill="#a8503b" stroke="#fffdf8" stroke-width="${u * 1.5}"/><text x="${p.x}" y="${p.y + u * 2.4}" text-anchor="middle" font-size="${u * 7}" font-weight="700" fill="#fffdf8" pointer-events="none">${p.pin_no}</text></g>`;
  return `<svg id="ov" viewBox="${m.box.x} ${m.box.y} ${m.box.w} ${m.box.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Detected walls, doors and rooms">${m.rooms.map(room).join("")}${m.walls.map(wall).join("")}${m.openings.map(opening).join("")}${pins.map(pin).join("")}<g id="draft"></g></svg>`;
}

function nearest(m, x, y) {
  let best = null;
  for (const w of m.walls) {
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - w.x1) * dx + (y - w.y1) * dy) / l2));
    const d = Math.hypot(x - (w.x1 + t * dx), y - (w.y1 + t * dy));
    if (!best || d < best.d) best = { d, kind: "wall", id: w.id };
  }
  for (const o of m.openings) {
    const mx = (o.x1 + o.x2) / 2, my = (o.y1 + o.y2) / 2;
    const d = Math.hypot(x - mx, y - my);
    if (!best || d < best.d) best = { d, kind: o.kind, id: o.id };
  }
  return best && best.d < m.extent * 0.03 ? best : { kind: "plan", id: "" };
}

export default async function render(ctx) {
  const main = renderChrome(ctx, "review");
  main.innerHTML = `<div class="load-note">Loading</div>`;
  try {
    const list = await ctx.db.rows(`SELECT request_id, file_name, status, wall_count, error FROM detections ORDER BY request_id LIMIT 200`, [], ctx.signal);
    if (ctx.signal.aborted) return;
    if (!list.length) {
      main.innerHTML = `<h1>Review a read</h1><p class="lede">Nothing has been read yet. Upload a plan, then run the pipeline from the top of the page. The reader takes about a minute and a half per plan.</p>`;
      return;
    }
    if (!list.some((r) => r.request_id === selected)) selected = (list.find((r) => !r.error && r.wall_count > 0) || list[0]).request_id;
    if (!ID_OK.test(selected)) throw new Error("Unexpected request id");
    const [det] = await ctx.db.rows(`SELECT * FROM detections WHERE request_id = '${selected}' LIMIT 1`, [], ctx.signal);
    const [req] = await ctx.db.rows(`SELECT image_b64, image_mime FROM requests WHERE request_id = '${selected}' LIMIT 1`, [], ctx.signal);
    const cRows = await ctx.db.rows(`SELECT * FROM comments WHERE request_id = '${selected}' LIMIT 2000`, [], ctx.signal);
    const dRows = await ctx.db.rows(`SELECT * FROM decisions WHERE request_id = '${selected}' LIMIT 500`, [], ctx.signal);
    if (ctx.signal.aborted) return;

    const reading = parseJson(det?.reading_json, null);
    const model = reading ? buildModel(reading) : null;
    const comments = latestBy(cRows, "comment_id").filter((c) => !c.deleted).sort((a, b) => Number(a.pin_no) - Number(b.pin_no));
    const decisions = latestBy(dRows, "decision_id").sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    const current = decisions[0];
    const message = flash; flash = "";
    const imgSrc = req?.image_b64 ? `data:${req.image_mime || "image/png"};base64,${req.image_b64}` : "";
    const notes = parseJson(det?.notes_json, []);
    const dchip = current ? chip(current.decision === "approved" ? "Approved" : "Disapproved", current.decision === "approved" ? "chip moss" : "chip brick") : chip("Not reviewed", "chip");

    main.innerHTML = `
      <h1>Review a read</h1>
      <p class="lede">The plan as uploaded, next to what the reader found: walls, doors and rooms. Mark what is wrong with a pin, then approve or disapprove the read. A pin saves a comment; nothing changes the reader until a person decides.</p>
      ${message ? `<div class="flash" role="status">${esc(message)}</div>` : ""}
      <div class="toolbar">
        <label class="small">Plan <select id="pick">${list.map((r) => `<option value="${esc(r.request_id)}"${r.request_id === selected ? " selected" : ""}>${esc(r.file_name || r.request_id)} (${esc(r.request_id.slice(0, 8))})</option>`).join("")}</select></label>
        ${chip(statusLabel(det?.status), statusClass(det?.status))} ${dchip}
        <span class="small">${num(det?.wall_count)} walls, ${model ? num(model.openings.length) : "0"} doors, windows and openings, ${model ? num(model.rooms.length) : "0"} rooms</span>
      </div>
      ${det?.error ? `<div class="card"><span class="err">Reader error: ${esc(det.error)}</span></div>` : ""}
      ${!model ? `<div class="empty-note">This read has no walls to draw.</div>` : `
      <div class="toolbar">
        ${[["image", "Original"], ["rooms", "Rooms"], ["walls", "Walls"], ["openings", "Doors and windows"], ["pins", "Pins"]].map(([k, l]) => `<label class="small"><input type="checkbox" data-layer="${k}"${layers[k] ? " checked" : ""}> ${l}</label>`).join("")}
        <button type="button" class="btn small" id="pinmode">Add a pin</button>
        <span class="small" id="pinhint"></span>
      </div>
      <div class="grid g2 review">
        <section class="card" id="p-image"><div class="card-head"><h2>Original plan</h2></div>${imgSrc ? `<img class="plan-img" alt="The uploaded plan" src="${imgSrc}">` : `<div class="empty-note">The uploaded image is not available.</div>`}</section>
        <section class="card"><div class="card-head"><h2>What the reader found</h2><p class="note">Dashed red walls are low confidence. Brown is a door, blue a window, green an opening. The reader does not give door swing direction: pin it as Door swing direction.</p></div>${svgFor(model, comments)}
          <div class="small legend">Frame read as ${model.isMm ? "millimetres" : `image pixels at ${num(model.scale, 1)} mm per pixel`}. Pins are saved in this frame.</div></section>
      </div>`}
      <section class="card">
        <div class="card-head"><h2>Decision</h2><p class="note">Your name goes on the decision and on every pin.</p></div>
        <div class="form-grid">
          <label class="field">Reviewer<input type="text" id="who" maxlength="80" value="${esc(reviewer)}"></label>
          <label class="field">Note<input type="text" id="dnote" maxlength="400" placeholder="Why"></label>
        </div>
        <div class="form-actions"><button type="button" class="btn" id="approve">Approve this read</button><button type="button" class="btn ghost" id="disapprove">Disapprove</button><span id="dmsg" role="status"></span></div>
        ${decisions.length ? `<ul class="issue-list">${decisions.slice(0, 5).map((d) => `<li><strong>${esc(d.decision)}</strong> by ${esc(d.reviewer || "unnamed")} at ${esc(d.updated_at)}${d.note ? `: ${esc(d.note)}` : ""}</li>`).join("")}</ul>` : ""}
      </section>
      <section class="card">
        <div class="card-head"><h2>Pins and comments</h2></div>
        <div id="pinform" hidden></div>
        ${comments.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Pin</th><th>On</th><th>Issue</th><th>Comment</th><th>By</th><th></th></tr></thead><tbody>${comments.map((c) => `<tr><td class="num">${esc(c.pin_no)}</td><td>${esc([c.target_kind, c.target_id].filter(Boolean).join(" "))}</td><td>${esc(c.issue_type)}</td><td>${esc(c.comment)}</td><td>${esc(c.reviewer)}</td><td><button type="button" class="btn small ghost" data-del="${esc(c.comment_id)}">Delete</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-note">No pins yet.</div>`}
      </section>
      ${notes.length ? `<section class="card"><div class="card-head"><h2>Reader notes</h2></div><ul class="issue-list">${notes.map((n) => `<li class="small">${esc(typeof n === "string" ? n : JSON.stringify(n))}</li>`).join("")}</ul></section>` : ""}`;

    const sig = { signal: ctx.signal };
    const $ = (s) => main.querySelector(s);
    const who = $("#who");
    who.addEventListener("input", () => { reviewer = who.value; }, sig);
    $("#pick").addEventListener("change", (e) => { selected = e.target.value; ctx.reload(); }, sig);

    const applyLayers = () => {
      for (const [k, on] of Object.entries(layers)) {
        const cls = { image: "#p-image", rooms: ".l-rooms", walls: ".l-walls", openings: ".l-openings", pins: ".l-pins" }[k];
        main.querySelectorAll(cls).forEach((el) => { el.style.display = on ? "" : "none"; });
      }
    };
    main.querySelectorAll("[data-layer]").forEach((cb) => cb.addEventListener("change", () => { layers[cb.dataset.layer] = cb.checked; applyLayers(); }, sig));
    applyLayers();

    const send = async (table, rows, okText) => {
      try {
        await ctx.write.rows(table, rows, { signal: ctx.signal });
        flash = okText;
        await ctx.reload();
      } catch (err) {
        if (ctx.signal.aborted) return;
        const msg = err instanceof WriteSessionExpiredError ? "Your session expired. Reload and try again. Nothing was saved."
          : err instanceof WriteRejectedError ? err.message : `Nothing was saved: ${err && err.message ? err.message : err}`;
        const el = $("#dmsg"); el.className = "err"; el.textContent = msg;
        ctx.reportError(err);
      }
    };
    const decide = (decision) => {
      if (!who.value.trim()) { const el = $("#dmsg"); el.className = "err"; el.textContent = "Add your name first."; return; }
      send("decisions", [{ decision_id: crypto.randomUUID(), request_id: selected, updated_at: new Date().toISOString(), decision, reviewer: who.value.trim(), note: $("#dnote").value.trim() }], decision === "approved" ? "Read approved." : "Read disapproved.");
    };
    $("#approve").addEventListener("click", () => decide("approved"), sig);
    $("#disapprove").addEventListener("click", () => decide("disapproved"), sig);
    main.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => {
      const c = comments.find((x) => x.comment_id === b.dataset.del);
      if (c) send("comments", [{ ...c, updated_at: new Date().toISOString(), deleted: true }], "Pin deleted.");
    }, sig));

    if (model) {
      const svg = $("#ov");
      const btn = $("#pinmode");
      const hint = $("#pinhint");
      let pinning = false;
      btn.addEventListener("click", () => {
        pinning = !pinning;
        btn.textContent = pinning ? "Cancel pin" : "Add a pin";
        btn.classList.toggle("active", pinning);
        hint.textContent = pinning ? "Click the drawing where the problem is." : "";
        svg.style.cursor = pinning ? "crosshair" : "";
        if (!pinning) { $("#pinform").hidden = true; $("#draft").innerHTML = ""; }
      }, sig);
      svg.addEventListener("click", (e) => {
        if (!pinning) return;
        const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
        const p = pt.matrixTransform(svg.getScreenCTM().inverse());
        const tgt = nearest(model, p.x, p.y);
        const u = model.extent / 400;
        $("#draft").innerHTML = `<circle cx="${p.x}" cy="${p.y}" r="${u * 6}" fill="none" stroke="#a8503b" stroke-width="${u * 2}"/>`;
        const next = comments.reduce((mx, c) => Math.max(mx, Number(c.pin_no) || 0), 0) + 1;
        const f = $("#pinform");
        f.hidden = false;
        f.innerHTML = `<div class="form-grid"><label class="field">Issue<select id="pi">${ISSUES.map((i) => `<option>${esc(i)}</option>`).join("")}</select></label><label class="field">Comment<input type="text" id="pc" maxlength="600"></label></div><p class="small">Pin ${next} near ${esc(tgt.kind)} ${esc(tgt.id)}</p><div class="form-actions"><button type="button" class="btn small" id="psave">Save pin</button><span id="pmsg" class="err"></span></div>`;
        f.querySelector("#psave").addEventListener("click", () => {
          if (!who.value.trim()) { f.querySelector("#pmsg").textContent = "Add your name in Decision first."; return; }
          send("comments", [{ comment_id: crypto.randomUUID(), request_id: selected, updated_at: new Date().toISOString(), pin_no: next, x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)), target_kind: tgt.kind, target_id: tgt.id, issue_type: f.querySelector("#pi").value, comment: f.querySelector("#pc").value.trim(), reviewer: who.value.trim(), deleted: false }], `Pin ${next} saved.`);
        }, sig);
      }, sig);
    }
  } catch (err) {
    if (ctx.signal.aborted) return;
    showLoadError(main, err, ctx);
  }
}
