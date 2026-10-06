import { FONTS, STROKES, BACKGROUNDS, VIEW_BGS, NL, uid, isLinear, isPointy, bounds, unionBounds, hitTest, drawElement, measureText } from './sketch.js';
import { icon } from './icons.js';
import { currentTheme, toggleTheme } from './theme.js';
import { esc } from '@corvic/live';

const TOOLS = [
  { id: 'hand', keys: ['h'], label: 'Hand (panning tool)', ic: 'hand' },
  { id: 'selection', keys: ['v', '1'], label: 'Selection', ic: 'selection' },
  { id: 'rectangle', keys: ['r', '2'], label: 'Rectangle', ic: 'rectangle' },
  { id: 'diamond', keys: ['d', '3'], label: 'Diamond', ic: 'diamond' },
  { id: 'ellipse', keys: ['o', '4'], label: 'Ellipse', ic: 'ellipse' },
  { id: 'arrow', keys: ['a', '5'], label: 'Arrow', ic: 'arrow' },
  { id: 'line', keys: ['l', '6'], label: 'Line', ic: 'line' },
  { id: 'freedraw', keys: ['p', '7'], label: 'Draw', ic: 'pencil' },
  { id: 'text', keys: ['t', '8'], label: 'Text', ic: 'text' },
  { id: 'eraser', keys: ['e', '0'], label: 'Eraser', ic: 'eraser' }
];
const DRAW_TOOLS = ['rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'freedraw', 'text'];
const SHAPES = ['rectangle', 'diamond', 'ellipse'];
const APPLIES = {
  backgroundColor: SHAPES, fillStyle: SHAPES, roundness: ['rectangle', 'diamond'],
  fontSize: ['text', ...SHAPES], fontFamily: ['text', ...SHAPES], textAlign: ['text'],
  startArrowhead: ['arrow'], endArrowhead: ['arrow']
};
const NUMERIC = ['strokeWidth', 'roughness', 'opacity', 'fontSize', 'fontFamily'];
const HANDLE_CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c : '#ffffff');

function fix(e) {
  return Object.assign({ x: 0, y: 0, width: 0, height: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100, roundness: 'round', seed: 1, text: '', fontSize: 20, fontFamily: 1, textAlign: 'left', startArrowhead: null, endArrowhead: null }, e);
}

