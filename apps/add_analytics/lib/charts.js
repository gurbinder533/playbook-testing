// SVG / HTML chart builders. All return strings; `esc` guards every data value.
import { esc } from "@corvic/live";
import { TIERS, TIER_BY_KEY, fmtDur, pctText, dayList } from "./calc.js";

export function funnelHtml(funnel) {
  const max = Math.max(1, funnel[0]?.n || 1);
  return funnel
    .map((f, i) => {
      const w = Math.max(2, (100 * f.n) / max);
      const prev = i ? funnel[i - 1].n : null;
      const step = prev ? `<span class="fn-step">${pctText(f.n, prev)} of previous</span>` : `<span class="fn-step">base for all %</span>`;
      return `<div class="fn-row"><div class="fn-label">${esc(f.label)}</div><div class="fn-track"><div class="fn-bar grow" style="width:${w}%;animation-delay:${i * 70}ms"></div></div><div class="fn-num">${f.n}<small>${pctText(f.n, funnel[0].n)}</small></div>${step}</div>`;
    })
    .join("");
}

export function tierBarHtml(counts, active) {
  const total = counts.reduce((a, c) => a + c.n, 0);
  if (!total) return `<p class="muted">No people in this range.</p>`;
  const segs = counts
    .filter((c) => c.n)
    .map(
      (c) =>
        `<button type="button" class="tb-seg grow-x${active === c.key ? " on" : ""}" data-tier="${esc(c.key)}" style="flex:${c.n};background:${c.color}" title="${esc(c.short)}: ${c.n}"><span>${c.n}</span></button>`,
    )
    .join("");
  const legend = counts
    .map(
      (c) =>
        `<button type="button" class="tb-leg${active === c.key ? " on" : ""}" data-tier="${esc(c.key)}"><i style="background:${c.color}"></i>${esc(c.short)} <b>${c.n}</b> <small>${pctText(c.n, total)}</small></button>`,
    )
    .join("");
  return `<div class="tb-bar">${segs}</div><div class="tb-legend">${legend}</div><p class="hint">Click a tier to filter the table below. Tiers are inferred judgments, not system labels.</p>`;
}

export function dailyHtml(days) {
  const W = 640, H = 220, L = 46, B = 46, T = 10;
  const max = Math.max(1, ...days.map((d) => d.ads + d.other));
  const bw = (W - L) / Math.max(1, days.length);
  const ph = H - B - T;
  let g = "";
  for (let i = 0; i <= 4; i += 1) {
    const v = Math.round((max * i) / 4);
    const y = T + ph - (ph * i) / 4;
    g += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" class="gl"/><text x="${L - 4}" y="${y + 3}" text-anchor="end" class="ax">${v}</text>`;
  }
  days.forEach((d, i) => {
    const x = L + i * bw + bw * 0.16;
    const w = bw * 0.68;
    const ho = (ph * d.other) / max;
    const ha = (ph * d.ads) / max;
    const yo = T + ph - ho;
    const ya = yo - ha;
    g += `<rect x="${x}" y="${yo}" width="${w}" height="${ho}" fill="#5b6b8c" class="grow-y"><title>${esc(d.day)}: ${d.other} other sources</title></rect>`;
    g += `<rect x="${x}" y="${ya}" width="${w}" height="${ha}" fill="#c2750a" class="grow-y"><title>${esc(d.day)}: ${d.ads} Google Ads</title></rect>`;
    const cx = x + w / 2;
    const lab = d.day.slice(5);
    if (days.length <= 16 || i % Math.ceil(days.length / 16) === 0) {
      g += `<text x="${cx}" y="${H - 28}" text-anchor="middle" class="ax">${esc(lab)}</text>`;
      g += `<text x="${cx}" y="${H - 14}" text-anchor="middle" class="ax eng">${d.engaged}</text>`;
    }
    if (d.ads + d.other) g += `<text x="${cx}" y="${ya - 3}" text-anchor="middle" class="ax tot">${d.ads + d.other}</text>`;
  });
  g += `<text x="${L - 6}" y="${H - 14}" text-anchor="end" class="ax eng axlab">engaged</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="svgchart" role="img" aria-label="Signups per day">${g}</svg><div class="tb-legend"><span class="tb-leg static"><i style="background:#c2750a"></i>Google Ads</span><span class="tb-leg static"><i style="background:#5b6b8c"></i>Other sources</span><span class="tb-leg static muted">Number under each day = engaged (used features beyond the tour)</span></div>`;
}

