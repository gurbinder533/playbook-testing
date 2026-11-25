import { shell, esc, creditHtml, handoff, CATS, catOf, KIND_LABEL } from "../lib/app.js";

let sheetSel = "sample-04";
const on = new Set(CATS.filter((c) => c[0] !== "line").map((c) => c[0]));
const edgeOn = new Set(["flow", "controls", "measures", "signal"]);
let lowOnly = false;
let paused = false;

// One shape and one colour for each kind of thing on a P&ID.
const NODE = {
  equipment: { label: "Equipment", color: "#f5b72b", size: 10 },
  tank: { label: "Vessel / tank", color: "#fb923c", size: 9 },
  pump: { label: "Pump", color: "#34d399", size: 8 },
  valve: { label: "Valve", color: "#7dd3fc", size: 6 },
  control: { label: "Control / motor valve", color: "#0ea5e9", size: 6 },
  instrument: { label: "Instrument", color: "#a78bfa", size: 5.5 },
  offpage: { label: "Off-page connector", color: "#2dd4bf", size: 6 },
  border: { label: "Border / other", color: "#94a3b8", size: 4 },
};
const NODE_ORDER = ["equipment", "tank", "pump", "valve", "control", "instrument", "offpage", "border"];
// One colour, dash and arrow for each kind of connection.
const EDGE = {
  flow: { label: "Process flow (pipe)", color: "#8aa9ff", dash: "", w: 1.6 },
  controls: { label: "Control signal to a valve", color: "#fbbf24", dash: "6 4", w: 1.6 },
  measures: { label: "Instrument to instrument", color: "#f472b6", dash: "1.5 4", w: 1.6 },
  signal: { label: "Instrument signal", color: "#22d3ee", dash: "3 4", w: 1.6 },
};
const EDGE_ORDER = ["flow", "controls", "measures", "signal"];

const styleOf = (n) => {
  if (n.kind === "tank") return "tank";
  if (n.kind === "pump") return "pump";
  if (n.kind === "equipment") return "equipment";
  if (n.kind === "valve") return /control|motor/i.test(n.type || "") ? "control" : "valve";
  if (n.kind === "instrument") return "instrument";
  if (n.kind === "off-page connector") return "offpage";
  return "border";
};

const shape = (k, s, col) => {
  const bow = `<path d="M${-s} ${-s * 0.7}L${s} ${s * 0.7}L${s} ${-s * 0.7}L${-s} ${s * 0.7}Z" fill="${col}"/>`;
  switch (k) {
    case "equipment": return `<rect x="${-s}" y="${-s}" width="${2 * s}" height="${2 * s}" rx="${s * 0.3}" fill="${col}"/>`;
    case "tank": return `<rect x="${-s * 0.75}" y="${-s * 1.15}" width="${s * 1.5}" height="${s * 2.3}" rx="${s * 0.7}" fill="${col}"/>`;
    case "pump": return `<circle r="${s}" fill="${col}"/><path d="M${-s * 0.35} ${-s * 0.5}L${s * 0.6} 0L${-s * 0.35} ${s * 0.5}Z" fill="#14103a"/>`;
    case "valve": return bow;
    case "control": return `${bow}<path d="M0 0V${-s * 1.1}" stroke="${col}" stroke-width="1.3"/><circle cy="${-s * 1.5}" r="${s * 0.55}" fill="${col}"/>`;
    case "instrument": return `<circle r="${s}" fill="${col}"/><circle r="${s * 0.48}" fill="#14103a"/>`;
    case "offpage": return `<path d="M${-s} ${-s * 0.8}H${s * 0.3}L${s} 0L${s * 0.3} ${s * 0.8}H${-s}Z" fill="${col}"/>`;
    default: return `<rect x="${-s * 0.7}" y="${-s * 0.7}" width="${s * 1.4}" height="${s * 1.4}" fill="${col}" transform="rotate(45)"/>`;
  }
};