export function mountEditor(ctx, root, opts) {
  const signal = ctx.signal;
  const scene = opts.scene || {};
  const app = scene.appState || {};
  const S = {
    tool: 'selection', locked: false, elements: (scene.elements || []).map(fix), selected: new Set(),
    scrollX: app.scrollX || 0, scrollY: app.scrollY || 0, zoom: app.zoom || 1, grid: !!app.grid, viewBg: app.viewBg || '#ffffff',
    cur: { strokeColor: STROKES[0], backgroundColor: 'transparent', fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100, roundness: 'round', fontSize: 20, fontFamily: 1, textAlign: 'left', startArrowhead: null, endArrowhead: 'arrow' },
    space: false, editing: null, multi: null, menu: false, help: false, name: opts.name, confirmClear: false, noDbl: 0
  };
  let action = null, raf = 0, W = 0, H = 0, dpr = 1, clip = [], pasteN = 0, panelCache = '';
  const erased = new Set();

  root.innerHTML = `<div class='ed'>
  <div class='ed-canvas' id='wrap'><canvas id='cv'></canvas><canvas id='ov'></canvas></div>
  <div class='ed-tl'><button class='island iconbtn big' id='menuBtn' type='button' aria-label='Menu' title='Menu'>${icon('menu', 20)}</button><span class='ed-name' id='edName'></span></div>
  <div class='island toolbar' id='toolbar' role='toolbar' aria-label='Drawing tools'></div>
  <div class='ed-tr'><span class='ed-status' id='status' role='status'></span><button class='island iconbtn big' id='themeBtn' type='button' aria-label='Toggle light or dark mode' title='Toggle light / dark mode'></button></div>
  <div class='island panel hidden' id='panel'></div>
  <div class='ed-bl'>
    <div class='island pill'><button class='iconbtn' id='zout' type='button' aria-label='Zoom out' title='Zoom out'>${icon('minus', 16)}</button><button class='zval' id='zval' type='button' title='Reset zoom'>100%</button><button class='iconbtn' id='zin' type='button' aria-label='Zoom in' title='Zoom in'>${icon('plus', 16)}</button></div>
    <div class='island pill'><button class='iconbtn' id='undo' type='button' aria-label='Undo' title='Undo (Ctrl+Z)'>${icon('undo', 16)}</button><button class='iconbtn' id='redo' type='button' aria-label='Redo' title='Redo (Ctrl+Shift+Z)'>${icon('redo', 16)}</button></div>
  </div>
  <div class='ed-br'><button class='island iconbtn big' id='helpBtn' type='button' aria-label='Help' title='Keyboard shortcuts'>${icon('help', 20)}</button></div>
  <div class='island menu hidden' id='menu'></div>
  <div class='modal hidden' id='modal'></div>
</div>`;
  const q = (s) => root.querySelector(s);
  const wrap = q('#wrap'), cv = q('#cv'), ov = q('#ov'), panel = q('#panel'), toolbar = q('#toolbar'), menu = q('#menu'), modal = q('#modal'), statusEl = q('#status');
  const bc = cv.getContext('2d'), oc = ov.getContext('2d');
  const byId = (id) => S.elements.find((e) => e.id === id);
  const selectedEls = () => S.elements.filter((e) => S.selected.has(e.id));
  const dark = () => currentTheme() === 'dark';

  const hist = { undo: [JSON.stringify(S.elements)], redo: [] };
  function sceneObj() { return { v: 1, elements: S.elements, appState: { scrollX: S.scrollX, scrollY: S.scrollY, zoom: S.zoom, grid: S.grid, viewBg: S.viewBg } }; }
  function notify() { if (opts.onChange) opts.onChange(sceneObj()); }
  function commit() {
    const s = JSON.stringify(S.elements);
    if (hist.undo[hist.undo.length - 1] !== s) { hist.undo.push(s); if (hist.undo.length > 100) hist.undo.shift(); hist.redo = []; }
    notify(); schedule();
  }
  function restore(json) {
    S.elements = JSON.parse(json);
    S.selected = new Set([...S.selected].filter((id) => byId(id)));
    notify(); sync();
  }
  function undo() { if (hist.undo.length > 1) { hist.redo.push(hist.undo.pop()); restore(hist.undo[hist.undo.length - 1]); } }
  function redo() { if (hist.redo.length) { const s = hist.redo.pop(); hist.undo.push(s); restore(s); } }

  function resize() {
    const r = wrap.getBoundingClientRect();
    W = r.width; H = r.height; dpr = window.devicePixelRatio || 1;
    for (const c of [cv, ov]) { c.width = Math.max(1, Math.round(W * dpr)); c.height = Math.max(1, Math.round(H * dpr)); c.style.width = W + 'px'; c.style.height = H + 'px'; }
    draw();
  }
  function schedule() { if (!raf) raf = requestAnimationFrame(draw); }
  function drawGrid() {
    const step = 20;
    const x1 = -S.scrollX, y1 = -S.scrollY, x2 = x1 + W / S.zoom, y2 = y1 + H / S.zoom;
    bc.strokeStyle = 'rgba(0,0,0,0.09)';
    bc.lineWidth = 1 / S.zoom;
    bc.beginPath();
    for (let x = Math.floor(x1 / step) * step; x <= x2; x += step) { bc.moveTo(x, y1); bc.lineTo(x, y2); }
    for (let y = Math.floor(y1 / step) * step; y <= y2; y += step) { bc.moveTo(x1, y); bc.lineTo(x2, y); }
    bc.stroke();
  }
  function draw() {
    raf = 0;
    bc.setTransform(dpr, 0, 0, dpr, 0, 0);
    bc.fillStyle = S.viewBg;
    bc.fillRect(0, 0, W, H);
    bc.save();
    bc.scale(S.zoom, S.zoom);
    bc.translate(S.scrollX, S.scrollY);
    if (S.grid && S.zoom > 0.3) drawGrid();
    const vx1 = -S.scrollX - 20, vy1 = -S.scrollY - 20, vx2 = vx1 + W / S.zoom + 40, vy2 = vy1 + H / S.zoom + 40;
    for (const e of S.elements) {
      const b = bounds(e);
      if (b[2] < vx1 || b[0] > vx2 || b[3] < vy1 || b[1] > vy2) continue;
      drawElement(bc, e, { skipText: !!S.editing && S.editing.id === e.id, fade: erased.has(e.id) });
    }
    bc.restore();
    drawOverlay();
    q('#zval').textContent = Math.round(S.zoom * 100) + '%';
  }
  function handlePos() {
    const sel = selectedEls();
    if (!sel.length || (sel.length === 1 && isLinear(sel[0]))) return null;
    const b = unionBounds(sel), pad = 6 / S.zoom;
    const x1 = b[0] - pad, y1 = b[1] - pad, x2 = b[2] + pad, y2 = b[3] + pad, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    return { nw: [x1, y1], n: [mx, y1], ne: [x2, y1], e: [x2, my], se: [x2, y2], s: [mx, y2], sw: [x1, y2], w: [x1, my], box: [x1, y1, x2, y2] };
  }
  function drawOverlay() {
    oc.setTransform(dpr, 0, 0, dpr, 0, 0);
    oc.clearRect(0, 0, W, H);
    oc.save();
    oc.scale(S.zoom, S.zoom);
    oc.translate(S.scrollX, S.scrollY);
    const z = S.zoom, col = dark() ? '#a8a5ff' : '#6965db';
    oc.strokeStyle = col; oc.lineWidth = 1.5 / z; oc.setLineDash([]);
    if (action && action.type === 'marquee') {
      const a = action.start, b = action.cur;
      oc.fillStyle = dark() ? 'rgba(168,165,255,0.12)' : 'rgba(105,101,219,0.1)';
      oc.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      oc.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    }
    const busy = action && ['create', 'free', 'linear', 'erase', 'pan'].includes(action.type);
    const sel = selectedEls();
    if (sel.length && !busy && !S.multi && !S.editing) {
      if (sel.length === 1 && isLinear(sel[0])) {
        const e = sel[0];
        oc.fillStyle = dark() ? '#232329' : '#ffffff';
        for (const [px, py] of e.points) { oc.beginPath(); oc.arc(e.x + px, e.y + py, 5 / z, 0, Math.PI * 2); oc.fill(); oc.stroke(); }
      } else {
        if (sel.length > 1) { for (const e of sel) { const b = bounds(e); oc.strokeRect(b[0] - 2 / z, b[1] - 2 / z, b[2] - b[0] + 4 / z, b[3] - b[1] + 4 / z); } }
        const hp = handlePos();
        oc.setLineDash(sel.length > 1 ? [6 / z, 4 / z] : []);
        oc.strokeRect(hp.box[0], hp.box[1], hp.box[2] - hp.box[0], hp.box[3] - hp.box[1]);
        oc.setLineDash([]);
        oc.fillStyle = dark() ? '#232329' : '#ffffff';
        for (const k of Object.keys(HANDLE_CURSOR)) { const s = 8 / z; oc.fillRect(hp[k][0] - s / 2, hp[k][1] - s / 2, s, s); oc.strokeRect(hp[k][0] - s / 2, hp[k][1] - s / 2, s, s); }
      }
    }
    oc.restore();
  }

  const toScene = (ev) => { const r = ov.getBoundingClientRect(); return { x: (ev.clientX - r.left) / S.zoom - S.scrollX, y: (ev.clientY - r.top) / S.zoom - S.scrollY }; };
  function zoomTo(nz, cx, cy) {
    nz = Math.max(0.1, Math.min(30, nz));
    const sx = cx / S.zoom - S.scrollX, sy = cy / S.zoom - S.scrollY;
    S.zoom = nz; S.scrollX = cx / nz - sx; S.scrollY = cy / nz - sy;
    notify(); schedule();
  }
  function fit() {
    if (!S.elements.length) { S.zoom = 1; S.scrollX = 0; S.scrollY = 0; schedule(); return; }
    const b = unionBounds(S.elements);
    const z = Math.max(0.1, Math.min(1, W / (b[2] - b[0] + 160), H / (b[3] - b[1] + 160)));
    S.zoom = z; S.scrollX = W / z / 2 - (b[0] + b[2]) / 2; S.scrollY = H / z / 2 - (b[1] + b[3]) / 2;
    notify(); schedule();
  }

  function newEl(type, p) {
    const c = S.cur;
    const plain = type === 'line' || type === 'arrow' || type === 'freedraw' || type === 'text';
    return fix({ id: uid(), type, x: p.x, y: p.y, strokeColor: c.strokeColor, backgroundColor: plain ? 'transparent' : c.backgroundColor, fillStyle: c.fillStyle, strokeWidth: c.strokeWidth, strokeStyle: c.strokeStyle, roughness: c.roughness, opacity: c.opacity, roundness: c.roundness, seed: Math.floor(Math.random() * 2147483647), points: isPointy({ type }) ? [[0, 0]] : undefined, endArrowhead: type === 'arrow' ? c.endArrowhead : null, startArrowhead: type === 'arrow' ? c.startArrowhead : null, fontSize: c.fontSize, fontFamily: c.fontFamily, textAlign: c.textAlign });
  }
  function topAt(p) {
    const tol = 8 / S.zoom;
    for (let i = S.elements.length - 1; i >= 0; i--) if (hitTest(S.elements[i], p.x, p.y, tol)) return S.elements[i];
    return null;
  }
  function hitHandle(p) {
    const hp = handlePos();
    if (!hp) return null;
    const r = 8 / S.zoom;
    for (const k of Object.keys(HANDLE_CURSOR)) if (Math.abs(p.x - hp[k][0]) <= r && Math.abs(p.y - hp[k][1]) <= r) return k;
    return null;
  }
  function hitPoint(e, p) {
    const r = 9 / S.zoom;
    for (let i = 0; i < e.points.length; i++) if (Math.hypot(p.x - e.x - e.points[i][0], p.y - e.y - e.points[i][1]) <= r) return i;
    return -1;
  }
  function snapAngle(dx, dy) {
    const len = Math.hypot(dx, dy), step = Math.PI / 12, a = Math.round(Math.atan2(dy, dx) / step) * step;
    return [Math.cos(a) * len, Math.sin(a) * len];
  }
  function updateCursor(p) {
    if (action) return;
    let c = 'default';
    if (S.tool === 'hand' || S.space) c = 'grab';
    else if (S.tool === 'selection') {
      const h = hitHandle(p);
      const sel = selectedEls();
      if (h) c = HANDLE_CURSOR[h];
      else if (sel.length === 1 && isLinear(sel[0]) && hitPoint(sel[0], p) >= 0) c = 'pointer';
      else if (topAt(p)) c = 'move';
    } else if (S.tool === 'text') c = 'text';
    else c = 'crosshair';
    ov.style.cursor = c;
  }

  function finishCreate(e) {
    S.selected = new Set([e.id]);
    commit();
    if (!S.locked) setTool('selection'); else S.selected = new Set();
  }
  function finishMulti() {
    const m = S.multi; S.multi = null;
    if (!m) return;
    const e = byId(m.id);
    if (!e) return;
    e.points.pop();
    S.noDbl = performance.now();
    if (e.points.length < 2) S.elements = S.elements.filter((x) => x.id !== e.id);
    else finishCreate(e);
    sync();
  }
  function addMultiPoint() {
    const e = byId(S.multi.id);
    const n = e.points.length, prev = e.points[n - 2], cur = e.points[n - 1];
    if (Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) < 3 / S.zoom) { finishMulti(); return; }
    e.points.push([cur[0], cur[1]]);
    schedule();
  }
  function moveMulti(p, ev) {
    const e = byId(S.multi.id);
    const n = e.points.length, last = e.points[n - 2];
    let dx = p.x - e.x - last[0], dy = p.y - e.y - last[1];
    if (ev.shiftKey) [dx, dy] = snapAngle(dx, dy);
    e.points[n - 1] = [last[0] + dx, last[1] + dy];
    schedule();
  }

  function onDown(ev) {
    if (S.editing) commitEdit();
    closePopups();
    const p = toScene(ev);
    ov.setPointerCapture(ev.pointerId);
    if (ev.button === 1 || S.tool === 'hand' || S.space) { action = { type: 'pan', sx: ev.clientX, sy: ev.clientY, ox: S.scrollX, oy: S.scrollY }; ov.style.cursor = 'grabbing'; return; }
    if (ev.button !== 0) return;
    if (S.multi) { addMultiPoint(); return; }
    const t = S.tool;
    if (t === 'selection') {
      const h = hitHandle(p);
      if (h) {
        const sel = selectedEls();
        action = { type: 'resize', handle: h, start: p, box: unionBounds(sel), orig: new Map(sel.map((e) => [e.id, JSON.parse(JSON.stringify(e))])) };
        return;
      }
      const sel1 = selectedEls();
      if (sel1.length === 1 && isLinear(sel1[0])) {
        const i = hitPoint(sel1[0], p);
        if (i >= 0) { action = { type: 'point', id: sel1[0].id, idx: i }; return; }
      }
      const hit = topAt(p);
      if (hit) {
        if (ev.shiftKey) { if (S.selected.has(hit.id)) S.selected.delete(hit.id); else S.selected.add(hit.id); }
        else if (!S.selected.has(hit.id)) S.selected = new Set([hit.id]);
        action = { type: 'move', start: p, moved: false, hitId: hit.id, shift: ev.shiftKey, orig: new Map(selectedEls().map((e) => [e.id, { x: e.x, y: e.y }])) };
      } else {
        if (!ev.shiftKey) S.selected = new Set();
        action = { type: 'marquee', start: p, cur: p, base: new Set(S.selected) };
      }
      refreshPanel();
    } else if (t === 'eraser') { action = { type: 'erase' }; eraseAt(p); }
    else if (t === 'text') { action = { type: 'text', p }; }
    else if (t === 'freedraw') { const e = newEl('freedraw', p); S.elements.push(e); S.selected = new Set(); action = { type: 'free', id: e.id }; }
    else if (t === 'arrow' || t === 'line') { const e = newEl(t, p); e.points = [[0, 0], [0, 0]]; S.elements.push(e); S.selected = new Set([e.id]); action = { type: 'linear', id: e.id, sx: ev.clientX, sy: ev.clientY }; }
    else { const e = newEl(t, p); S.elements.push(e); S.selected = new Set([e.id]); action = { type: 'create', id: e.id, start: p }; }
    schedule();
  }
  function onMove(ev) {
    const p = toScene(ev);
    if (!action) { if (S.multi) moveMulti(p, ev); updateCursor(p); return; }
    const a = action;
    if (a.type === 'pan') { S.scrollX = a.ox + (ev.clientX - a.sx) / S.zoom; S.scrollY = a.oy + (ev.clientY - a.sy) / S.zoom; }
    else if (a.type === 'create') {
      const e = byId(a.id);
      let w = p.x - a.start.x, h = p.y - a.start.y;
      if (ev.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = (w < 0 ? -1 : 1) * m; h = (h < 0 ? -1 : 1) * m; }
      e.x = Math.min(a.start.x, a.start.x + w); e.y = Math.min(a.start.y, a.start.y + h); e.width = Math.abs(w); e.height = Math.abs(h);
    } else if (a.type === 'linear') {
      const e = byId(a.id);
      let dx = p.x - e.x, dy = p.y - e.y;
      if (ev.shiftKey) [dx, dy] = snapAngle(dx, dy);
      e.points[1] = [dx, dy];
    } else if (a.type === 'free') {
      const e = byId(a.id), lx = e.points[e.points.length - 1];
      const nx = p.x - e.x, ny = p.y - e.y;
      if (Math.hypot(nx - lx[0], ny - lx[1]) > 1.5 / S.zoom) e.points.push([nx, ny]);
    } else if (a.type === 'move') {
      let dx = p.x - a.start.x, dy = p.y - a.start.y;
      if (!a.moved && Math.hypot(dx, dy) * S.zoom < 3) return;
      a.moved = true;
      if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
      const first = a.orig.values().next().value;
      if (S.grid && first) { dx = Math.round((first.x + dx) / 20) * 20 - first.x; dy = Math.round((first.y + dy) / 20) * 20 - first.y; }
      for (const e of selectedEls()) { const o = a.orig.get(e.id); if (o) { e.x = o.x + dx; e.y = o.y + dy; } }
    } else if (a.type === 'resize') doResize(p, ev);
    else if (a.type === 'point') {
      const e = byId(a.id);
      let nx = p.x, ny = p.y;
      if (ev.shiftKey && e.points.length > 1) { const ref = e.points[a.idx === 0 ? 1 : a.idx - 1]; const [dx, dy] = snapAngle(nx - e.x - ref[0], ny - e.y - ref[1]); nx = e.x + ref[0] + dx; ny = e.y + ref[1] + dy; }
      if (a.idx === 0) { const dx = nx - e.x, dy = ny - e.y; e.x += dx; e.y += dy; for (let i = 1; i < e.points.length; i++) e.points[i] = [e.points[i][0] - dx, e.points[i][1] - dy]; }
      else e.points[a.idx] = [nx - e.x, ny - e.y];
    } else if (a.type === 'marquee') a.cur = p;
    else if (a.type === 'erase') eraseAt(p);
    schedule();
  }
  function onUp(ev) {
    const a = action;
    action = null;
    if (!a) return;
    try { ov.releasePointerCapture(ev.pointerId); } catch (e) { a.released = true; }
    const p = toScene(ev);
    if (a.type === 'create') {
      const e = byId(a.id);
      if (e.width < 2 && e.height < 2) { S.elements = S.elements.filter((x) => x.id !== e.id); S.selected = new Set(); } else finishCreate(e);
    } else if (a.type === 'linear') {
      const e = byId(a.id);
      if (Math.hypot(ev.clientX - a.sx, ev.clientY - a.sy) < 4) { S.multi = { id: e.id }; e.points = [[0, 0], [0, 0]]; } else finishCreate(e);
    } else if (a.type === 'free') {
      commit();
    } else if (a.type === 'move') {
      if (!a.moved && !a.shift && S.selected.size > 1 && a.hitId) S.selected = new Set([a.hitId]);
      else if (a.moved) commit();
    } else if (a.type === 'resize' || a.type === 'point') commit();
    else if (a.type === 'marquee') {
      const x1 = Math.min(a.start.x, a.cur.x), y1 = Math.min(a.start.y, a.cur.y), x2 = Math.max(a.start.x, a.cur.x), y2 = Math.max(a.start.y, a.cur.y);
      const next = new Set(a.base);
      if (x2 - x1 > 2 || y2 - y1 > 2) for (const e of S.elements) { const b = bounds(e); if (b[0] >= x1 && b[1] >= y1 && b[2] <= x2 && b[3] <= y2) next.add(e.id); }
      S.selected = next;
    } else if (a.type === 'erase') {
      if (erased.size) { S.elements = S.elements.filter((e) => !erased.has(e.id)); S.selected = new Set([...S.selected].filter((id) => byId(id))); erased.clear(); commit(); }
    } else if (a.type === 'text') startTextAt(a.p);
    updateCursor(p);
    sync();
  }
  function eraseAt(p) {
    const tol = 6 / S.zoom;
    for (const e of S.elements) if (hitTest(e, p.x, p.y, tol)) erased.add(e.id);
  }
  function doResize(p, ev) {
    const a = action;
    const [x1, y1, x2, y2] = a.box;
    const dx = p.x - a.start.x, dy = p.y - a.start.y, h = a.handle;
    let nx1 = x1, ny1 = y1, nx2 = x2, ny2 = y2;
    if (h.includes('w')) nx1 = Math.min(x1 + dx, x2 - 4);
    if (h.includes('e')) nx2 = Math.max(x2 + dx, x1 + 4);
    if (h.includes('n')) ny1 = Math.min(y1 + dy, y2 - 4);
    if (h.includes('s')) ny2 = Math.max(y2 + dy, y1 + 4);
    const ow = Math.max(x2 - x1, 0.001), oh = Math.max(y2 - y1, 0.001);
    const hasText = [...a.orig.values()].some((o) => o.type === 'text');
    if (h.length === 2 && (ev.shiftKey || hasText)) {
      const s = Math.max((nx2 - nx1) / ow, (ny2 - ny1) / oh);
      if (h.includes('w')) nx1 = x2 - ow * s; else nx2 = x1 + ow * s;
      if (h.includes('n')) ny1 = y2 - oh * s; else ny2 = y1 + oh * s;
    }
    const sx = (nx2 - nx1) / ow, sy = (ny2 - ny1) / oh;
    for (const e of selectedEls()) {
      const o = a.orig.get(e.id);
      if (!o) continue;
      e.x = nx1 + (o.x - x1) * sx; e.y = ny1 + (o.y - y1) * sy;
      if (isPointy(o)) e.points = o.points.map(([px, py]) => [px * sx, py * sy]);
      else if (o.type === 'text') { e.fontSize = Math.max(6, Math.round(o.fontSize * sy)); Object.assign(e, measureText(e)); }
      else { e.width = o.width * sx; e.height = o.height * sy; }
    }
  }

  function startTextAt(p) {
    const e = newEl('text', p);
    S.elements.push(e);
    editText(e, true);
  }
  function editText(el, isNew) {
    closeEditor();
    S.editing = { id: el.id, isNew };
    S.selected = new Set([el.id]);
    const ta = document.createElement('textarea');
    ta.className = 'ed-text';
    ta.setAttribute('wrap', 'off');
    ta.setAttribute('aria-label', 'Text');
    ta.value = el.text || '';
    wrap.append(ta);
    S.editing.ta = ta;
    const layout = () => {
      const e = byId(S.editing.id);
      if (!e) return;
      const m = measureText({ text: ta.value || ' ', fontSize: e.fontSize, fontFamily: e.fontFamily });
      const z = S.zoom, w = Math.max(m.width, e.fontSize) + e.fontSize * 0.3;
      let left, top;
      if (e.type === 'text') { left = e.x; top = e.y; ta.style.textAlign = 'left'; }
      else { left = e.x + e.width / 2 - w / 2; top = e.y + e.height / 2 - m.height / 2; ta.style.textAlign = 'center'; }
      ta.style.left = (left + S.scrollX) * z + 'px'; ta.style.top = (top + S.scrollY) * z + 'px';
      ta.style.width = w * z + 'px'; ta.style.height = m.height * z + 'px';
      ta.style.fontSize = e.fontSize * z + 'px'; ta.style.lineHeight = '1.25'; ta.style.fontFamily = FONTS[e.fontFamily] || FONTS[1];
      ta.style.color = e.strokeColor; ta.style.opacity = String(e.opacity / 100);
      if (e.type === 'text') { e.width = m.width; e.height = m.height; }
    };
    S.editing.layout = layout;
    layout();
    ta.addEventListener('input', layout);
    const t0 = performance.now();
    ta.addEventListener('blur', () => { if (S.editing && S.editing.ta === ta && performance.now() - t0 < 300) { ta.focus({ preventScroll: true }); return; } commitEdit(); });
    ta.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Escape' || (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey))) { ev.preventDefault(); commitEdit(); } });
    ta.focus({ preventScroll: true });
    ta.select();
    requestAnimationFrame(() => { if (S.editing && S.editing.ta === ta && document.activeElement !== ta) ta.focus({ preventScroll: true }); });
    schedule();
  }
  function closeEditor() { if (S.editing) commitEdit(); }
  function commitEdit() {
    const ed = S.editing;
    if (!ed) return;
    S.editing = null;
    const ta = ed.ta;
    const val = ta.value.trimEnd();
    ta.removeEventListener('blur', commitEdit);
    ta.remove();
    const el = byId(ed.id);
    if (el) {
      if (el.type === 'text') {
        if (!val.trim()) { S.elements = S.elements.filter((x) => x.id !== el.id); S.selected.delete(el.id); }
        else { el.text = val; Object.assign(el, measureText(el)); if (!S.locked && S.tool === 'text') S.tool = 'selection'; }
      } else el.text = val;
    }
    commit(); sync();
  }

  function setProp(k, v, live) {
    S.cur[k] = v;
    for (const e of selectedEls()) {
      const a = APPLIES[k];
      if (a && !a.includes(e.type)) continue;
      e[k] = v;
      if (e.type === 'text' && (k === 'fontSize' || k === 'fontFamily')) Object.assign(e, measureText(e));
    }
    schedule();
    if (!live) { commit(); refreshPanel(); }
  }
  function deleteSelected() { if (!S.selected.size) return; S.elements = S.elements.filter((e) => !S.selected.has(e.id)); S.selected = new Set(); commit(); sync(); }
  function cloneEls(list, off) {
    return list.map((e) => { const c = JSON.parse(JSON.stringify(e)); c.id = uid(); c.seed = Math.floor(Math.random() * 2147483647); c.x += off; c.y += off; return c; });
  }
  function duplicate() { const c = cloneEls(selectedEls(), 12); if (!c.length) return; S.elements.push(...c); S.selected = new Set(c.map((e) => e.id)); commit(); sync(); }
  function layer(kind) {
    const sel = S.selected, els = S.elements;
    if (!sel.size) return;
    if (kind === 'front') S.elements = [...els.filter((e) => !sel.has(e.id)), ...els.filter((e) => sel.has(e.id))];
    else if (kind === 'back') S.elements = [...els.filter((e) => sel.has(e.id)), ...els.filter((e) => !sel.has(e.id))];
    else if (kind === 'fwd') { for (let i = els.length - 2; i >= 0; i--) if (sel.has(els[i].id) && !sel.has(els[i + 1].id)) [els[i], els[i + 1]] = [els[i + 1], els[i]]; }
    else { for (let i = 1; i < els.length; i++) if (sel.has(els[i].id) && !sel.has(els[i - 1].id)) [els[i], els[i - 1]] = [els[i - 1], els[i]]; }
    commit(); sync();
  }
  function setTool(id) {
    if (S.multi) finishMulti();
    closeEditor();
    S.tool = id;
    if (id !== 'selection') S.selected = new Set();
    ov.style.cursor = id === 'hand' ? 'grab' : id === 'selection' ? 'default' : id === 'text' ? 'text' : 'crosshair';
    sync();
  }

  function closePopups() { if (S.menu || S.help) { S.menu = false; S.help = false; S.confirmClear = false; renderMenu(); renderModal(); } }
  const swatches = (key, list, val) => list.map((c) => `<button type='button' class='sw${c === 'transparent' ? ' tr' : ''}${val === c ? ' on' : ''}' style='--c:${c}' data-set='${key}' data-val='${c}' title='${c}' aria-label='${c}' aria-pressed='${val === c}'></button>`).join('') + `<label class='sw custom' title='Custom color'><input type='color' data-set='${key}' value='${hex(val)}' aria-label='Custom color'></label>`;
  const group = (label, key, items, val) => `<div class='ps'><div class='pl'>${label}</div><div class='row'>${items.map((it) => `<button type='button' class='opt${String(it.v) === String(val) ? ' on' : ''}' data-set='${key}' data-val='${it.v}' title='${it.t}' aria-label='${it.t}' aria-pressed='${String(it.v) === String(val)}'>${it.h}</button>`).join('')}</div></div>`;
  const heads = [{ v: 'null', t: 'None', h: icon('headNone', 18) }, { v: 'arrow', t: 'Arrow', h: icon('headArrow', 18) }, { v: 'triangle', t: 'Triangle', h: icon('headTriangle', 18) }, { v: 'bar', t: 'Bar', h: icon('headBar', 18) }, { v: 'dot', t: 'Dot', h: icon('headDot', 18) }];
  function panelHTML() {
    const sel = selectedEls();
    const types = new Set(sel.length ? sel.map((e) => e.type) : (DRAW_TOOLS.includes(S.tool) ? [S.tool] : []));
    if (!types.size || S.editing) return '';
    const has = (...t) => t.some((x) => types.has(x));
    const v = (k) => (sel.length && sel[0][k] !== undefined ? sel[0][k] : S.cur[k]);
    const nonText = [...types].some((t) => t !== 'text');
    let h = `<div class='ps'><div class='pl'>Stroke</div><div class='row'>${swatches('strokeColor', STROKES, v('strokeColor'))}</div></div>`;
    if (has(...SHAPES)) {
      h += `<div class='ps'><div class='pl'>Background</div><div class='row'>${swatches('backgroundColor', BACKGROUNDS, v('backgroundColor'))}</div></div>`;
      h += group('Fill', 'fillStyle', [{ v: 'hachure', t: 'Hachure', h: `<span class='fillico hachure'></span>` }, { v: 'cross-hatch', t: 'Cross-hatch', h: `<span class='fillico cross'></span>` }, { v: 'solid', t: 'Solid', h: `<span class='fillico solidf'></span>` }], v('fillStyle'));
    }
    if (nonText) {
      group;
      h += group('Stroke width', 'strokeWidth', [{ v: 1, t: 'Thin', h: `<span class='bar' style='height:1.5px'></span>` }, { v: 2, t: 'Bold', h: `<span class='bar' style='height:3px'></span>` }, { v: 4, t: 'Extra bold', h: `<span class='bar' style='height:5px'></span>` }], v('strokeWidth'));
      h += group('Stroke style', 'strokeStyle', [{ v: 'solid', t: 'Solid', h: icon('solid', 18) }, { v: 'dashed', t: 'Dashed', h: icon('dashed', 18) }, { v: 'dotted', t: 'Dotted', h: icon('dotted', 18) }], v('strokeStyle'));
      h += group('Sloppiness', 'roughness', [{ v: 0, t: 'Architect', h: icon('sloppy0', 18) }, { v: 1, t: 'Artist', h: icon('sloppy1', 18) }, { v: 2, t: 'Cartoonist', h: icon('sloppy2', 18) }], v('roughness'));
    }
    if (has('rectangle', 'diamond')) h += group('Edges', 'roundness', [{ v: 'sharp', t: 'Sharp', h: icon('sharp', 18) }, { v: 'round', t: 'Round', h: icon('round', 18) }], v('roundness'));
    if (has('arrow')) {
      h += group('Arrow start', 'startArrowhead', heads.map((x) => ({ ...x, h: `<span class='flip'>${x.h}</span>` })), v('startArrowhead') === null ? 'null' : v('startArrowhead'));
      h += group('Arrow end', 'endArrowhead', heads, v('endArrowhead') === null ? 'null' : v('endArrowhead'));
    }
    if (has('text') || (sel.length && sel.some((e) => SHAPES.includes(e.type) && e.text))) {
      h += group('Font family', 'fontFamily', [{ v: 1, t: 'Hand-drawn', h: `<span class='ff ff1'>A</span>` }, { v: 2, t: 'Normal', h: `<span class='ff ff2'>A</span>` }, { v: 3, t: 'Code', h: `<span class='ff ff3'>A</span>` }], v('fontFamily'));
      h += group('Font size', 'fontSize', [{ v: 16, t: 'Small', h: 'S' }, { v: 20, t: 'Medium', h: 'M' }, { v: 28, t: 'Large', h: 'L' }, { v: 36, t: 'Very large', h: 'XL' }], v('fontSize'));
    }
    if (has('text')) h += group('Text align', 'textAlign', [{ v: 'left', t: 'Left', h: icon('alignLeft', 18) }, { v: 'center', t: 'Center', h: icon('alignCenter', 18) }, { v: 'right', t: 'Right', h: icon('alignRight', 18) }], v('textAlign'));
    h += `<div class='ps'><div class='pl'>Opacity <span id='opv'>${v('opacity')}</span></div><input type='range' min='0' max='100' step='10' value='${v('opacity')}' class='range' aria-label='Opacity'></div>`;
    if (sel.length) {
      h += `<div class='ps'><div class='pl'>Layers</div><div class='row'><button type='button' class='opt' data-act='back' title='Send to back (Ctrl+Shift+[)' aria-label='Send to back'>${icon('toBack', 18)}</button><button type='button' class='opt' data-act='bwd' title='Send backward (Ctrl+[)' aria-label='Send backward'>${icon('backward', 18)}</button><button type='button' class='opt' data-act='fwd' title='Bring forward (Ctrl+])' aria-label='Bring forward'>${icon('forward', 18)}</button><button type='button' class='opt' data-act='front' title='Bring to front (Ctrl+Shift+])' aria-label='Bring to front'>${icon('toFront', 18)}</button></div></div>`;
      h += `<div class='ps'><div class='pl'>Actions</div><div class='row'><button type='button' class='opt' data-act='dup' title='Duplicate (Ctrl+D)' aria-label='Duplicate'>${icon('copy', 18)}</button><button type='button' class='opt' data-act='del' title='Delete' aria-label='Delete'>${icon('trash', 18)}</button></div></div>`;
    }
    return h;
  }
  function refreshPanel() {
    const html = panelHTML();
    panel.classList.toggle('hidden', !html);
    if (html !== panelCache) { panelCache = html; panel.innerHTML = html; }
  }
  function refreshToolbar() {
    toolbar.innerHTML = `<button type='button' class='tbtn${S.locked ? ' on' : ''}' id='lockTool' title='Keep selected tool active after drawing' aria-label='Keep tool active' aria-pressed='${S.locked}'>${icon(S.locked ? 'lock' : 'unlock', 18)}</button><span class='tsep'></span>` + TOOLS.map((t) => `<button type='button' class='tbtn${S.tool === t.id ? ' on' : ''}' data-tool='${t.id}' title='${t.label} - ${t.keys.join(' or ').toUpperCase()}' aria-label='${t.label}' aria-pressed='${S.tool === t.id}'>${icon(t.ic, 18)}<span class='kb'>${t.keys[t.keys.length - 1]}</span></button>`).join('');
  }
  function sync() { schedule(); refreshPanel(); refreshToolbar(); }

  function renderMenu() {
    menu.classList.toggle('hidden', !S.menu);
    if (!S.menu) return;
    menu.innerHTML = `<a class='mi' href='${esc(opts.backHref)}'>${icon('back', 16)}<span>Back to project</span></a>
<form class='mi-form' id='renameForm'><label class='pl' for='rn'>Drawing name</label><div class='row'><input id='rn' class='inp' value='${esc(S.name)}' maxlength='80'><button class='btn small' type='submit'>Save</button></div></form>
<button class='mi' type='button' data-m='grid'>${icon('grid', 16)}<span>Show grid</span><span class='tick'>${S.grid ? '&#10003;' : ''}</span></button>
<button class='mi' type='button' data-m='fit'>${icon('fit', 16)}<span>Zoom to fit</span></button>
<button class='mi' type='button' data-m='theme'>${icon(dark() ? 'sun' : 'moon', 16)}<span>${dark() ? 'Light mode' : 'Dark mode'}</span></button>
<div class='ps'><div class='pl'>Canvas background</div><div class='row'>${VIEW_BGS.map((c) => `<button type='button' class='sw${S.viewBg === c ? ' on' : ''}' style='--c:${c}' data-bg='${c}' aria-label='Canvas ${c}'></button>`).join('')}</div></div>
${S.confirmClear ? `<div class='mi-confirm'>Clear the whole canvas? <button class='btn small danger' type='button' data-m='clear-yes'>Clear</button><button class='btn small' type='button' data-m='clear-no'>Cancel</button></div>` : `<button class='mi danger' type='button' data-m='clear'>${icon('trash', 16)}<span>Clear canvas</span></button>`}`;
  }
  function renderModal() {
    modal.classList.toggle('hidden', !S.help);
    if (!S.help) return;
    const rows = [['Tools', 'H hand, V or 1 selection, R rectangle, D diamond, O ellipse, A arrow, L line, P draw, T text, E eraser'], ['Pan', 'Space + drag, middle mouse, or mouse wheel'], ['Zoom', 'Ctrl + wheel, pinch, Ctrl + / Ctrl -, Ctrl 0 to reset, Shift 1 to fit'], ['Select', 'Click, Shift + click, or drag a box'], ['Edit', 'Double-click a shape or text to type; double-click empty canvas to add text'], ['Lines', 'Click-click for multi-point lines; Enter or double-click to finish; Shift snaps angles'], ['Undo / redo', 'Ctrl Z, Ctrl Shift Z'], ['Copy / paste / duplicate', 'Ctrl C, Ctrl V, Ctrl D'], ['Delete', 'Delete or Backspace'], ['Layers', 'Ctrl ] and Ctrl [ (add Shift for front or back)'], ['Grid', 'Ctrl + apostrophe']];
    modal.innerHTML = `<div class='island dialog' role='dialog' aria-label='Keyboard shortcuts'><div class='dlg-head'><b>Keyboard shortcuts</b><button class='iconbtn' type='button' data-m='closehelp' aria-label='Close'>${icon('close', 16)}</button></div>${rows.map((r) => `<div class='dlg-row'><span>${r[0]}</span><span class='muted'>${r[1]}</span></div>`).join('')}</div>`;
  }

  function onKey(ev) {
    if (S.editing) return;
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    const k = ev.key, lk = k.toLowerCase(), mod = ev.ctrlKey || ev.metaKey;
    if (k === ' ') { S.space = true; ov.style.cursor = 'grab'; ev.preventDefault(); return; }
    if (mod) {
      if (lk === 'z') { ev.preventDefault(); if (ev.shiftKey) redo(); else undo(); }
      else if (lk === 'y') { ev.preventDefault(); redo(); }
      else if (lk === 'd') { ev.preventDefault(); duplicate(); }
      else if (lk === 'a') { ev.preventDefault(); setTool('selection'); S.selected = new Set(S.elements.map((e) => e.id)); sync(); }
      else if (lk === 'c' || lk === 'x') { clip = selectedEls().map((e) => JSON.parse(JSON.stringify(e))); pasteN = 0; if (lk === 'x') deleteSelected(); }
      else if (lk === 'v') { if (clip.length) { ev.preventDefault(); pasteN += 1; const c = cloneEls(clip, 20 * pasteN); S.elements.push(...c); S.selected = new Set(c.map((e) => e.id)); S.tool = 'selection'; commit(); sync(); } }
      else if (lk === 's') ev.preventDefault();
      else if (k === ']') { ev.preventDefault(); layer(ev.shiftKey ? 'front' : 'fwd'); }
      else if (k === '[') { ev.preventDefault(); layer(ev.shiftKey ? 'back' : 'bwd'); }
      else if (k === '}') { ev.preventDefault(); layer('front'); }
      else if (k === '{') { ev.preventDefault(); layer('back'); }
      else if (k === "'") { ev.preventDefault(); S.grid = !S.grid; notify(); schedule(); }
      else if (k === '0') { ev.preventDefault(); zoomTo(1, W / 2, H / 2); }
      else if (k === '=' || k === '+') { ev.preventDefault(); zoomTo(S.zoom * 1.2, W / 2, H / 2); }
      else if (k === '-') { ev.preventDefault(); zoomTo(S.zoom / 1.2, W / 2, H / 2); }
      return;
    }
    if (k === 'Escape') { if (S.multi) finishMulti(); else if (S.menu || S.help) closePopups(); else if (S.tool !== 'selection') setTool('selection'); else { S.selected = new Set(); sync(); } return; }
    if (k === 'Enter') { if (S.multi) finishMulti(); else if (S.selected.size === 1) { const e = selectedEls()[0]; if (e.type === 'text' || SHAPES.includes(e.type)) { ev.preventDefault(); editText(e, false); } } return; }
    if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); deleteSelected(); return; }
    if (k.startsWith('Arrow') && S.selected.size) {
      ev.preventDefault();
      const d = ev.shiftKey ? 10 : 1;
      const dx = k === 'ArrowLeft' ? -d : k === 'ArrowRight' ? d : 0, dy = k === 'ArrowUp' ? -d : k === 'ArrowDown' ? d : 0;
      for (const e of selectedEls()) { e.x += dx; e.y += dy; }
      commit(); return;
    }
    if (k === '!') { fit(); return; }
    if (!ev.altKey) { const tool = TOOLS.find((x) => x.keys.includes(lk)); if (tool) setTool(tool.id); }
  }
  function onKeyUp(ev) { if (ev.key === ' ') { S.space = false; ov.style.cursor = S.tool === 'hand' ? 'grab' : 'default'; } }

  ov.addEventListener('pointerdown', onDown, { signal });
  ov.addEventListener('pointermove', onMove, { signal });
  ov.addEventListener('pointerup', onUp, { signal });
  ov.addEventListener('pointercancel', onUp, { signal });
  ov.addEventListener('contextmenu', (ev) => ev.preventDefault(), { signal });
  ov.addEventListener('dblclick', (ev) => {
    if (S.multi) { finishMulti(); return; }
    if (performance.now() - S.noDbl < 600) return;
    if (S.tool !== 'selection') return;
    const p = toScene(ev);
    const hit = topAt(p);
    if (hit && (hit.type === 'text' || SHAPES.includes(hit.type))) editText(hit, false);
    else if (!hit) startTextAt(p);
  }, { signal });
  ov.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const r = ov.getBoundingClientRect();
    if (ev.ctrlKey || ev.metaKey) zoomTo(S.zoom * Math.exp(-ev.deltaY * 0.01), ev.clientX - r.left, ev.clientY - r.top);
    else { S.scrollX -= (ev.shiftKey ? ev.deltaY : ev.deltaX) / S.zoom; S.scrollY -= (ev.shiftKey ? 0 : ev.deltaY) / S.zoom; schedule(); }
  }, { passive: false, signal });
  window.addEventListener('keydown', onKey, { signal });
  window.addEventListener('keyup', onKeyUp, { signal });

  toolbar.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.id === 'lockTool') { S.locked = !S.locked; refreshToolbar(); }
    else if (b.dataset.tool) setTool(b.dataset.tool);
  }, { signal });
  panel.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-set],[data-act]');
    if (!b || b.tagName === 'INPUT') return;
    if (b.dataset.act) {
      const a = b.dataset.act;
      if (a === 'dup') duplicate(); else if (a === 'del') deleteSelected(); else layer(a === 'fwd' ? 'fwd' : a === 'bwd' ? 'bwd' : a);
      return;
    }
    const k = b.dataset.set;
    let val = b.dataset.val;
    if (val === 'null') val = null; else if (NUMERIC.includes(k)) val = Number(val);
    setProp(k, val);
  }, { signal });
  panel.addEventListener('input', (ev) => {
    const t = ev.target;
    if (t.matches('input[type=color]')) setProp(t.dataset.set, t.value, true);
    else if (t.matches('input[type=range]')) { setProp('opacity', Number(t.value), true); const o = panel.querySelector('#opv'); if (o) o.textContent = t.value; }
  }, { signal });
  panel.addEventListener('change', (ev) => { if (ev.target.matches('input[type=color],input[type=range]')) { commit(); panelCache = ''; refreshPanel(); } }, { signal });

  q('#menuBtn').addEventListener('click', (ev) => { ev.stopPropagation(); S.help = false; S.menu = !S.menu; S.confirmClear = false; renderMenu(); renderModal(); }, { signal });
  q('#helpBtn').addEventListener('click', (ev) => { ev.stopPropagation(); S.menu = false; S.help = !S.help; renderMenu(); renderModal(); }, { signal });
  menu.addEventListener('click', (ev) => {
    const bg = ev.target.closest('[data-bg]');
    if (bg) { S.viewBg = bg.dataset.bg; notify(); schedule(); renderMenu(); return; }
    const b = ev.target.closest('[data-m]');
    if (!b) return;
    const m = b.dataset.m;
    if (m === 'grid') { S.grid = !S.grid; notify(); schedule(); renderMenu(); }
    else if (m === 'fit') { fit(); closePopups(); }
    else if (m === 'theme') { toggleTheme(); }
    else if (m === 'clear') { S.confirmClear = true; renderMenu(); }
    else if (m === 'clear-no') { S.confirmClear = false; renderMenu(); }
    else if (m === 'clear-yes') { S.elements = []; S.selected = new Set(); S.confirmClear = false; commit(); sync(); closePopups(); }
  }, { signal });
  menu.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = menu.querySelector('#rn').value.trim();
    if (!name) return;
    S.name = name;
    q('#edName').textContent = name;
    if (opts.onRename) opts.onRename(name);
    closePopups();
  }, { signal });
  modal.addEventListener('click', (ev) => { if (ev.target === modal || ev.target.closest('[data-m=closehelp]')) { S.help = false; renderModal(); } }, { signal });
  q('#zin').addEventListener('click', () => zoomTo(S.zoom * 1.2, W / 2, H / 2), { signal });
  q('#zout').addEventListener('click', () => zoomTo(S.zoom / 1.2, W / 2, H / 2), { signal });
  q('#zval').addEventListener('click', () => zoomTo(1, W / 2, H / 2), { signal });
  q('#undo').addEventListener('click', undo, { signal });
  q('#redo').addEventListener('click', redo, { signal });
  const themeBtn = q('#themeBtn');
  const paintTheme = () => { themeBtn.innerHTML = icon(dark() ? 'sun' : 'moon', 20); };
  paintTheme();
  themeBtn.addEventListener('click', () => toggleTheme(), { signal });
  window.addEventListener('sketchpad-theme', () => { paintTheme(); renderMenu(); schedule(); }, { signal });

  const ro = new ResizeObserver(resize);
  ro.observe(wrap);
  q('#edName').textContent = S.name;
  refreshToolbar();
  resize();
  function destroy() {
    ro.disconnect();
    if (raf) cancelAnimationFrame(raf);
    if (S.editing) { S.editing.ta.removeEventListener('blur', commitEdit); S.editing = null; }
  }
  signal.addEventListener('abort', destroy, { once: true });
  return {
    scene: sceneObj,
    destroy,
    setName(n) { S.name = n; q('#edName').textContent = n; },
    setStatus(text, kind) { statusEl.textContent = text || ''; statusEl.dataset.kind = kind || ''; }
  };
}