// Stacked bar chart: one bar per day (UTC), split into engaged / skimmed / bounced. `byDay` rows are { key: 'YYYY-MM-DD', n, cls: {bounced, skimmed, engaged} }.
// Days with no visits inside the range are drawn as empty slots so the x-axis shows every day.
export function visitsPerDayHtml(byDay, range, noun) {
  if (!byDay.length) return `<p class="muted">No visits in this date range.</p>`;
  const have = new Map(byDay.map((d) => [d.key, d]));
  const first = byDay[0].key > range.start ? byDay[0].key : range.start;
  let days = dayList(first, range.end);
  let cut = 0;
  if (days.length > 150) { cut = days.length - 150; days = days.slice(-150); }
  const rows = days.map((k) => have.get(k) || { key: k, n: 0, cls: { bounced: 0, skimmed: 0, engaged: 0 } });
  const max = Math.max(1, ...rows.map((d) => d.n));
  const L = 40, T = 14, ph = 150, gap = 26, ch = 56, B = 28, H = T + ph + gap + ch + B, bw = Math.max(16, Math.min(72, Math.floor(900 / rows.length)));
  const cy0 = T + ph + gap; // top of the CTA panel
  const W = L + rows.length * bw + 10;
  let g = "";
  for (let i = 0; i <= 4; i += 1) {
    const v = Math.round((max * i) / 4);
    const y = T + ph - (ph * i) / 4;
    g += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" class="gl"/><text x="${L - 4}" y="${y + 3}" text-anchor="end" class="ax">${v}</text>`;
  }
  // lower panel: visits that clicked a call-to-action button, on its own scale (the counts are far smaller than the visit counts)
  const cmax = Math.max(1, ...rows.map((d) => d.cta || 0));
  g += `<text x="${L}" y="${cy0 - 8}" class="ax" style="font-weight:600">CTA clicks per day</text>`;
  for (let i = 0; i <= 2; i += 1) {
    const v = Math.round((cmax * i) / 2);
    const y = cy0 + ch - (ch * i) / 2;
    g += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" class="gl"/><text x="${L - 4}" y="${y + 3}" text-anchor="end" class="ax">${v}</text>`;
  }
  const stepLab = Math.max(1, Math.ceil(rows.length / Math.floor((W - L) / 34)));
  rows.forEach((d, i) => {
    const x = L + i * bw + bw * 0.14;
    const w = bw * 0.72;
    let y = T + ph;
    [["engaged", "#1f7a4d", "engaged"], ["skimmed", "#c2750a", "skimmed"], ["bounced", "#b4442f", "bounced"]].forEach(([k, color, word]) => {
      const v = d.cls[k] || 0;
      if (!v) return;
      const h = (ph * v) / max;
      y -= h;
      g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" class="grow-y"><title>${esc(d.key)}: ${v} ${word} (${d.n} ${esc(noun)})</title></rect>`;
    });
    const cx = x + w / 2;
    if (d.n) g += `<text x="${cx}" y="${y - 3}" text-anchor="middle" class="ax tot">${d.n}</text>`;
    const c = d.cta || 0;
    if (c) {
      const chh = (ch * c) / cmax;
      g += `<rect x="${x}" y="${cy0 + ch - chh}" width="${w}" height="${chh}" fill="#1b6f8a" class="grow-y"><title>${esc(d.key)}: ${c} CTA click${c === 1 ? "" : "s"} (visits that clicked a call-to-action button)</title></rect>`;
      g += `<text x="${cx}" y="${cy0 + ch - chh - 3}" text-anchor="middle" class="ax tot">${c}</text>`;
    }
    if (i % stepLab === 0) g += `<text x="${cx}" y="${H - 10}" text-anchor="middle" class="ax">${esc(d.key.slice(5))}</text>`;
  });
  g += `<line x1="${L}" x2="${W}" y1="${T + ph}" y2="${T + ph}" class="gl"/><line x1="${L}" x2="${W}" y1="${cy0 + ch}" y2="${cy0 + ch}" class="gl"/>`;
  const note = cut ? `<p class="hint">Showing the latest 150 days; ${cut} earlier day${cut === 1 ? "" : "s"} in the range are left out of the chart (they are all in the table below).</p>` : "";
  return `<div class="scrollx"><svg viewBox="0 0 ${W} ${H}" style="width:${W}px;max-width:none;height:auto" class="svgchart" role="img" aria-label="${esc(noun)} per day">${g}</svg></div>` +
    `<div class="tb-legend"><span class="tb-leg static"><i style="background:#1f7a4d"></i>Engaged</span><span class="tb-leg static"><i style="background:#c2750a"></i>Skimmed</span><span class="tb-leg static"><i style="background:#b4442f"></i>Bounced</span><span class="tb-leg static"><i style="background:#1b6f8a"></i>CTA clicks (lower panel, own scale)</span><span class="tb-leg static muted">Number on top = ${esc(noun)} that day (UTC); CTA clicks are visits that clicked a call-to-action button</span></div>` + note;
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function timelineHtml(rows, range) {
  const W = 1240, L = 150, R = 14, laneH = 34, T = 8, B = 26;
  const H = T + TIERS.length * laneH + B;
  const t0 = Date.parse(`${range.start}T00:00:00Z`);
  const t1 = Date.parse(`${range.end}T00:00:00Z`) + 86400000;
  const x = (t) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  let g = "";
  TIERS.forEach((t, i) => {
    const y = T + i * laneH;
    g += `<rect x="${L}" y="${y}" width="${W - L - R}" height="${laneH - 2}" class="lane${i % 2 ? " alt" : ""}"/>`;
    g += `<text x="${L - 8}" y="${y + laneH / 2 + 3}" text-anchor="end" class="ax lanelab">${esc(t.short)}</text>`;
  });
  const nd = Math.round((t1 - t0) / 86400000);
  const stepD = Math.max(1, Math.ceil(nd / 14));
  for (let d = 0; d <= nd; d += stepD) {
    const xx = x(t0 + d * 86400000);
    g += `<line x1="${xx}" x2="${xx}" y1="${T}" y2="${H - B}" class="gl"/><text x="${xx}" y="${H - 8}" text-anchor="middle" class="ax">${new Date(t0 + d * 86400000).toISOString().slice(5, 10)}</text>`;
  }
  rows.forEach((r) => {
    const lane = TIER_BY_KEY[r.tier]?.order ?? TIERS.length - 1;
    const tm = Date.parse(r.created_at_utc);
    if (Number.isNaN(tm)) return;
    const jy = (hash(r.person_id) % (laneH - 12)) - (laneH - 12) / 2;
    const cy = T + lane * laneH + (laneH - 2) / 2 + jy;
    g += `<circle cx="${x(tm)}" cy="${cy}" r="5" fill="${TIER_BY_KEY[r.tier]?.color || "#999"}" class="dot" data-pid="${esc(r.person_id)}"><title>${esc(r.email || r.person_id)} — ${esc(r.tier)}</title></circle>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="svgchart wide" role="img" aria-label="Signup timeline">${g}</svg>`;
}

export function segmentTable(title, groups) {
  const body = groups
    .map(
      (g) =>
        `<tr><td>${esc(g.key)}</td><td class="num">${g.people}</td><td class="num">${g.used}<small>${pctText(g.used, g.people)}</small></td><td class="num">${g.output}</td><td class="num">${g.lost}<small>${pctText(g.lost, g.people)}</small></td><td class="num">${fmtDur(g.med)}</td></tr>`,
    )
    .join("");
  return `<h3>${esc(title)}</h3><table class="seg"><thead><tr><th></th><th class="num">People</th><th class="num">Used features</th><th class="num">Got an output</th><th class="num">Bounced / never in</th><th class="num">Median active</th></tr></thead><tbody>${body}</tbody></table>`;
}

export function adCompareHtml(c) {
  const col = (label, s, color) =>
    `<div class="cmp-col"><div class="cmp-h" style="border-color:${color}">${esc(label)} <b>${s.n}</b></div>` +
    `<dl><dt>Used features</dt><dd>${pctText(s.used, s.n)} <small>${s.used}</small></dd>` +
    `<dt>Got an output</dt><dd>${pctText(s.output, s.n)} <small>${s.output}</small></dd>` +
    `<dt>Bounced / never in</dt><dd>${pctText(s.lost, s.n)} <small>${s.lost}</small></dd>` +
    `<dt>Mobile or tablet</dt><dd>${pctText(s.mobile, s.n)} <small>${s.mobile}</small></dd>` +
    `<dt>Median active time</dt><dd>${fmtDur(s.med)}</dd></dl></div>`;
  return `<div class="cmp">${col("Google Ads click", c.ads, "#c2750a")}${col("Everything else", c.others, "#5b6b8c")}</div>`;
}

export function frictionHtml(items) {
  const max = Math.max(1, ...items.map((i) => i.n));
  return items
    .map(
      (i, k) =>
        `<div class="fr-row"><div class="fr-label">${esc(i.label)}</div><div class="fn-track"><div class="fn-bar fr grow" style="width:${Math.max(i.n ? 2 : 0, (100 * i.n) / max)}%;animation-delay:${k * 60}ms"></div></div><div class="fn-num">${i.n}<small>${pctText(i.n, i.of)} of ${i.of}</small></div></div>`,
    )
    .join("");
}

export function stageDots(stage) {
  let s = "";
  for (let i = 1; i <= 4; i += 1) s += `<i class="sd${i <= stage ? " on" : ""}"></i>`;
  return `<span class="stage" title="Furthest stage ${stage} of 4 (inferred)">${s}</span>`;
}
