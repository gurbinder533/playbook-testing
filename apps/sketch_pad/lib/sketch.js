export const FONTS = {
  1: `'Segoe Print','Bradley Hand','Chalkboard SE','Comic Sans MS','Marker Felt',cursive`,
  2: `system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif`,
  3: `ui-monospace,'Cascadia Code',Menlo,Consolas,monospace`
};
export const STROKES = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00'];
export const BACKGROUNDS = ['transparent', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#ffec99'];
export const VIEW_BGS = ['#ffffff', '#f8f9fa', '#f5faff', '#fffce8', '#fdf8f6'];
export const NL = String.fromCharCode(10);
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const isLinear = (e) => e.type === 'line' || e.type === 'arrow';
export const isPointy = (e) => isLinear(e) || e.type === 'freedraw';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let mctx = null;
const mc = () => mctx || (mctx = document.createElement('canvas').getContext('2d'));

export function measureText(e) {
  const c = mc();
  c.font = `${e.fontSize}px ${FONTS[e.fontFamily] || FONTS[1]}`;
  let w = 4;
  const lines = String(e.text || '').split(NL);
  for (const l of lines) w = Math.max(w, c.measureText(l).width);
  return { width: w, height: lines.length * e.fontSize * 1.25 };
}
export function bounds(e) {
  if (isPointy(e)) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const [px, py] of e.points) { x1 = Math.min(x1, e.x + px); y1 = Math.min(y1, e.y + py); x2 = Math.max(x2, e.x + px); y2 = Math.max(y2, e.y + py); }
    return [x1, y1, x2, y2];
  }
  return [e.x, e.y, e.x + e.width, e.y + e.height];
}
export function unionBounds(list) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const e of list) { const b = bounds(e); x1 = Math.min(x1, b[0]); y1 = Math.min(y1, b[1]); x2 = Math.max(x2, b[2]); y2 = Math.max(y2, b[3]); }
  return [x1, y1, x2, y2];
}

function toward(a, b, d) {
  if (!d) return { x: a.x, y: a.y };
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: a.x + (b.x - a.x) / l * d, y: a.y + (b.y - a.y) / l * d };
}
function poly(e) {
  const { x, y, width: w, height: h } = e;
  if (e.type === 'rectangle') {
    return { pts: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }], r: e.roundness === 'round' ? Math.min(32, Math.min(w, h) * 0.25) : 0 };
  }
  return { pts: [{ x: x + w / 2, y }, { x: x + w, y: y + h / 2 }, { x: x + w / 2, y: y + h }, { x, y: y + h / 2 }], r: e.roundness === 'round' ? Math.min(w, h) * 0.12 : 0 };
}
function corners(pts, r) {
  const n = pts.length;
  const E = [], X = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[(i + n - 1) % n], cur = pts[i], next = pts[(i + 1) % n];
    const rr = r ? Math.min(r, Math.hypot(prev.x - cur.x, prev.y - cur.y) / 2, Math.hypot(next.x - cur.x, next.y - cur.y) / 2) : 0;
    E.push(toward(cur, prev, rr));
    X.push(toward(cur, next, rr));
  }
  return { E, X };
}
export function shapePath(e) {
  const p = new Path2D();
  if (e.type === 'ellipse') {
    p.ellipse(e.x + e.width / 2, e.y + e.height / 2, Math.max(e.width / 2, 0.01), Math.max(e.height / 2, 0.01), 0, 0, TAU);
    return p;
  }
  const { pts, r } = poly(e);
  const { E, X } = corners(pts, r);
  p.moveTo(E[0].x, E[0].y);
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) p.lineTo(E[i].x, E[i].y);
    p.quadraticCurveTo(pts[i].x, pts[i].y, X[i].x, X[i].y);
  }
  p.closePath();
  return p;
}

