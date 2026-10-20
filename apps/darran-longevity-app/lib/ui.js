import { esc, f, M, STATUS_COLOR, STATUS_LABEL, statusOf, dstr, mstr, GROUPS } from "./core.js";
import { lineChart, seriesFor } from "./charts.js";

export const pill = (s) => `<span class="pill ${s}">${STATUS_LABEL[s] || s}</span>`;
export const dot = (s) => `<i class="sdot" style="background:${STATUS_COLOR[s]}" title="${STATUS_LABEL[s]}"></i>`;
export const chip = (t, cls = "") => `<span class="chip ${cls}">${esc(t)}</span>`;

export function bandOf(k) { const c = M[k] || {}; return c.lo != null || c.hi != null ? [c.lo != null ? c.lo : null, c.hi != null ? c.hi : null] : null; }

export function metricCard(st, key, selected) {
  const s = st.series[key];
  if (!s || !s.length) return "";
  const c = M[key], last = s[s.length - 1], first = s[0], status = statusOf(key, last.v);
  const d = s.length > 1 ? last.v - first.v : null;
  const ser = seriesFor(st, key);
  const chart = s.length > 1 ? lineChart({ series: [ser], band: bandOf(key), compact: true, w: 220, h: 54, statusKey: key, unit: c.u, dp: c.dp, label: c.l }) : `<div class="single">single reading</div>`;
  return `<button type="button" class="mcard s-${status}${selected ? " sel" : ""}" data-k="${key}">
<div class="mc-h"><span>${esc(c.l)}</span>${pill(status)}</div>
<div class="mc-v">${f(last.v, c.dp != null ? c.dp : 1)}<small> ${esc(c.u || "")}</small></div>
${chart}
<div class="mc-f"><span>${s.length} reading${s.length > 1 ? "s" : ""} \u00b7 ${mstr(first.d)}\u2013${mstr(last.d)}</span>${d != null ? `<b class="${d > 0 ? "up" : d < 0 ? "dn" : ""}">${d > 0 ? "\u25b2" : d < 0 ? "\u25bc" : "\u2022"} ${f(Math.abs(d), c.dp != null ? c.dp : 1)}</b>` : ""}</div></button>`;
}

/** Greedy word wrap for SVG labels: at most `max` characters per line, at most 3 lines (the rest is cut with an ellipsis). */
function wrapLabel(s, max = 17) {
  const words = String(s).split(/\s+/), lines = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > max) { lines.push(cur); cur = w; } else cur = cur ? cur + " " + w : w;
  }
  if (cur) lines.push(cur);
  if (lines.length > 3) { const rest = lines.slice(2).join(" "); lines.length = 2; lines.push(rest.length > max ? rest.slice(0, max - 1) + "\u2026" : rest); }
  return lines;
}

