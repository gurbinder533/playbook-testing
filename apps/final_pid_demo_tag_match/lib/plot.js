import { esc } from "@corvic/live";

// Small SVG charts drawn from data the page read itself. The assistant only chooses WHAT to plot; it never supplies
// markup, and every label is escaped.
const PAL = ["#991d85", "#0ea5e9", "#f59e0b", "#16a34a"];
const W = 640, H = 250, L = 50, R = 12, T = 12, B = 28;
const tms = (h) => (h instanceof Date ? h.getTime() : new Date(h).getTime());
const fmt = (v) => (v == null || !Number.isFinite(v) ? "\u2013" : Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
const dayLabel = (t) => new Date(t).toISOString().slice(5, 10);
const stamp = (t) => new Date(t).toISOString().slice(0, 16).replace("T", " ") + " UTC";

function yAxis(lo, hi) {
  let g = "";
  for (let k = 0; k <= 4; k++) {
    const v = lo + ((hi - lo) * k) / 4, y = T + (1 - k / 4) * (H - T - B);
    g += `<line x1="${L}" x2="${W - R}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#eadfe8" stroke-width="1"/><text x="${L - 6}" y="${(y + 4).toFixed(1)}" font-size="11" fill="#74677a" text-anchor="end">${esc(fmt(v))}</text>`;
  }
  return g;
}

function lineChart(spec, box, signal) {
  const ser = spec.series.map((s, k) => ({
    name: s.name, color: PAL[k % PAL.length],
    pts: s.pts.map((p) => ({ t: tms(p.hour), v: p.value == null ? null : Number(p.value), ng: Number(p.non_good) || 0 })).filter((p) => Number.isFinite(p.t)),
  }));
  const all = ser.flatMap((s) => s.pts.filter((p) => p.v != null && Number.isFinite(p.v)));
  if (all.length < 2) { box.insertAdjacentHTML("beforeend", `<p class="muted small">There are no hourly readings to plot for this selection.</p>`); return; }
  let t0 = Infinity, t1 = -Infinity, lo = Infinity, hi = -Infinity;
  for (const p of all) { if (p.t < t0) t0 = p.t; if (p.t > t1) t1 = p.t; if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; }
  const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
  const X = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R), Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  let g = yAxis(lo, hi);
  for (let t = Math.ceil(t0 / 864e5) * 864e5; t <= t1; t += 864e5) g += `<line x1="${X(t).toFixed(1)}" x2="${X(t).toFixed(1)}" y1="${T}" y2="${H - B}" stroke="#f3ecf1"/><text x="${X(t).toFixed(1)}" y="${H - 8}" font-size="11" fill="#74677a" text-anchor="middle">${esc(dayLabel(t))}</text>`;
  for (const s of ser) {
    let d = "", pen = false;
    for (const p of s.pts) { if (p.v == null || !Number.isFinite(p.v)) { pen = false; continue; } d += `${pen ? "L" : "M"}${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`; pen = true; }
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.7" stroke-linejoin="round"/>`;
    g += s.pts.filter((p) => p.ng > 0 && p.v != null && Number.isFinite(p.v)).map((p) => `<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.v).toFixed(1)}" r="2.6" fill="#dc2626"/>`).join("");
  }
  g += `<line class="xh" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="#241322" stroke-opacity=".45" stroke-dasharray="3 3" visibility="hidden"/>`;
  const legend = ser.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("") + `<span><i style="background:#dc2626;border-radius:50%"></i>hour with non-Good readings</span>`;
  box.insertAdjacentHTML("beforeend", `<div class="lg">${legend}</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(spec.title)}">${g}<rect class="hit" x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent"/></svg><div class="ro muted">Move over the chart to read values</div>`);
  const svg = box.querySelector("svg"), ro = box.querySelector(".ro"), xh = box.querySelector(".xh");
  svg.addEventListener("pointermove", (e) => {
    const rc = svg.getBoundingClientRect(); const fx = ((e.clientX - rc.left) / rc.width) * W;
    const t = t0 + ((fx - L) / (W - L - R)) * (t1 - t0);
    const near = (s) => s.pts.reduce((b, p) => (b == null || Math.abs(p.t - t) < Math.abs(b.t - t) ? p : b), null);
    const first = near(ser[0]); if (!first) return;
    xh.setAttribute("x1", X(first.t).toFixed(1)); xh.setAttribute("x2", X(first.t).toFixed(1)); xh.setAttribute("visibility", "visible");
    ro.textContent = stamp(first.t) + " \u00b7 " + ser.map((s) => { const p = near(s); return `${s.name}: ${fmt(p?.v)}${spec.units ? " " + spec.units : ""}${p && p.ng ? ` (${p.ng} non-Good)` : ""}`; }).join(" \u00b7 ");
  }, { signal });
  svg.addEventListener("pointerleave", () => { xh.setAttribute("visibility", "hidden"); ro.textContent = "Move over the chart to read values"; }, { signal });
}

function barChart(spec, box) {
  const cats = spec.categories, segs = spec.segments;
  const tot = cats.map((_, i) => segs.reduce((a, s) => a + (s.values[i] || 0), 0));
  const hi = Math.max(1, ...tot);
  const step = (W - L - R) / cats.length, bw = Math.min(40, step * 0.66);
  const Y = (v) => T + (1 - v / hi) * (H - T - B);
  let g = yAxis(0, hi);
  cats.forEach((c, i) => {
    const x = L + step * i + (step - bw) / 2; let acc = 0;
    for (const s of segs) {
      const v = s.values[i] || 0; if (!v) continue;
      g += `<rect x="${x.toFixed(1)}" y="${Y(acc + v).toFixed(1)}" width="${bw.toFixed(1)}" height="${(Y(acc) - Y(acc + v)).toFixed(1)}" fill="${s.color}"><title>${esc(c)} \u00b7 ${esc(s.name)}: ${v}</title></rect>`;
      acc += v;
    }
    g += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" font-size="11" fill="#74677a" text-anchor="middle">${esc(c)}</text><text x="${(x + bw / 2).toFixed(1)}" y="${(Y(tot[i]) - 4).toFixed(1)}" font-size="10" fill="#241322" text-anchor="middle">${tot[i]}</text>`;
  });
  const legend = segs.filter((s) => s.values.some((v) => v)).map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)} ${s.values.reduce((a, v) => a + (v || 0), 0)}</span>`).join("");
  box.insertAdjacentHTML("beforeend", `<div class="lg">${legend}</div><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(spec.title)}">${g}</svg>`);
}

/** Build one chart card from a spec the page created: `{ kind: "line" | "bars", title, ... }`. */
export function mountChart(spec, signal) {
  const box = document.createElement("div");
  box.className = "chartc";
  box.innerHTML = `<h5>${esc(spec.title)}</h5>`;
  try { if (spec.kind === "bars") barChart(spec, box); else lineChart(spec, box, signal); }
  catch { box.insertAdjacentHTML("beforeend", `<p class="muted small">This chart could not be drawn.</p>`); }
  return box;
}
