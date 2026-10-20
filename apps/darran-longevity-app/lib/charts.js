import { esc, M, statusOf, STATUS_COLOR, f, mstr } from "./core.js";

function niceTicks(lo, hi, n = 5) {
  const span = hi - lo || 1, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0)), norm = step0 / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step, t = [];
  for (let v = a; v <= b + 1e-9; v += step) t.push(+v.toFixed(10));
  return t;
}

/** series: [{name,color,pts:[{t,v,hollow,why,src}],width}] \u2014 band: [lo,hi] \u2014 marks: [{t,label,color,bold}] */
export function lineChart(o) {
  const W = o.w || 640, H = o.h || 240, c = !!o.compact;
  const m = c ? { l: 4, r: 4, t: 6, b: 4 } : { l: o.ml || 48, r: 16, t: 18, b: o.noAxisX ? 6 : 30 };
  const all = o.series.flatMap((s) => s.pts);
  if (!all.length) return `<div class="empty-chart">No readings</div>`;
  let tMin = Math.min(...all.map((p) => p.t)), tMax = Math.max(...all.map((p) => p.t));
  if (o.tMin != null) tMin = Math.min(tMin, o.tMin);
  if (o.tMax != null) tMax = Math.max(tMax, o.tMax);
  if (tMax === tMin) { tMin -= 20 * 864e5; tMax += 20 * 864e5; }
  const padT = o.noPad ? 0 : (tMax - tMin) * 0.04; tMin -= padT; tMax += padT;
  let yMin = Math.min(...all.map((p) => p.v)), yMax = Math.max(...all.map((p) => p.v));
  if (o.band) { if (o.band[0] != null) yMin = Math.min(yMin, o.band[0]); if (o.band[1] != null) yMax = Math.max(yMax, o.band[1]); }
  const pad = (yMax - yMin || Math.abs(yMax) * 0.1 || 1) * 0.14;
  yMin -= pad; yMax += pad;
  if (o.yMin != null) yMin = o.yMin;
  const sx = (t) => m.l + ((t - tMin) / (tMax - tMin)) * (W - m.l - m.r);
  const sy = (v) => H - m.b - ((v - yMin) / (yMax - yMin)) * (H - m.t - m.b);
  let g = "";
  if (o.band) {
    const y1 = sy(o.band[1] != null ? o.band[1] : yMax), y2 = sy(o.band[0] != null ? o.band[0] : yMin);
    g += `<rect x="${m.l}" y="${y1}" width="${W - m.l - m.r}" height="${Math.max(0, y2 - y1)}" fill="#3ee0c4" opacity="0.09"/>`;
    if (!c) for (const b of o.band) if (b != null) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(b)}" y2="${sy(b)}" stroke="#3ee0c4" stroke-dasharray="2 4" opacity="0.45"/>`;
  }
  if (!c) {
    if (o.title) g += `<text x="${m.l}" y="11" class="ct">${esc(o.title)}</text>`;
    for (const v of niceTicks(yMin, yMax, 5)) { if (v < yMin || v > yMax) continue;
      g += `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(v)}" y2="${sy(v)}" stroke="#22314f" opacity="0.7"/><text x="${m.l - 6}" y="${sy(v) + 4}" text-anchor="end" class="ax">${+v.toFixed(2)}</text>`; }
    const span = tMax - tMin, years = span / (365.25 * 864e5);
    if (!o.noAxisX) {
    const stepM = years > 2.5 ? 12 : years > 1.2 ? 6 : 3;
    const d0 = new Date(tMin); let y = d0.getUTCFullYear(), mo = Math.floor(d0.getUTCMonth() / stepM) * stepM;
    for (let i = 0; i < 80; i++) {
      const t = Date.UTC(y, mo, 1); mo += stepM; if (mo >= 12) { y += Math.floor(mo / 12); mo %= 12; }
      if (t < tMin) continue; if (t > tMax) break;
      g += `<line x1="${sx(t)}" x2="${sx(t)}" y1="${m.t}" y2="${H - m.b}" stroke="#22314f" opacity="0.45"/><text x="${sx(t)}" y="${H - 10}" text-anchor="middle" class="ax">${stepM === 12 ? new Date(t).getUTCFullYear() : mstr(new Date(t).toISOString().slice(0, 10))}</text>`;
    }
    }
  }
  for (const mk of o.marks || []) {
    if (mk.t < tMin || mk.t > tMax) continue;
    g += `<line x1="${sx(mk.t)}" x2="${sx(mk.t)}" y1="${m.t}" y2="${H - m.b}" stroke="${mk.color}" stroke-dasharray="${mk.bold ? "5 3" : "1 4"}" opacity="${mk.bold ? 0.95 : 0.35}"><title>${esc(mk.label)}</title></line>`;
    if (!c && mk.bold) g += `<text x="${sx(mk.t) + 4}" y="${m.t + 9}" class="ax" fill="${mk.color}">${esc(mk.label)}</text>`;
  }
  for (const s of o.series) {
    const solid = s.pts.filter((p) => !p.hollow);
    if (solid.length > 1) g += `<path d="${solid.map((p, i) => (i ? "L" : "M") + sx(p.t).toFixed(1) + "," + sy(p.v).toFixed(1)).join("")}" fill="none" stroke="${s.color}" stroke-width="${s.width || (c ? 1.6 : 2.2)}" stroke-linejoin="round" opacity="0.9"/>`;
    for (const p of s.pts) {
      const x = sx(p.t), y = sy(p.v), r = c ? 2.6 : 4.4;
      const tip = `${s.name ? s.name + ": " : ""}${f(p.v, o.dp != null ? o.dp : 2)} ${o.unit || ""} \u00b7 ${p.d || ""}${p.src ? " \u00b7 " + p.src : ""}${p.why ? " \u2014 EXCLUDED: " + p.why : ""}`;
      if (p.hollow) g += `<circle cx="${x}" cy="${y}" r="${r + 1}" fill="#0b1226" stroke="#8ea0c4" stroke-width="1.6" stroke-dasharray="2 2"><title>${esc(tip)}</title></circle>`;
      else g += `<circle cx="${x}" cy="${y}" r="${r}" fill="${o.statusKey ? STATUS_COLOR[statusOf(o.statusKey, p.v)] : s.color}" stroke="#0b1226" stroke-width="1.2"><title>${esc(tip)}</title></circle>`;
    }
  }
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || "trend chart")}">${g}</svg>`;
}

export function seriesFor(st, key, extra = {}) {
  const pts = (st.series[key] || []).map((p) => ({ ...p }));
  for (const p of st.excl[key] || []) pts.push({ ...p, hollow: true });
  pts.sort((a, b) => a.t - b.t);
  return { name: (M[key] && M[key].l) || key, color: "#5cc8ff", pts, ...extra };
}

export function bars(items) {
  return `<div class="bars">${items.map((i) => `<div class="bar-row"><span class="bar-l">${esc(i.label)}</span><span class="bar-t"><i style="width:${Math.max(2, Math.min(100, (i.value / i.max) * 100))}%;background:${i.color || "#5cc8ff"}"></i></span><span class="bar-v">${esc(i.text != null ? i.text : String(i.value))}</span></div>`).join("")}</div>`;
}

export function pctBar(label, pct, note) {
  const col = pct < 20 ? "#ff7a59" : pct < 40 ? "#ffb020" : "#3ee0c4";
  return `<div class="pct"><div class="pct-h"><span>${esc(label)}</span><b style="color:${col}">${pct}<sup>th</sup> pct</b></div><div class="pct-t"><i style="left:${pct}%;background:${col}"></i></div>${note ? `<small>${esc(note)}</small>` : ""}</div>`;
}