function edge(c, a, b, rnd, amp) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const k = clamp(len / 120, 0.15, 1);
  const bow = (rnd() * 2 - 1) * amp * 1.3 * k;
  const nx = -dy / len, ny = dx / len;
  c.bezierCurveTo(a.x + dx * 0.33 + nx * bow, a.y + dy * 0.33 + ny * bow, a.x + dx * 0.66 + nx * bow * 0.7, a.y + dy * 0.66 + ny * bow * 0.7, b.x, b.y);
}
const jit = (p, rnd, amp) => ({ x: p.x + (rnd() * 2 - 1) * amp, y: p.y + (rnd() * 2 - 1) * amp });
function smoothPath(c, pts) {
  c.moveTo(pts[0].x, pts[0].y);
  if (pts.length < 3) { for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); return; }
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    c.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
  }
  c.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
}
function sketchPoly(c, pts, r, rnd, amp, passes) {
  const { E, X } = corners(pts, r);
  const n = pts.length;
  for (let p = 0; p < passes; p++) {
    c.beginPath();
    const J = (q) => jit(q, rnd, amp * 0.6);
    const s = J(E[0]);
    c.moveTo(s.x, s.y);
    for (let i = 0; i < n; i++) {
      const ctl = J(pts[i]);
      const xo = J(X[i]);
      c.quadraticCurveTo(ctl.x, ctl.y, xo.x, xo.y);
      const nx = i === n - 1 ? s : J(E[(i + 1) % n]);
      edge(c, xo, nx, rnd, amp);
    }
    c.stroke();
  }
}
function sketchEllipse(c, e, rnd, amp, passes) {
  const cx = e.x + e.width / 2, cy = e.y + e.height / 2, rx = e.width / 2, ry = e.height / 2;
  const steps = clamp(Math.round((rx + ry) / 4), 12, 40);
  for (let p = 0; p < passes; p++) {
    const t0 = rnd() * TAU;
    const pts = [];
    for (let k = 0; k <= steps + 2; k++) {
      const t = t0 + (k / steps) * TAU;
      const j = (rnd() * 2 - 1) * amp * 0.6;
      pts.push({ x: cx + (rx + j) * Math.cos(t), y: cy + (ry + j) * Math.sin(t) });
    }
    c.beginPath();
    smoothPath(c, pts);
    c.stroke();
  }
}
function dash(c, e) {
  const w = e.strokeWidth;
  if (e.strokeStyle === 'dashed') c.setLineDash([8, 8 + w]);
  else if (e.strokeStyle === 'dotted') c.setLineDash([1.5, 6 + w]);
  else c.setLineDash([]);
}
function hatch(c, e, path, deg, rnd) {
  const [x1, y1, x2, y2] = bounds(e);
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  const diag = Math.hypot(x2 - x1, y2 - y1) / 2 + 4;
  const gap = 4 + e.strokeWidth * 2;
  const a = deg * Math.PI / 180;
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
  c.save();
  c.clip(path);
  c.strokeStyle = e.backgroundColor;
  c.lineWidth = Math.max(1, e.strokeWidth * 0.6);
  c.setLineDash([]);
  c.beginPath();
  for (let t = -diag; t <= diag; t += gap) {
    const px = cx + nx * t, py = cy + ny * t;
    const j = (rnd() - 0.5) * e.roughness * 1.2;
    c.moveTo(px - dx * diag + j, py - dy * diag + j);
    c.lineTo(px + dx * diag, py + dy * diag - j);
  }
  c.stroke();
  c.restore();
}
function fillShape(c, e, path, rnd) {
  if (e.backgroundColor === 'transparent') return;
  if (e.fillStyle === 'solid') { c.fillStyle = e.backgroundColor; c.fill(path); return; }
  hatch(c, e, path, -41, rnd);
  if (e.fillStyle === 'cross-hatch') hatch(c, e, path, 49, rnd);
}
function drawText(c, e) {
  c.font = `${e.fontSize}px ${FONTS[e.fontFamily] || FONTS[1]}`;
  c.textBaseline = 'top';
  c.fillStyle = e.strokeColor;
  const lh = e.fontSize * 1.25;
  String(e.text || '').split(NL).forEach((l, i) => {
    let x = e.x;
    c.textAlign = 'left';
    if (e.textAlign === 'center') { c.textAlign = 'center'; x = e.x + e.width / 2; }
    else if (e.textAlign === 'right') { c.textAlign = 'right'; x = e.x + e.width; }
    c.fillText(l, x, e.y + i * lh + (lh - e.fontSize) / 2);
  });
}
function wrapLines(c, text, maxW) {
  const out = [];
  for (const para of String(text).split(NL)) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (line && c.measureText(t).width > maxW) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  return out;
}
function drawLabel(c, e) {
  c.font = `${e.fontSize}px ${FONTS[e.fontFamily] || FONTS[1]}`;
  c.textBaseline = 'top';
  c.textAlign = 'center';
  c.fillStyle = e.strokeColor;
  const lh = e.fontSize * 1.25;
  const lines = wrapLines(c, e.text, Math.max(e.width - 16, 20));
  let y = e.y + e.height / 2 - (lines.length * lh) / 2;
  for (const l of lines) { c.fillText(l, e.x + e.width / 2, y + (lh - e.fontSize) / 2); y += lh; }
}
function drawHead(c, e, tip, from, type) {
  if (!type) return;
  const seg = Math.hypot(tip.x - from.x, tip.y - from.y);
  if (seg < 1) return;
  const ang = Math.atan2(tip.y - from.y, tip.x - from.x);
  const L = Math.min(Math.max(12, 8 + e.strokeWidth * 4), seg * 0.7);
  const w1 = { x: tip.x + Math.cos(ang + Math.PI - 0.42) * L, y: tip.y + Math.sin(ang + Math.PI - 0.42) * L };
  const w2 = { x: tip.x + Math.cos(ang + Math.PI + 0.42) * L, y: tip.y + Math.sin(ang + Math.PI + 0.42) * L };
  c.beginPath();
  if (type === 'arrow') { c.moveTo(w1.x, w1.y); c.lineTo(tip.x, tip.y); c.lineTo(w2.x, w2.y); c.stroke(); }
  else if (type === 'triangle') { c.moveTo(tip.x, tip.y); c.lineTo(w1.x, w1.y); c.lineTo(w2.x, w2.y); c.closePath(); c.fill(); c.stroke(); }
  else if (type === 'bar') { const nx = -Math.sin(ang) * L * 0.5, ny = Math.cos(ang) * L * 0.5; c.moveTo(tip.x + nx, tip.y + ny); c.lineTo(tip.x - nx, tip.y - ny); c.stroke(); }
  else if (type === 'dot') { c.arc(tip.x, tip.y, L * 0.3, 0, TAU); c.fill(); }
}
function drawLinear(c, e, rnd) {
  const pts = e.points.map(([x, y]) => ({ x: e.x + x, y: e.y + y }));
  if (pts.length < 2) return;
  dash(c, e);
  const passes = e.roughness === 0 ? 1 : 2;
  const amp = e.roughness * 1.8;
  for (let p = 0; p < passes; p++) {
    c.beginPath();
    if (e.roughness === 0) { c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); }
    else {
      const s = jit(pts[0], rnd, amp * 0.6);
      c.moveTo(s.x, s.y);
      for (let i = 1; i < pts.length; i++) edge(c, i === 1 ? s : pts[i - 1], jit(pts[i], rnd, amp * 0.6), rnd, amp);
    }
    c.stroke();
  }
  c.setLineDash([]);
  if (e.type === 'arrow') {
    const n = pts.length;
    drawHead(c, e, pts[n - 1], pts[n - 2], e.endArrowhead);
    drawHead(c, e, pts[0], pts[1], e.startArrowhead);
  }
}
function drawFree(c, e) {
  const pts = e.points.map(([x, y]) => ({ x: e.x + x, y: e.y + y }));
  c.lineWidth = Math.max(1.5, e.strokeWidth * 1.3);
  if (pts.length < 2) { c.beginPath(); c.arc(pts[0].x, pts[0].y, c.lineWidth / 2, 0, TAU); c.fill(); return; }
  c.beginPath();
  smoothPath(c, pts);
  c.stroke();
}
function drawShape(c, e, rnd, o) {
  if (e.width < 1 && e.height < 1) return;
  const path = shapePath(e);
  fillShape(c, e, path, rnd);
  dash(c, e);
  const amp = e.roughness * 1.8 * clamp(Math.min(e.width, e.height) / 60, 0.35, 1);
  const passes = e.roughness === 0 ? 1 : 2;
  if (e.roughness === 0) c.stroke(path);
  else if (e.type === 'ellipse') sketchEllipse(c, e, rnd, amp, passes);
  else { const { pts, r } = poly(e); sketchPoly(c, pts, r, rnd, amp, passes); }
  c.setLineDash([]);
  if (e.text && !o.skipText) drawLabel(c, e);
}
export function drawElement(c, e, o = {}) {
  c.save();
  c.globalAlpha = (e.opacity / 100) * (o.fade ? 0.25 : 1);
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.strokeStyle = e.strokeColor;
  c.fillStyle = e.strokeColor;
  c.lineWidth = e.strokeWidth;
  const rnd = rng(e.seed);
  if (e.type === 'text') { if (!o.skipText) drawText(c, e); }
  else if (e.type === 'freedraw') drawFree(c, e);
  else if (isLinear(e)) drawLinear(c, e, rnd);
  else drawShape(c, e, rnd, o);
  c.restore();
}

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
export function hitTest(e, x, y, tol) {
  if (isPointy(e)) {
    const lim = tol + e.strokeWidth / 2;
    const pts = e.points;
    if (pts.length === 1) return Math.hypot(x - e.x - pts[0][0], y - e.y - pts[0][1]) <= lim;
    for (let i = 1; i < pts.length; i++) {
      if (distSeg(x, y, e.x + pts[i - 1][0], e.y + pts[i - 1][1], e.x + pts[i][0], e.y + pts[i][1]) <= lim) return true;
    }
    return false;
  }
  if (e.type === 'text') return x >= e.x - tol / 2 && x <= e.x + e.width + tol / 2 && y >= e.y - tol / 2 && y <= e.y + e.height + tol / 2;
  const path = shapePath(e);
  const c = mc();
  if (e.backgroundColor !== 'transparent' && c.isPointInPath(path, x, y)) return true;
  c.lineWidth = tol * 2 + e.strokeWidth;
  return c.isPointInStroke(path, x, y);
}