export default async function render(ctx) {
  const t0 = performance.now();
  ctx.content.innerHTML = shell("graph", `<h1>Graph Explorer</h1><p class="muted">Equipment, valves, instruments and streams as a connected graph. Each kind of thing has its own shape and colour, and each kind of connection its own line. It behaves like a physical model: drag a node or a line and everything attached swings along.</p>
<div class="explorer"><aside class="card side"><label>Sheet</label><select id="sheet"></select><label>Find a tag</label><input type="search" id="q" placeholder="e.g. TT-105, pump, level"><label>Show</label><div class="chips" id="chips"></div>
<label class="chk"><input type="checkbox" id="low"> Highlight low-confidence only</label>
<label>Things</label><div id="lgnodes"></div>
<label>Connections (click to hide or show)</label><div id="lgedges"></div>
<div class="links"><button type="button" id="fit">Fit to view</button><button type="button" id="pause">Pause</button><button type="button" id="relayout">Reset layout</button></div><p class="cnt" id="count">Loading…</p></aside>
<div class="canvas" id="canvas"><svg id="svg" viewBox="0 0 1000 700"></svg><div class="hint">Drag a node or a line to push the graph around · drag the background to pan · scroll to zoom · click a node for details</div><div class="tip" id="tip" hidden></div><div class="panel" id="panel" hidden></div></div></div>${creditHtml()}`);
  const $ = (s) => ctx.content.querySelector(s);
  let sheets = [], syms = [], conns = [];
  const loadFor = (id) => {
    const where = id === "all" ? "" : " AND drawing_id = ?";
    const args = id === "all" ? [] : [id];
    return Promise.all([
      ctx.db.rows(`SELECT drawing_id, symbol_id, kind, tag, type, x0, y0, x1, y1, conf, connected FROM symbols WHERE kind <> 'line label'${where} LIMIT 6000`, args, ctx.signal),
      ctx.db.rows(`SELECT drawing_id, from_id, to_id, line_number, medium FROM connections WHERE to_id <> ''${where} LIMIT 9000`, args, ctx.signal),
    ]);
  };
  try {
    sheets = await ctx.db.rows(`SELECT drawing_id, title, width, height FROM sheets WHERE ok ORDER BY drawing_id LIMIT 60`, [], ctx.signal);
    if (ctx.signal.aborted) return;
    if (!sheets.length) { $("#count").textContent = "No sheet has been read yet."; return; }
    if (!sheets.some((s) => s.drawing_id === sheetSel) && sheetSel !== "all") sheetSel = sheets[0].drawing_id;
    [syms, conns] = await loadFor(sheetSel);
  } catch (e) { if (ctx.signal.aborted) return; ctx.reportError(e); $("#count").textContent = "The graph could not be loaded."; return; }
  if (ctx.signal.aborted) return;
  const sel = $("#sheet");
  sel.innerHTML = sheets.map((s) => `<option value="${esc(s.drawing_id)}">${esc(s.title || s.drawing_id)} · sheet ${Number(s.drawing_id.slice(-2))}</option>`).join("") + `<option value="all">All sheets (${sheets.length})</option>`;
  sel.value = sheetSel;
  $("#chips").innerHTML = CATS.filter((c) => c[0] !== "line").map(([k, l, c]) => `<button type="button" class="chip" data-k="${k}"><i style="background:${c}"></i>${esc(l)}</button>`).join("");
  const svg = $("#svg"), panel = $("#panel"), tip = $("#tip"), canvas = $("#canvas");
  const dim = new Map(sheets.map((s) => [s.drawing_id, s]));
  let view = { x: 0, y: 0, w: 1000, h: 700 };
  const setView = () => {
    svg.setAttribute("viewBox", `${view.x.toFixed(1)} ${view.y.toFixed(1)} ${view.w.toFixed(1)} ${view.h.toFixed(1)}`);
    svg.classList.toggle("zoomed", view.w < 450);
  };
  let nodes = new Map(), edges = [], query = "", selId = null;
  let cur = { vis: [], es: [] };
  const nodeEls = new Map();
  let centers = new Map();
  const edgeClass = (a, b, c) => { if (c.medium !== "signal") return "flow"; if (b.kind === "valve") return "controls"; if (a.kind === "instrument" && b.kind === "instrument") return "measures"; return "signal"; };
  const labelOf = (n) => n.tag || `${KIND_LABEL[n.kind] || n.kind}${n.type ? " · " + n.type : ""}`;
  const single = () => sheetSel !== "all";
  const rad = (n) => NODE[n.st].size * (single() ? 1 : 0.6);
  const layout = (list, es) => {
    const n = list.length; if (n < 2) return;
    const idx = new Map(list.map((p, i) => [p.symbol_id, i]));
    const pairs = es.map((e) => [idx.get(e.a.symbol_id), idx.get(e.b.symbol_id)]);
    const k = Math.sqrt((1000 * 700) / n) * 0.6;
    for (let it = 0; it < 160; it++) {
      const t = 1 - it / 160;
      const fx = new Float64Array(n), fy = new Float64Array(n);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const dx = list[i].cx - list[j].cx, dy = list[i].cy - list[j].cy; const d2 = dx * dx + dy * dy + 0.01; if (d2 > k * k * 16) continue;
        const f = (k * k) / d2; fx[i] += dx * f; fy[i] += dy * f; fx[j] -= dx * f; fy[j] -= dy * f;
      }
      for (const [a, b] of pairs) { const dx = list[a].cx - list[b].cx, dy = list[a].cy - list[b].cy; const f = 0.06; fx[a] -= dx * f; fy[a] -= dy * f; fx[b] += dx * f; fy[b] += dy * f; }
      for (let i = 0; i < n; i++) { const m = Math.sqrt(fx[i] * fx[i] + fy[i] * fy[i]) + 0.01; const s = Math.min(m, 14 * t + 1) / m; list[i].cx += fx[i] * s; list[i].cy += fy[i] * s; }
    }
  };
  const build = () => {
    const ids = sheetSel === "all" ? sheets.map((s) => s.drawing_id) : [sheetSel];
    nodes = new Map(); edges = [];
    const cols = sheetSel === "all" ? 4 : 1;
    ids.forEach((id, i) => {
      const d = dim.get(id); if (!d) return;
      const ox = (i % cols) * 1100, oy = Math.floor(i / cols) * 800;
      const sc = 1000 / Math.max(d.width, d.height);
      for (const s of syms) if (s.drawing_id === id) nodes.set(s.symbol_id, { ...s, st: styleOf(s), vx: 0, vy: 0, pin: false, cx: ox + ((s.x0 + s.x1) / 2) * sc, cy: oy + ((s.y0 + s.y1) / 2) * sc });
    });
    for (const c of conns) { const a = nodes.get(c.from_id), b = nodes.get(c.to_id); if (a && b) edges.push({ ...c, a, b, cls: edgeClass(a, b, c) }); }
    if (sheetSel !== "all") layout([...nodes.values()], edges);
    // Each sheet keeps a weak pull toward where it started, so loose parts do not drift away.
    centers = new Map(); const acc = new Map();
    for (const n of nodes.values()) { const a = acc.get(n.drawing_id) || { x: 0, y: 0, c: 0 }; a.x += n.cx; a.y += n.cy; a.c += 1; acc.set(n.drawing_id, a); }
    for (const [id, a] of acc) centers.set(id, { x: a.x / a.c, y: a.y / a.c });
  };
  // Put a line between two nodes, stopping at their edges so the arrow is visible.
  const place = (e) => {
    const dx = e.b.cx - e.a.cx, dy = e.b.cy - e.a.cy; const d = Math.hypot(dx, dy) || 1;
    const ra = rad(e.a) * 0.9, rb = rad(e.b) * 1.1 + 1.5;
    const x1 = (e.a.cx + (dx / d) * ra).toFixed(1), y1 = (e.a.cy + (dy / d) * ra).toFixed(1), x2 = (e.b.cx - (dx / d) * rb).toFixed(1), y2 = (e.b.cy - (dy / d) * rb).toFixed(1);
    for (const el of [e.el, e.hit]) if (el) { el.setAttribute("x1", x1); el.setAttribute("y1", y1); el.setAttribute("x2", x2); el.setAttribute("y2", y2); }
  };
  const paint = () => {
    for (const n of cur.vis) { const g = nodeEls.get(n.symbol_id); if (g) g.setAttribute("transform", `translate(${n.cx.toFixed(1)} ${n.cy.toFixed(1)})`); }
    for (const e of cur.es) place(e);
  };
  // ---- Physics: nodes push each other apart, connections are springs, and a pinned (dragged) node drags the rest. ----
  let raf = 0, alpha = 0;
  const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
  const heat = (a = 0.6) => { alpha = Math.max(alpha, a); if (!raf && !paused && !ctx.signal.aborted) raf = requestAnimationFrame(tick); };
  ctx.signal.addEventListener("abort", stop, { once: true });
  function tick() {
    raf = 0;
    if (paused || ctx.signal.aborted) return;
    const vis = cur.vis, es = cur.es; const N = vis.length;
    if (!N) return;
    const A = alpha, C = 56, L = 34;
    const fx = new Float64Array(N), fy = new Float64Array(N);
    const cells = new Map();
    vis.forEach((n, i) => { n.i = i; const key = Math.floor(n.cx / C) * 100003 + Math.floor(n.cy / C); const l = cells.get(key); if (l) l.push(n); else cells.set(key, [n]); });
    for (const n of vis) {
      const gx = Math.floor(n.cx / C), gy = Math.floor(n.cy / C);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const l = cells.get((gx + ox) * 100003 + gy + oy); if (!l) continue;
        for (const m of l) {
          if (m.i <= n.i) continue;
          let dx = n.cx - m.cx, dy = n.cy - m.cy; let d2 = dx * dx + dy * dy; if (d2 > C * C) continue;
          if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = dx * dx + dy * dy; }
          const d = Math.sqrt(d2), minD = rad(n) + rad(m) + 5;
          const f = 240 / (d2 + 20) + (d < minD ? (minD - d) * 0.5 : 0);
          const ux = dx / d, uy = dy / d;
          fx[n.i] += ux * f; fy[n.i] += uy * f; fx[m.i] -= ux * f; fy[m.i] -= uy * f;
        }
      }
    }
    for (const e of es) {
      const dx = e.b.cx - e.a.cx, dy = e.b.cy - e.a.cy; const d = Math.hypot(dx, dy) || 1;
      const f = (d - L) * 0.06, ux = dx / d, uy = dy / d;
      fx[e.a.i] += ux * f; fy[e.a.i] += uy * f; fx[e.b.i] -= ux * f; fy[e.b.i] -= uy * f;
    }
    for (const n of vis) {
      if (n.pin) { n.vx = 0; n.vy = 0; continue; }
      const c = centers.get(n.drawing_id);
      if (c) { fx[n.i] += (c.x - n.cx) * 0.004; fy[n.i] += (c.y - n.cy) * 0.004; }
      n.vx = Math.max(-12, Math.min(12, (n.vx + fx[n.i] * A) * 0.72)); n.vy = Math.max(-12, Math.min(12, (n.vy + fy[n.i] * A) * 0.72));
      n.cx += n.vx; n.cy += n.vy;
    }
    alpha *= 0.985;
    paint();
    if (alpha < 0.012 && !drag) { alpha = 0; return; }
    raf = requestAnimationFrame(tick);
  }
  const draw = () => {
    const q = query.trim().toLowerCase();
    const vis = [...nodes.values()].filter((n) => on.has(catOf(n.kind)));
    const visIds = new Set(vis.map((n) => n.symbol_id));
    const bothVis = edges.filter((e) => visIds.has(e.a.symbol_id) && visIds.has(e.b.symbol_id));
    const es = bothVis.filter((e) => edgeOn.has(e.cls));
    const match = (n) => q && (labelOf(n).toLowerCase().includes(q) || (n.type || "").toLowerCase().includes(q));
    const dimmed = (n) => (lowOnly && n.conf >= 0.6) || (q && !match(n));
    const sel0 = selId ? nodes.get(selId) : null;
    const defs = `<defs>${EDGE_ORDER.map((k) => `<marker id="ar-${k}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4.5" markerHeight="4.5" markerUnits="strokeWidth" orient="auto"><path d="M0 0L10 5L0 10Z" fill="${EDGE[k].color}"/></marker>`).join("")}</defs>`;
    cur = { vis, es };
    es.forEach((e, i) => { e.i = i; });
    const edgeSvg = es.map((e) => {
      const s = EDGE[e.cls];
      const faded = ((lowOnly || q) && dimmed(e.a) && dimmed(e.b)) || (sel0 && e.a !== sel0 && e.b !== sel0);
      const hot = sel0 && (e.a === sel0 || e.b === sel0);
      return `<line class="ev" data-ei="${e.i}" stroke="${s.color}" stroke-opacity="${faded ? 0.1 : hot ? 1 : 0.6}" stroke-width="${(single() ? s.w * 0.75 : s.w * 0.45) * (hot ? 1.8 : 1)}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ""} marker-end="url(#ar-${e.cls})" pointer-events="none"/>`;
    }).join("");
    const hitSvg = es.map((e) => `<line class="eh" data-ei="${e.i}" stroke="transparent" stroke-width="${single() ? 9 : 6}" stroke-linecap="round"/>`).join("");
    const nodeSvg = vis.map((n) => {
      const st = NODE[n.st], r = rad(n), d = dimmed(n), m = match(n), low = n.conf < 0.6;
      const ring = n.symbol_id === selId || m ? `<circle r="${r + 4}" fill="none" stroke="#fff" stroke-width="1.6"/>` : lowOnly && low ? `<circle r="${r + 3}" fill="none" stroke="#f59e0b" stroke-width="1.5"/>` : "";
      const halo = `<circle r="${(r * 2.3).toFixed(1)}" fill="${st.color}" opacity="0.14"/><circle r="${(r * 1.5).toFixed(1)}" fill="${st.color}" opacity="0.18"/>`;
      const always = n.st === "equipment" || n.st === "tank" || n.st === "pump";
      const lbl = single() && n.tag && !d ? `<text class="lb${always ? "" : " lbs"}" y="${(-r * 1.55 - 3).toFixed(1)}" font-size="${always ? 8 : 6.5}" font-weight="700" fill="${always ? "#fde68a" : "#e2e8f0"}" text-anchor="middle" pointer-events="none">${esc(n.tag)}</text>` : "";
      return `<g class="nd" data-id="${esc(n.symbol_id)}" transform="translate(${n.cx.toFixed(1)} ${n.cy.toFixed(1)})" opacity="${d ? 0.2 : 1}">${halo}${ring}${shape(n.st, r, st.color)}${lbl}</g>`;
    }).join("");
    svg.innerHTML = `${defs}<g>${edgeSvg}</g><g>${hitSvg}</g><g>${nodeSvg}</g>`;
    nodeEls.clear();
    svg.querySelectorAll(".nd").forEach((g) => nodeEls.set(g.dataset.id, g));
    const evs = svg.querySelectorAll("line.ev"), ehs = svg.querySelectorAll("line.eh");
    es.forEach((e, i) => { e.el = evs[i]; e.hit = ehs[i]; place(e); });
    const nc = {}; for (const n of vis) nc[n.st] = (nc[n.st] || 0) + 1;
    $("#lgnodes").innerHTML = NODE_ORDER.filter((k) => nc[k]).map((k) => `<div class="lgx"><svg width="26" height="26" viewBox="-13 -14 26 26" aria-hidden="true">${shape(k, 7, NODE[k].color)}</svg><span>${esc(NODE[k].label)}</span><b>${nc[k]}</b></div>`).join("") || `<p class="muted small">Nothing shown.</p>`;
    const ec = {}; for (const e of bothVis) ec[e.cls] = (ec[e.cls] || 0) + 1;
    $("#lgedges").innerHTML = EDGE_ORDER.map((k) => { const s = EDGE[k]; return `<button type="button" class="lgx e${edgeOn.has(k) ? "" : " off"}" data-e="${k}" aria-pressed="${edgeOn.has(k)}"><svg width="38" height="14" viewBox="0 0 38 14" aria-hidden="true"><line x1="1" y1="7" x2="30" y2="7" stroke="${s.color}" stroke-width="2" ${s.dash ? `stroke-dasharray="${s.dash}"` : ""}/><path d="M37 7L29 3V11Z" fill="${s.color}"/></svg><span>${esc(s.label)}</span><b>${ec[k] || 0}</b></button>`; }).join("");
    const lone = vis.filter((n) => !n.connected).length;
    $("#count").textContent = `${vis.length} nodes, ${es.length} connections${lone ? `, ${lone} with no connection (flagged for review)` : ""}`;
    ctx.content.querySelectorAll("#chips .chip").forEach((c) => c.classList.toggle("on", on.has(c.dataset.k)));
    $("#pause").textContent = paused ? "Play" : "Pause";
  };
  const fit = () => {
    const pts = [...nodes.values()].filter((n) => on.has(catOf(n.kind))); if (!pts.length) return;
    const xs = pts.map((p) => p.cx), ys = pts.map((p) => p.cy);
    const x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 30, y0 = Math.min(...ys) - 30, y1 = Math.max(...ys) + 30;
    const r = svg.getBoundingClientRect(); const ar = (r.width || 1000) / (r.height || 700);
    const w = x1 - x0, h = y1 - y0;
    view = w / h > ar ? { x: x0, w, h: w / ar, y: y0 - (w / ar - h) / 2 } : { y: y0, h, w: h * ar, x: x0 - (h * ar - w) / 2 };
    setView();
  };
  const conf = (c) => `<span class="pill-c ${c >= 0.8 ? "" : c >= 0.6 ? "mid" : "low"}">${Math.round(c * 100)}% confidence</span>`;
  const showPanel = (id) => {
    const n = nodes.get(id); if (!n) return; selId = id;
    const inn = edges.filter((e) => e.b === n), out = edges.filter((e) => e.a === n);
    const li = (e, o) => `<li><a data-go="${esc(o.symbol_id)}">${esc(labelOf(o))}</a>${e.line_number ? ` <small>· ${esc(e.line_number)}</small>` : ""}${e.cls !== "flow" ? ` <small>· ${esc(EDGE[e.cls].label.toLowerCase())}</small>` : ""}</li>`;
    panel.hidden = false;
    panel.innerHTML = `<button class="px" type="button" aria-label="Close" id="x">✕</button><div class="ptype">${esc(NODE[n.st].label)}${n.type ? " · " + esc(n.type) : ""}</div><div class="ptag">${esc(n.tag || "(no printed tag)")}</div><div class="pname">${esc(n.type || KIND_LABEL[n.kind] || n.kind)} · sheet ${Number(n.drawing_id.slice(-2))}</div><div>${conf(n.conf)}${n.connected ? "" : ' <span class="pill-c low">no connection found</span>'}</div><h4>Coming in (${inn.length})</h4><ul>${inn.map((e) => li(e, e.a)).join("") || "<li><small>nothing</small></li>"}</ul><h4>Going out (${out.length})</h4><ul>${out.map((e) => li(e, e.b)).join("") || "<li><small>nothing</small></li>"}</ul>${n.tag ? `<button class="btn" type="button" id="askb" style="margin-top:14px;width:100%">Ask the plant about ${esc(n.tag)}</button>` : ""}`;
    draw();
  };
  const closePanel = () => { panel.hidden = true; selId = null; draw(); };
  panel.addEventListener("click", (e) => {
    if (e.target.closest("#x")) { closePanel(); return; }
    const g = e.target.closest("[data-go]"); if (g) { showPanel(g.dataset.go); return; }
    if (e.target.closest("#askb")) { const n = nodes.get(selId); if (n?.tag) { handoff.q = `What is ${n.tag} connected to, and what is upstream and downstream of it?`; ctx.navigate("ask"); } }
  }, { signal: ctx.signal });
  build(); draw(); fit(); heat(single() ? 0.25 : 0.6);
  const ms = performance.now() - t0;
  window.__pidGraphLoadMs = Math.round(ms);
  $("#count").textContent += ` · loaded in ${(ms / 1000).toFixed(1)} s`;
  sel.addEventListener("change", async () => {
    sheetSel = sel.value; panel.hidden = true; selId = null; stop(); alpha = 0;
    $("#count").textContent = "Loading…";
    try { [syms, conns] = await loadFor(sheetSel); } catch (e) { if (ctx.signal.aborted) return; ctx.reportError(e); $("#count").textContent = "The graph could not be loaded."; return; }
    if (ctx.signal.aborted) return;
    build(); draw(); fit(); heat(single() ? 0.25 : 0.6);
  }, { signal: ctx.signal });
  $("#q").addEventListener("input", (e) => { query = e.target.value; draw(); }, { signal: ctx.signal });
  $("#low").checked = lowOnly;
  $("#low").addEventListener("change", (e) => { lowOnly = e.target.checked; draw(); }, { signal: ctx.signal });
  $("#chips").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (!b) return; const k = b.dataset.k; on.has(k) ? on.delete(k) : on.add(k); draw(); heat(0.3); }, { signal: ctx.signal });
  $("#lgedges").addEventListener("click", (e) => { const b = e.target.closest("[data-e]"); if (!b) return; const k = b.dataset.e; edgeOn.has(k) ? edgeOn.delete(k) : edgeOn.add(k); draw(); heat(0.3); }, { signal: ctx.signal });
  $("#fit").addEventListener("click", fit, { signal: ctx.signal });
  $("#pause").addEventListener("click", () => { paused = !paused; $("#pause").textContent = paused ? "Play" : "Pause"; if (paused) stop(); else heat(0.3); }, { signal: ctx.signal });
  $("#relayout").addEventListener("click", () => { stop(); alpha = 0; build(); draw(); fit(); heat(single() ? 0.25 : 0.6); }, { signal: ctx.signal });
  svg.addEventListener("mouseover", (e) => { if (drag) return; const g = e.target.closest(".nd"); if (!g) return; const n = nodes.get(g.dataset.id); if (!n) return; tip.textContent = `${labelOf(n)} · ${NODE[n.st].label}`; tip.hidden = false; }, { signal: ctx.signal });
  svg.addEventListener("mousemove", (e) => { if (tip.hidden) return; const r = canvas.getBoundingClientRect(); tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 190) + "px"; tip.style.top = e.clientY - r.top + 12 + "px"; }, { signal: ctx.signal });
  svg.addEventListener("mouseout", (e) => { if (e.target.closest(".nd")) tip.hidden = true; }, { signal: ctx.signal });
  svg.addEventListener("wheel", (e) => { e.preventDefault(); const f = e.deltaY > 0 ? 1.15 : 1 / 1.15; const rc = svg.getBoundingClientRect(); const px = view.x + ((e.clientX - rc.left) / rc.width) * view.w, py = view.y + ((e.clientY - rc.top) / rc.height) * view.h; view = { x: px - (px - view.x) * f, y: py - (py - view.y) * f, w: view.w * f, h: view.h * f }; setView(); }, { passive: false, signal: ctx.signal });
  // Dragging: a node pins to the pointer, a line pins both its ends, the background pans. Physics moves everything else.
  let drag = null, moved = 0;
  const world = (ev) => { const rc = svg.getBoundingClientRect(); return [view.x + ((ev.clientX - rc.left) / rc.width) * view.w, view.y + ((ev.clientY - rc.top) / rc.height) * view.h]; };
  svg.addEventListener("pointerdown", (e) => {
    moved = 0; const [wx, wy] = world(e);
    const g = e.target.closest(".nd"), h = e.target.closest("line.eh");
    if (g) { const n = nodes.get(g.dataset.id); if (!n) return; n.pin = true; drag = { kind: "node", n, sx: e.clientX, sy: e.clientY, ox: n.cx - wx, oy: n.cy - wy }; canvas.classList.add("dragging"); tip.hidden = true; }
    else if (h) { const ed = cur.es[Number(h.dataset.ei)]; if (!ed) return; ed.a.pin = true; ed.b.pin = true; drag = { kind: "edge", e: ed, sx: e.clientX, sy: e.clientY, wx, wy, ax: ed.a.cx, ay: ed.a.cy, bx: ed.b.cx, by: ed.b.cy }; canvas.classList.add("dragging"); tip.hidden = true; }
    else drag = { kind: "pan", sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
  }, { signal: ctx.signal });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const rc = svg.getBoundingClientRect();
    moved = Math.max(moved, Math.abs(e.clientX - drag.sx) + Math.abs(e.clientY - drag.sy));
    if (moved <= 4) return;
    const [wx, wy] = world(e);
    if (drag.kind === "node") { drag.n.cx = wx + drag.ox; drag.n.cy = wy + drag.oy; heat(0.5); if (paused) paint(); }
    else if (drag.kind === "edge") { const dx = wx - drag.wx, dy = wy - drag.wy; const { a, b } = drag.e; a.cx = drag.ax + dx; a.cy = drag.ay + dy; b.cx = drag.bx + dx; b.cy = drag.by + dy; heat(0.5); if (paused) paint(); }
    else { view.x = drag.vx - ((e.clientX - drag.sx) / rc.width) * view.w; view.y = drag.vy - ((e.clientY - drag.sy) / rc.height) * view.h; setView(); }
  }, { signal: ctx.signal });
  window.addEventListener("pointerup", () => {
    const d = drag; drag = null; canvas.classList.remove("dragging");
    if (!d) return;
    if (d.kind === "node") { d.n.pin = false; if (moved <= 4) showPanel(d.n.symbol_id); else heat(0.4); }
    else if (d.kind === "edge") { d.e.a.pin = false; d.e.b.pin = false; heat(0.4); }
    setTimeout(() => { moved = 0; }, 0);
  }, { signal: ctx.signal });
  window.addEventListener("resize", fit, { signal: ctx.signal });
  return () => stop();
}
