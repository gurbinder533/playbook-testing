import { esc, renderChrome, loadModel, loadScript, sheetKey, sheetLabel, confBadge, emptyNote, showLoadError, handoff } from "../lib/app.js";

const D3_URL = "https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js";

const TYPES = {
  equipment: { c: "#fbbf24", r: 15, l: "Equipment" },
  valve: { c: "#34d399", r: 9, l: "Valve" },
  instrument: { c: "#a78bfa", r: 7, l: "Instrument" },
  line: { c: "#60a5fa", r: 6, l: "Line / fitting" },
  stream: { c: "#2dd4bf", r: 10, l: "Stream / off-page" },
  unknown: { c: "#94a3b8", r: 6, l: "Unresolved" },
};
const grp = (t) => (t === "offpage" ? "stream" : TYPES[t] ? t : "unknown");

const RELS = {
  flows_to: { c: "#c0b3ff", w: 1.8, d: null, arrow: true, l: "flows to" },
  controls: { c: "#fbbf24", w: 1.6, d: "6,3", arrow: true, l: "controls" },
  measures: { c: "#a78bfa", w: 1.1, d: "4,3", arrow: false, l: "measures" },
  signals: { c: "#7c5ce4", w: 1, d: "2,3", arrow: false, l: "signals" },
  drives: { c: "#34d399", w: 1.4, d: null, arrow: false, l: "drives" },
  heats: { c: "#f87171", w: 1.4, d: null, arrow: false, l: "heats" },
  connects: { c: "#64748b", w: 1, d: null, arrow: false, l: "connects" },
};
const relKey = (r) => (RELS[r] ? r : "connects");
const rel = (r) => RELS[relKey(r)];

function build(model, sheet, hidden) {
  const match = (r) => !sheet || sheetKey(r) === sheet;
  const map = new Map();
  const touch = (tag, r) => {
    let n = map.get(tag);
    if (!n) {
      n = { id: tag, tag, type: "unknown", subtype: "", name: "", attrs: "", conf: "", sheets: new Set() };
      map.set(tag, n);
    }
    n.sheets.add(sheetLabel(r));
    return n;
  };
  for (const r of model.nodes) {
    if (!match(r) || !r.tag) continue;
    const n = touch(r.tag, r);
    n.type = grp(r.node_type); n.subtype = r.subtype || n.subtype; n.name = r.name || n.name; n.attrs = r.attrs || n.attrs;
    n.conf = r.confidence === "low" || n.conf === "low" ? "low" : r.confidence || n.conf;
  }
  const edges = [];
  for (const e of model.edges) {
    if (!match(e) || !e.src || !e.dst) continue;
    touch(e.src, e); touch(e.dst, e);
    edges.push({ source: e.src, target: e.dst, rel: e.relation, line: e.line, conf: e.confidence, attrs: e.attrs });
  }
  const keep = new Set([...map.values()].filter((n) => !hidden.has(n.type)).map((n) => n.id));
  const nodes = [...map.values()].filter((n) => keep.has(n.id));
  const es = edges.filter((e) => keep.has(e.source) && keep.has(e.target));
  const deg = new Map();
  for (const e of es) { deg.set(e.source, (deg.get(e.source) || 0) + 1); deg.set(e.target, (deg.get(e.target) || 0) + 1); }
  for (const n of nodes) n.deg = deg.get(n.id) || 0;
  return { nodes, edges: es, all: map, allEdges: edges };
}

const MARKUP = `
<div class="gx">
  <aside class="gx-side">
    <div class="ctl"><label class="ctl-l" for="sheet">Sheet</label><select id="sheet"></select></div>
    <div class="ctl"><label class="ctl-l" for="q">Find a tag</label><input id="q" type="search" placeholder="e.g. TT-105, pump, level" /></div>
    <div class="ctl"><div class="ctl-l">Show</div><div id="types" class="chipbar"></div></div>
    <div class="ctl"><label class="check"><input type="checkbox" id="unsure" /> Highlight low-confidence only</label></div>
    <div class="ctl ctl-legend"><div class="ctl-l">Connections</div><div id="rels" class="legend"></div></div>
    <div class="ctl btns"><button class="btn btn-sm" id="fit" type="button">Fit to view</button><button class="btn btn-sm" id="phys" type="button">Pause</button></div>
    <p class="fine" id="gstat"></p>
  </aside>
  <div class="gx-canvas" id="gwrap"><svg id="gsvg"></svg><div class="gx-hint">Scroll to zoom, drag to move, click a node for details</div>
    <div class="gx-detail" id="detail"><button class="x" id="dclose" type="button" aria-label="Close">&#10005;</button><div id="dbody"></div></div></div>
</div>`;