/** Radar of the share of metrics in range per domain. Each domain label and dot is a link to the Trends tab (`trends?g=<domain>`) with that domain pre-selected. */
export function radar(items) {
  const W = 580, H = 390, cx = 290, cy = 195, R = 124, n = items.length, LH = 13;
  const P = (i, r) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  let g = "";
  for (const k of [0.25, 0.5, 0.75, 1]) g += `<polygon points="${items.map((_, i) => P(i, R * k).join(",")).join(" ")}" fill="none" stroke="#22314f" opacity="${k === 1 ? 0.9 : 0.5}"/>`;
  items.forEach((_, i) => { const [x, y] = P(i, R); g += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#22314f"/>`; });
  const pts = items.map((it, i) => P(i, R * Math.max(0.1, it.share)));
  g += `<polygon points="${pts.map((p) => p.join(",")).join(" ")}" fill="#3ee0c4" fill-opacity="0.16" stroke="#3ee0c4" stroke-width="2"/>`;
  items.forEach((it, i) => {
    const [x, y] = pts[i], [lx, ly] = P(i, R + 16), anchor = lx < cx - 8 ? "end" : lx > cx + 8 ? "start" : "middle";
    const lines = wrapLabel(it.g), sub = it.n ? it.ok + "/" + it.n + " in range" : "no data yet", blockH = (lines.length + 1) * LH;
    // the block grows away from the chart: upward for labels above it, downward for those below, centred at the sides
    const dy = ly < cy - 14 ? -blockH + 4 : ly > cy + 14 ? 10 : -blockH / 2 + 6;
    const y0 = ly + dy, tspans = lines.map((l, j) => `<tspan x="${lx}" y="${(y0 + j * LH).toFixed(1)}">${esc(l)}</tspan>`).join("");
    const href = "trends?g=" + encodeURIComponent(it.g), tip = `${esc(it.g)}: ${it.ok} of ${it.n} metrics in range \u2014 open in Trends`;
    g += `<a href="${href}" class="rlink" data-dom="${esc(it.g)}" aria-label="Open ${esc(it.g)} in Trends"><title>${tip}</title><circle cx="${x}" cy="${y}" r="5" fill="${STATUS_COLOR[it.worst]}" stroke="#0b1226" stroke-width="1.5"/></a>`;
    const bx = anchor === "end" ? lx - 130 : anchor === "start" ? lx - 2 : lx - 65;
    g += `<a href="${href}" class="rlink" data-dom="${esc(it.g)}" aria-label="Open ${esc(it.g)} in Trends"><title>${tip}</title><rect x="${bx}" y="${(y0 - 11).toFixed(1)}" width="132" height="${blockH + 4}" fill="transparent"/><text text-anchor="${anchor}" class="rl">${tspans}</text><text x="${lx}" y="${(y0 + lines.length * LH).toFixed(1)}" text-anchor="${anchor}" class="rs">${esc(sub)}</text></a>`;
  });
  return `<svg class="radar" viewBox="0 0 ${W} ${H}" role="group" aria-label="Share of metrics in range by domain; select a domain to open it in Trends">${g}</svg>`;
}

/** Remembers which Trends domain a radar link asked for (module state, with sessionStorage and the URL as fallbacks). */
export function wireRadar(root, signal) {
  root.querySelectorAll("a.rlink").forEach((a) => a.addEventListener("click", () => { const d = a.dataset.dom; window.__trendsGroup = d; try { sessionStorage.setItem("trendsGroup", d); } catch (_) { /* storage may be blocked */ } }, { signal }));
}

const TCOL = { "Tirzepatide": "#a78bfa", "EECP": "#ff7a59", "Far": "#ffb020", "Hyperbaric": "#5cc8ff", "IV": "#3ee0c4", "Coffee": "#b08968", "Colon": "#b08968", "Liver": "#b08968" };
export const tcolor = (t) => { for (const k in TCOL) if (t.startsWith(k)) return TCOL[k]; return "#8ea0c4"; };

/** Gantt strip of therapies, aligned to lineChart margins (pass the same ml, W, tMin, tMax). */
export function gantt(st, o) {
  const W = o.w || 1000, ml = o.ml || 48, mr = 16, rowH = 18, ev = st.ev("therapy").slice().sort((a, b) => a.t - b.t);
  const H = ev.length * rowH + 26, sx = (t) => ml + ((t - o.tMin) / (o.tMax - o.tMin)) * (W - ml - mr);
  let g = "";
  const yr0 = new Date(o.tMin).getUTCFullYear(), yr1 = new Date(o.tMax).getUTCFullYear();
  for (let y = yr0; y <= yr1 + 1; y++) { const t = Date.UTC(y, 0, 1); if (t < o.tMin || t > o.tMax) continue; g += `<line x1="${sx(t)}" x2="${sx(t)}" y1="0" y2="${H - 18}" stroke="#22314f" opacity="0.5"/><text x="${sx(t) + 3}" y="${H - 5}" class="ax">${y}</text>`; }
  ev.forEach((e, i) => {
    const y = i * rowH + 4, col = tcolor(e.title), x1 = sx(e.t), x2 = e.t2 ? sx(e.t2) : x1;
    const maxCh = Math.max(8, Math.floor((ml - 26) / 5.4)), short = e.title.length > maxCh ? e.title.slice(0, maxCh - 1).trimEnd() + "\u2026" : e.title;
    const per = `${dstr(e.start)}${e.end ? " \u2192 " + dstr(e.end) : ""} \u00b7 ${e.n} session${e.n === 1 ? "" : "s"}`;
    g += `<g class="glab" tabindex="0" role="button" data-t="${esc(e.title)}" data-p="${esc(per)}" data-d="${esc(e.detail || "")}" aria-label="${esc(e.title + ". " + per)}"><rect x="0" y="${y - 1}" width="${ml - 4}" height="${rowH - 2}" fill="transparent"/><circle cx="9" cy="${y + 7}" r="3.5" fill="${col}"/><text x="18" y="${y + 10.5}" class="gl">${esc(short)}</text></g>`;
    g += `<line x1="${ml}" x2="${W - mr}" y1="${y + 7}" y2="${y + 7}" stroke="#1b2744"/>`;
    g += x2 - x1 > 3 ? `<rect x="${x1}" y="${y + 1}" width="${x2 - x1}" height="12" rx="4" fill="${col}" opacity="0.35" stroke="${col}"><title>${esc(e.title)}: ${esc(e.detail || "")} (${e.start} \u2192 ${e.end})</title></rect>` : "";
    g += `<circle cx="${x1}" cy="${y + 7}" r="4" fill="${col}"><title>${esc(e.title)} \u2014 ${e.start}</title></circle>`;
    if (x2 - x1 > 3) g += `<circle cx="${x2}" cy="${y + 7}" r="3" fill="${col}" opacity="0.7"/>`;
  });
  return `<div class="gwrap"><svg class="chart gantt" viewBox="0 0 ${W} ${H}" role="group" aria-label="Therapy timeline">${g}</svg><div class="gpop" hidden></div></div>`;
}

/** Hover / tap / focus popups with the full therapy name for every .glab inside `root`. */
export function wireGantt(root, signal) {
  root.querySelectorAll(".gwrap").forEach((wrap) => {
    const pop = wrap.querySelector(".gpop");
    let openEl = null;
    const hide = () => { pop.hidden = true; openEl = null; };
    const show = (el) => {
      pop.innerHTML = `<b>${esc(el.dataset.t)}</b><div class="muted">${esc(el.dataset.p)}</div>${el.dataset.d ? `<div>${esc(el.dataset.d)}</div>` : ""}`;
      pop.hidden = false; openEl = el;
      const w = wrap.getBoundingClientRect(), r = el.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
      let left = r.left - w.left + 14; left = Math.max(4, Math.min(left, w.width - pw - 4));
      let top = r.bottom - w.top + 4; if (top + ph > w.height + 30) top = Math.max(0, r.top - w.top - ph - 4);
      pop.style.left = left + "px"; pop.style.top = top + "px";
    };
    wrap.querySelectorAll(".glab").forEach((el) => {
      el.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") show(el); }, { signal });
      el.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse" && openEl === el) hide(); }, { signal });
      el.addEventListener("click", (e) => { e.stopPropagation(); if (openEl === el) hide(); else show(el); }, { signal });
      el.addEventListener("focus", () => { if (el.matches(":focus-visible")) show(el); }, { signal });
      el.addEventListener("blur", () => { if (openEl === el) hide(); }, { signal });
      el.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEl === el ? hide() : show(el); } }, { signal });
    });
    document.addEventListener("click", (e) => { if (!pop.hidden && !e.target.closest(".glab")) hide(); }, { signal });
  });
}

export function evidenceTable(ev) {
  return `<table class="tbl ev"><thead><tr><th></th><th>Measure</th><th>Value</th><th>Context</th></tr></thead><tbody>${ev.map((r) => `<tr><td>${dot(r.status)}</td><td>${esc(r.label)}</td><td><b>${esc(r.value)}</b></td><td class="muted">${esc(r.note)}</td></tr>`).join("")}</tbody></table>`;
}
