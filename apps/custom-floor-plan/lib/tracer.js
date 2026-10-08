// A small floor-plan tracer: click on the uploaded plan to record the outline, walls, doors and fixtures.
const NS = "http://www.w3.org/2000/svg";

export const TOOLS = [
  ["outline", "Outline", "Click each corner of the outside boundary, in order."],
  ["wall", "Wall", "Click the start, then the end of an interior wall."],
  ["door", "Door", "Click the hinge, then the far end of the door leaf."],
  ["block", "Block", "Click two opposite corners of a column, core or fixed block."],
  ["counter", "Counter", "Click two opposite corners of a counter or cabinet run."],
  ["sink", "Sink", "Click two opposite corners of a sink."],
  ["label", "Label", "Type a name, then click where the label goes."],
  ["erase", "Erase", "Click an element to remove it."]
];
const LINE = new Set(["outline", "wall", "door"]);
const RECT = new Set(["block", "counter", "sink"]);
const DEFAULT_LABEL = { wall: "", door: "Door", block: "Block", counter: "Counter", sink: "Sink" };

function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}

function segmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function createTracer(host, opts) {
  const { planUrl, width: W, height: H, signal, onChange } = opts;
  let rows = opts.rows.map((r) => ({ ...r }));
  let tool = "outline";
  let pending = null;
  let mouse = null;
  let snap = true;
  let armClear = false;

  host.innerHTML = `<div class="tr-bar" role="toolbar" aria-label="Tracing tools">${TOOLS.map(([key, label]) => `<button type="button" class="tr-tool" data-tool="${key}" aria-pressed="${key === tool}">${label}</button>`).join("")}<span class="tr-sep"></span><label class="tr-snap"><input type="checkbox" class="tr-snap-box" checked> Straight lines</label><input class="tr-label" type="text" maxlength="40" value="Area" aria-label="Label text"><button type="button" class="tr-act" data-act="undo">Undo</button><button type="button" class="tr-act" data-act="clear">Clear all</button></div><p class="tr-hint" role="status"></p><div class="tr-stage"><img alt="Floor plan to trace" draggable="false"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Tracing surface"></svg></div>`;
  const img = host.querySelector("img");
  img.src = planUrl;
  const svg = host.querySelector("svg");
  const hint = host.querySelector(".tr-hint");
  const labelInput = host.querySelector(".tr-label");
  const clearButton = host.querySelector('[data-act="clear"]');
  const on = (target, type, fn) => target.addEventListener(type, fn, { signal });

  const outlineRows = () => rows.filter((r) => r.kind === "outline").sort((a, b) => a.id - b.id);
  const nextId = () => Math.max(0, ...rows.map((r) => r.id)) + 1;
  const toPoint = (e) => {
    const box = svg.getBoundingClientRect();
    return {
      x: Math.round(Math.min(W, Math.max(0, ((e.clientX - box.left) / box.width) * W))),
      y: Math.round(Math.min(H, Math.max(0, ((e.clientY - box.top) / box.height) * H)))
    };
  };
  const snapFrom = (p, from) => {
    if (!snap || !from) return p;
    return Math.abs(p.x - from.x) >= Math.abs(p.y - from.y) ? { x: p.x, y: from.y } : { x: from.x, y: p.y };
  };

  function updateHint() {
    const info = TOOLS.find((t) => t[0] === tool);
    const n = outlineRows().length;
    const status = `Outline: ${n} point${n === 1 ? "" : "s"}${n < 3 ? " (at least 3 needed)" : ""} · ${rows.length - n} other element${rows.length - n === 1 ? "" : "s"}.`;
    hint.textContent = `${info[2]}${pending ? " Now click the second point." : ""} ${status}`;
    host.querySelectorAll(".tr-tool").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === tool)));
    clearButton.textContent = armClear ? "Click again to clear" : "Clear all";
  }

  function draw() {
    svg.replaceChildren();
    const sw = Math.max(2, Math.round(W / 260));
    const outline = outlineRows();
    const pts = outline.map((r) => `${r.x1},${r.y1}`).join(" ");
    if (outline.length >= 3) {
      svg.append(el("polygon", { points: pts, fill: "rgba(77,112,104,.10)", stroke: "#4d7068", "stroke-width": sw, "stroke-linejoin": "round" }));
    } else if (outline.length === 2) {
      svg.append(el("polyline", { points: pts, fill: "none", stroke: "#4d7068", "stroke-width": sw }));
    }
    outline.forEach((r, i) => svg.append(el("circle", { cx: r.x1, cy: r.y1, r: sw * (i === 0 ? 2.6 : 1.8), fill: i === 0 ? "#c0842a" : "#4d7068" })));
    for (const r of rows) {
      if (r.kind === "wall") {
        svg.append(el("line", { x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2, stroke: "#23332f", "stroke-width": sw * 1.4, "stroke-linecap": "round" }));
      } else if (r.kind === "door") {
        svg.append(el("line", { x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2, stroke: "#c0842a", "stroke-width": sw * 1.2, "stroke-dasharray": `${sw * 3} ${sw * 2}` }));
        svg.append(el("circle", { cx: r.x1, cy: r.y1, r: sw * 1.6, fill: "#c0842a" }));
      } else if (RECT.has(r.kind)) {
        const fill = r.kind === "sink" ? "rgba(70,120,170,.40)" : r.kind === "counter" ? "rgba(77,112,104,.32)" : "rgba(110,110,110,.35)";
        svg.append(el("rect", { x: Math.min(r.x1, r.x2), y: Math.min(r.y1, r.y2), width: Math.abs(r.x2 - r.x1), height: Math.abs(r.y2 - r.y1), fill, stroke: "#23332f", "stroke-width": sw }));
      } else if (r.kind === "label") {
        svg.append(el("text", { x: r.x1, y: r.y1, "font-size": sw * 7, fill: "#23332f", stroke: "#fff", "stroke-width": sw * 1.6, "paint-order": "stroke", "text-anchor": "middle", "font-family": "sans-serif" }, r.label));
      }
    }
    if (pending) {
      if (mouse && LINE.has(tool)) {
        svg.append(el("line", { x1: pending.x, y1: pending.y, x2: mouse.x, y2: mouse.y, stroke: "#b4412f", "stroke-width": sw, "stroke-dasharray": `${sw * 2} ${sw * 2}` }));
      }
      svg.append(el("circle", { cx: pending.x, cy: pending.y, r: sw * 2.2, fill: "#b4412f" }));
    }
  }

  function changed() {
    armClear = false;
    draw();
    updateHint();
    onChange(rows.map((r) => ({ ...r })));
  }

  function add(kind, x1, y1, x2, y2, label) {
    rows.push({ id: nextId(), kind, x1, y1, x2, y2, label });
    changed();
  }

  function erase(p) {
    const tol = Math.max(12, W / 60);
    let best = null;
    let bestDist = Infinity;
    for (const r of rows) {
      let d;
      if (r.kind === "wall" || r.kind === "door") d = segmentDistance(p, { x: r.x1, y: r.y1 }, { x: r.x2, y: r.y2 });
      else if (RECT.has(r.kind)) {
        const inside = p.x >= Math.min(r.x1, r.x2) - tol && p.x <= Math.max(r.x1, r.x2) + tol && p.y >= Math.min(r.y1, r.y2) - tol && p.y <= Math.max(r.y1, r.y2) + tol;
        d = inside ? 0 : Infinity;
      } else if (r.kind === "label") d = Math.hypot(p.x - r.x1, p.y - r.y1) / 2;
      else d = Math.hypot(p.x - r.x1, p.y - r.y1);
      if (d < bestDist) { bestDist = d; best = r; }
    }
    if (best && bestDist <= tol) {
      rows = rows.filter((r) => r !== best);
      changed();
    }
  }

  on(svg, "click", (e) => {
    const p = toPoint(e);
    if (tool === "erase") return erase(p);
    if (tool === "label") return add("label", p.x, p.y, 0, 0, (labelInput.value || "Area").trim().slice(0, 40));
    if (tool === "outline") {
      const last = outlineRows().at(-1);
      const q = snapFrom(p, last ? { x: last.x1, y: last.y1 } : null);
      return add("outline", q.x, q.y, 0, 0, "");
    }
    if (!pending) {
      pending = p;
      draw();
      updateHint();
      return;
    }
    const a = pending;
    pending = null;
    mouse = null;
    const q = LINE.has(tool) ? snapFrom(p, a) : p;
    add(tool, a.x, a.y, q.x, q.y, DEFAULT_LABEL[tool] ?? "");
  });
  on(svg, "mousemove", (e) => {
    if (!pending || !LINE.has(tool)) return;
    mouse = snapFrom(toPoint(e), pending);
    draw();
  });
  host.querySelectorAll(".tr-tool").forEach((button) => on(button, "click", () => {
    tool = button.dataset.tool;
    pending = null;
    mouse = null;
    armClear = false;
    draw();
    updateHint();
  }));
  on(host.querySelector(".tr-snap-box"), "change", (e) => { snap = e.target.checked; });
  on(host.querySelector('[data-act="undo"]'), "click", () => {
    if (pending) {
      pending = null;
      mouse = null;
      draw();
      updateHint();
    } else if (rows.length) {
      rows.pop();
      changed();
    }
  });
  on(clearButton, "click", () => {
    if (!armClear) {
      armClear = true;
      updateHint();
      return;
    }
    rows = [];
    pending = null;
    changed();
  });

  draw();
  updateHint();
  return { getRows: () => rows.map((r) => ({ ...r })) };
}