export default async function render(ctx) {
  const main = renderChrome(ctx, ctx.route.path);
  main.innerHTML = `<div class="page-h"><h1>Graph explorer</h1><p>Equipment, valves, instruments and streams as a connected graph. Follow flow paths and see exactly where each measurement is taken.</p></div><div id="gbody"><div class="ph">Loading the graph...</div></div>`;
  let model;
  try {
    [model] = await Promise.all([loadModel(ctx.db, ctx.signal), loadScript(D3_URL)]);
  } catch (err) { showLoadError(ctx, main, err); return; }
  if (ctx.signal.aborted) return;
  const body = main.querySelector("#gbody");
  if (!model.nodes.length) {
    body.innerHTML = emptyNote("No graph yet. Upload a P&ID PDF and press Read my drawings on the Overview.");
    return;
  }
  body.innerHTML = MARKUP;
  const $ = (s) => body.querySelector(s);
  const d3 = window.d3;

  const sheets = model.sheets.filter((s) => s.ok && s.is_pid);
  const sel = $("#sheet");
  sel.innerHTML = `<option value="">All sheets (${sheets.length})</option>` + sheets.map((s) => `<option value="${esc(sheetKey(s))}">${esc(sheetLabel(s))} - ${esc(s.sheet_title)}</option>`).join("");
  if (model.nodes.length > 250 && sheets.length) {
    const big = sheets.reduce((a, b) => (b.n_nodes > a.n_nodes ? b : a));
    sel.value = sheetKey(big);
  }

  const hidden = new Set();
  $("#types").innerHTML = Object.entries(TYPES).filter(([k]) => k !== "unknown").map(([k, v]) => `<button type="button" class="chip on" data-t="${k}"><i style="background:${v.c}"></i>${v.l}</button>`).join("");
  $("#rels").innerHTML = Object.entries(RELS).filter(([k]) => k !== "connects").map(([, v]) => `<div class="lg"><svg width="34" height="8"><line x1="0" y1="4" x2="34" y2="4" stroke="${v.c}" stroke-width="2" ${v.d ? `stroke-dasharray="${v.d}"` : ""}/></svg>${v.l}</div>`).join("");

  let sim = null, g = null, focus = null, physics = true, zoomB = null, svg = null, nodeSel = null, linkSel = null, labelSel = null, root = null;

  const paint = () => {
    if (!nodeSel) return;
    const q = $("#q").value.trim().toLowerCase();
    const unsure = $("#unsure").checked;
    let near = null;
    if (focus) {
      near = new Set([focus]);
      for (const e of g.edges) { const s = e.source.id ?? e.source, t = e.target.id ?? e.target; if (s === focus) near.add(t); if (t === focus) near.add(s); }
    }
    const dim = (n) => (near && !near.has(n.id)) || (q && !`${n.tag} ${n.name} ${n.subtype}`.toLowerCase().includes(q)) || (unsure && n.conf !== "low");
    nodeSel.attr("opacity", (n) => (dim(n) ? 0.12 : 1));
    labelSel.attr("opacity", (n) => (dim(n) ? 0.08 : 1));
    linkSel.attr("opacity", (e) => {
      const s = e.source.id ?? e.source, t = e.target.id ?? e.target;
      if (near) return s === focus || t === focus ? 1 : 0.05;
      if (q || unsure) return 0.12;
      return 0.85;
    });
    nodeSel.select("circle").attr("stroke", (n) => (n.id === focus ? "#fff" : n.conf === "low" ? "#f87171" : "rgba(255,255,255,.35)")).attr("stroke-width", (n) => (n.id === focus ? 3 : n.conf === "low" ? 2.2 : 1));
  };

  const showDetail = (n) => {
    const inc = g.allEdges.filter((e) => e.target === n.id);
    const out = g.allEdges.filter((e) => e.source === n.id);
    const li = (e, other) => `<li><button type="button" class="lnk" data-go="${esc(other)}">${esc(other)}</button> <em>${esc(rel(e.rel).l)}${e.line ? " - " + esc(e.line) : ""}</em>${e.conf === "low" ? ' <span class="badge conf-low">low</span>' : ""}</li>`;
    $("#dbody").innerHTML = `<div class="d-type" style="color:${TYPES[n.type].c}">${TYPES[n.type].l}${n.subtype ? " - " + esc(n.subtype) : ""}</div><h3>${esc(n.tag)}</h3>${n.name ? `<p>${esc(n.name)}</p>` : ""}${n.attrs ? `<div class="d-row"><span>Details</span>${esc(n.attrs)}</div>` : ""}<div class="d-row"><span>Confidence</span>${confBadge(n.conf)}</div><div class="d-row"><span>Seen on</span>${[...n.sheets].map(esc).join(", ")}</div>${inc.length ? `<div class="d-h">Coming in (${inc.length})</div><ul>${inc.slice(0, 14).map((e) => li(e, e.source)).join("")}</ul>` : ""}${out.length ? `<div class="d-h">Going out (${out.length})</div><ul>${out.slice(0, 14).map((e) => li(e, e.target)).join("")}</ul>` : ""}<button class="btn btn-primary btn-sm" id="askabout" type="button">Ask the plant about ${esc(n.tag)}</button>`;
    $("#detail").classList.add("open");
    $("#askabout").addEventListener("click", () => { handoff.prefill = `What is ${n.tag} connected to, and what happens upstream and downstream of it?`; ctx.navigate("ask"); }, { signal: ctx.signal });
    $("#dbody").querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => { const t = g.all.get(b.dataset.go); if (t) { focus = t.id; paint(); showDetail(t); } }, { signal: ctx.signal }));
  };

  const draw = () => {
    if (sim) sim.stop();
    g = build(model, sel.value, hidden);
    const wrap = $("#gwrap");
    const W = wrap.clientWidth || 900, H = wrap.clientHeight || 600;
    svg = d3.select($("#gsvg")).attr("width", W).attr("height", H);
    svg.selectAll("*").remove();
    focus = null; $("#detail").classList.remove("open");
    const defs = svg.append("defs");
    for (const [k, v] of Object.entries(RELS)) if (v.arrow) defs.append("marker").attr("id", "m-" + k).attr("viewBox", "0 0 10 10").attr("refX", 18).attr("refY", 5).attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto").append("path").attr("d", "M0 0L10 5L0 10z").attr("fill", v.c);
    root = svg.append("g");
    zoomB = d3.zoom().scaleExtent([0.1, 6]).on("zoom", (ev) => root.attr("transform", ev.transform));
    svg.call(zoomB);
    const nodes = g.nodes, edges = g.edges.map((e) => ({ ...e }));
    nodes.forEach((n, i) => { n.x = W / 2 + Math.cos(i) * 200 * Math.random(); n.y = H / 2 + Math.sin(i) * 160 * Math.random(); n.fx = null; n.fy = null; });
    sim = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(edges).id((d) => d.id).distance((e) => (e.rel === "flows_to" ? 70 : 46)).strength(0.55))
      .force("charge", d3.forceManyBody().strength((d) => (d.type === "equipment" ? -420 : -140)))
      .force("center", d3.forceCenter(W / 2, H / 2).strength(0.05))
      .force("collide", d3.forceCollide().radius((d) => TYPES[d.type].r + 8))
      .alphaDecay(0.03);
    g.edges = edges;
    linkSel = root.append("g").selectAll("line").data(edges).join("line")
      .attr("stroke", (e) => rel(e.rel).c).attr("stroke-width", (e) => rel(e.rel).w).attr("stroke-dasharray", (e) => rel(e.rel).d)
      .attr("marker-end", (e) => (rel(e.rel).arrow ? `url(#m-${relKey(e.rel)})` : null));
    nodeSel = root.append("g").selectAll("g").data(nodes).join("g").attr("cursor", "pointer")
      .call(d3.drag().on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); if (physics) { d.fx = null; d.fy = null; } }));
    nodeSel.append("circle").attr("r", (d) => TYPES[d.type].r + Math.min(6, d.deg * 0.5)).attr("fill", (d) => TYPES[d.type].c);
    const many = nodes.length > 160;
    labelSel = root.append("g").selectAll("text").data(nodes.filter((n) => !many || n.type !== "instrument")).join("text")
      .attr("text-anchor", "middle").attr("font-size", (d) => (d.type === "equipment" ? 11 : 9)).attr("font-weight", (d) => (d.type === "equipment" ? 700 : 500))
      .attr("fill", "#efeaff").attr("pointer-events", "none").style("paint-order", "stroke").attr("stroke", "#0c0630").attr("stroke-width", 3).text((d) => (d.tag.length > 22 ? d.tag.slice(0, 21) + "..." : d.tag));
    nodeSel.on("click", (ev, d) => { ev.stopPropagation(); if (focus === d.id) { focus = null; $("#detail").classList.remove("open"); } else { focus = d.id; showDetail(d); } paint(); });
    svg.on("click", () => { focus = null; $("#detail").classList.remove("open"); paint(); });
    sim.on("tick", () => {
      linkSel.attr("x1", (e) => e.source.x).attr("y1", (e) => e.source.y).attr("x2", (e) => e.target.x).attr("y2", (e) => e.target.y);
      nodeSel.attr("transform", (d) => `translate(${d.x},${d.y})`);
      labelSel.attr("x", (d) => d.x).attr("y", (d) => d.y + TYPES[d.type].r + 12);
    });
    physics = true; $("#phys").textContent = "Pause";
    const lonely = nodes.filter((n) => n.deg === 0).length;
    $("#gstat").textContent = `${nodes.length} nodes, ${edges.length} connections` + (lonely ? `, ${lonely} with no connection (flagged for review)` : "") + (many ? " (instrument labels hidden)" : "");
    paint();
    setTimeout(() => { if (!ctx.signal.aborted) fit(0); }, 1400);
  };

  const fit = (ms = 600) => {
    if (!root) return;
    const b = root.node().getBBox();
    const W = $("#gwrap").clientWidth, H = $("#gwrap").clientHeight;
    if (!b.width || !b.height) return;
    const s = Math.min(0.9 * W / b.width, 0.9 * H / b.height, 2.5);
    svg.transition().duration(ms).call(zoomB.transform, d3.zoomIdentity.translate(W / 2 - s * (b.x + b.width / 2), H / 2 - s * (b.y + b.height / 2)).scale(s));
  };

  sel.addEventListener("change", draw, { signal: ctx.signal });
  $("#q").addEventListener("input", paint, { signal: ctx.signal });
  $("#unsure").addEventListener("change", paint, { signal: ctx.signal });
  $("#fit").addEventListener("click", () => fit(), { signal: ctx.signal });
  $("#dclose").addEventListener("click", () => { focus = null; $("#detail").classList.remove("open"); paint(); }, { signal: ctx.signal });
  $("#phys").addEventListener("click", () => {
    physics = !physics;
    if (physics) { g.nodes.forEach((n) => { n.fx = null; n.fy = null; }); sim.alphaTarget(0.2).restart(); setTimeout(() => sim && sim.alphaTarget(0), 1500); }
    else { sim.stop(); g.nodes.forEach((n) => { n.fx = n.x; n.fy = n.y; }); }
    $("#phys").textContent = physics ? "Pause" : "Resume";
  }, { signal: ctx.signal });
  $("#types").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-t]"); if (!b) return;
    const t = b.dataset.t;
    if (hidden.has(t)) { hidden.delete(t); b.classList.add("on"); } else { hidden.add(t); b.classList.remove("on"); }
    draw();
  }, { signal: ctx.signal });

  draw();
  return () => { if (sim) sim.stop(); };
}
