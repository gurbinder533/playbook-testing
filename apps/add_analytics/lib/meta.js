// Meta ads deep dive: pure helpers (queries, per-visit analysis, HTML builders). All values go through esc().
import { esc } from "@corvic/live";
import { pctText, fmtDur } from "./calc.js";

export const VISITS_SQL =
  "WITH e AS (SELECT * FROM meta WHERE kind = 'server' AND source = ?), " +
  "v AS (SELECT visit_id, " +
  "min(ts) FILTER (WHERE event = 'ad_visit') AS t0, " +
  "any_value(path) FILTER (WHERE event = 'ad_visit') AS landing, " +
  "any_value(replace(replace(ad, '+', ' '), '%7C', '|')) FILTER (WHERE event = 'ad_visit') AS ad, " +
  "any_value(ua) FILTER (WHERE event = 'ad_visit') AS ua, " +
  "max(visible_ms) FILTER (WHERE event = 'ad_visit_engagement') AS vms, " +
  "max(scroll) FILTER (WHERE event = 'ad_visit_engagement') AS sc, " +
  "max(page_count) FILTER (WHERE event = 'ad_visit_engagement') AS pc, " +
  "count(*) FILTER (WHERE event = 'ad_visit_cta') AS ncta, " +
  "string_agg(DISTINCT cta, ',') FILTER (WHERE event = 'ad_visit_cta') AS ctas " +
  "FROM e GROUP BY visit_id) " +
  "SELECT * FROM v WHERE t0 IS NOT NULL AND left(t0, 10) >= ? AND left(t0, 10) <= ? ORDER BY t0 LIMIT 40000";

export const BROWSER_SQL =
  "SELECT session_id, distinct_id, event, path, entry_path, device, el_text, max_content_pct, prev_duration, ts " +
  "FROM meta WHERE kind = 'browser' AND day >= ? AND day <= ? LIMIT 20000";

const isBot = (v) => /facebookexternalhit|meta-externalagent|bot\b|crawler|headless|preview/i.test(v.ua || "") || /^\{\{/.test(v.ad || "");
export function browserKind(ua) {
  const u = ua || "";
  if (/Instagram/i.test(u)) return "Instagram in-app browser";
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(u)) return "Facebook in-app browser";
  if (/iPhone|iPad|Android|Mobile/i.test(u)) return "Mobile browser";
  return "Desktop";
}

const median = (a) => {
  const s = a.filter((x) => x != null && !Number.isNaN(x)).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// bounce = no heartbeat or under 5 s; engaged = 30 s+, scrolled half, clicked a CTA, or saw 2+ pages
export function classify(v) {
  const s = (v.vms ?? 0) / 1000;
  const engaged = s >= 30 || (v.sc ?? 0) >= 50 || (v.ncta ?? 0) > 0 || (v.pc ?? 0) >= 2;
  if (engaged) return "engaged";
  if (v.vms == null || s < 5) return "bounced";
  return "skimmed";
}

export function metrics(list) {
  const n = list.length;
  const c = (f) => list.filter(f).length;
  const beat = list.filter((v) => v.vms != null);
  const cls = { bounced: 0, skimmed: 0, engaged: 0 };
  list.forEach((v) => { cls[classify(v)] += 1; });
  return {
    n, noBeat: n - beat.length, beat: beat.length,
    ge5: c((v) => (v.vms ?? 0) >= 5000), ge10: c((v) => (v.vms ?? 0) >= 10000), ge30: c((v) => (v.vms ?? 0) >= 30000), ge60: c((v) => (v.vms ?? 0) >= 60000),
    scrolled: c((v) => (v.sc ?? 0) > 0), sc50: c((v) => (v.sc ?? 0) >= 50), cta: c((v) => (v.ncta ?? 0) > 0), multi: c((v) => (v.pc ?? 0) >= 2),
    med: median(beat.map((v) => v.vms / 1000)), cls,
    mobile: c((v) => browserKind(v.ua) !== "Desktop"),
  };
}

export function analyse(allMeta, allGoogle, browserRows) {
  const hMeta = allMeta.filter((v) => !isBot(v));
  const bots = allMeta.length - hMeta.length;
  const hG = allGoogle.filter((v) => !isBot(v));
  const group = (list, keyf) => {
    const m = new Map();
    list.forEach((v) => { const k = keyf(v) || "(none)"; if (!m.has(k)) m.set(k, []); m.get(k).push(v); });
    return [...m.entries()].map(([key, l]) => ({ key, ...metrics(l) })).sort((a, b) => b.n - a.n);
  };
  const M = metrics(hMeta);
  const dwell = [
    ["No engagement signal", hMeta.filter((v) => v.vms == null).length],
    ["Under 5 s", hMeta.filter((v) => v.vms != null && v.vms < 5000).length],
    ["5–10 s", hMeta.filter((v) => v.vms >= 5000 && v.vms < 10000).length],
    ["10–30 s", hMeta.filter((v) => v.vms >= 10000 && v.vms < 30000).length],
    ["30–60 s", hMeta.filter((v) => v.vms >= 30000 && v.vms < 60000).length],
    ["60 s or more", hMeta.filter((v) => v.vms >= 60000).length],
  ];
  const ctas = new Map();
  hMeta.filter((v) => v.ctas).forEach((v) => String(v.ctas).split(",").forEach((c) => ctas.set(c, (ctas.get(c) || 0) + 1)));
  // browser-side sessions (cookie-consenting visitors only)
  const ses = new Map();
  (browserRows || []).forEach((r) => {
    if (!ses.has(r.session_id)) ses.set(r.session_id, { id: r.session_id, pages: new Set(), clicks: 0, hero: 0, dead: 0, pricing: false, maxc: 0, dur: 0, n: 0 });
    const s = ses.get(r.session_id);
    s.n += 1;
    if (r.event === "$pageview") s.pages.add(r.path);
    if (r.event === "$autocapture") s.clicks += 1;
    if (String(r.event).startsWith("hero_")) s.hero += 1;
    if (r.event === "$dead_click" || r.event === "$rageclick") s.dead += 1;
    if (/pricing/.test(r.path || "")) s.pricing = true;
    s.maxc = Math.max(s.maxc, r.max_content_pct || 0);
    s.dur = Math.max(s.dur, r.prev_duration || 0);
  });
  const S = [...ses.values()];
  const B = {
    n: S.length, multi: S.filter((s) => s.pages.size >= 2).length, clicked: S.filter((s) => s.clicks > 0).length,
    hero: S.filter((s) => s.hero > 0).length, pricing: S.filter((s) => s.pricing).length, frustrated: S.filter((s) => s.dead > 0).length,
    read50: S.filter((s) => s.maxc >= 0.5).length, dur30: S.filter((s) => s.dur >= 30).length, medDur: median(S.map((s) => s.dur).filter((x) => x > 0)),
  };
  return {
    M, G: metrics(hG), bots, humans: hMeta.length, raw: allMeta.length,
    byAd: group(hMeta, (v) => v.ad), byLanding: group(hMeta, (v) => v.landing), byDevice: group(hMeta, (v) => browserKind(v.ua)),
    byDay: group(hMeta, (v) => String(v.t0).slice(0, 10)).sort((a, b) => (a.key > b.key ? 1 : -1)),
    dwell, ctas: [...ctas.entries()].sort((a, b) => b[1] - a[1]), B,
  };
}

const pc = pctText;
const sec = (x) => (x == null ? "—" : fmtDur(Math.round(x)));

export function verdictHtml(A) {
  const M = A.M;
  if (!M.n) return `<p class="muted">No Meta ad visits recorded in this date range.</p>`;
  const T = [];
  T.push(`<b>${M.n.toLocaleString()}</b> real ad clicks landed on the site (${A.bots} Meta link-preview crawler hits removed). <b>${pc(M.cls.bounced, M.n)}</b> bounced — no sign of life, or gone in under 5 seconds. <b>${pc(M.cls.skimmed, M.n)}</b> skimmed for 5–30 seconds. Only <b>${pc(M.cls.engaged, M.n)}</b> (${M.cls.engaged}) engaged: stayed 30 s+, scrolled half the page, clicked a button or opened a second page.`);
  T.push(`Of the ${M.beat.toLocaleString()} visits that registered any time on page, the median stay was <b>${sec(M.med)}</b>; ${pc(M.ge10, M.n)} of all visits reached 10 s, ${pc(M.ge30, M.n)} reached 30 s and ${pc(M.ge60, M.n)} reached a minute.`);
  T.push(`<b>${M.cta}</b> visits (${pc(M.cta, M.n)}) clicked a call-to-action button, and <b>${M.multi}</b> (${pc(M.multi, M.n)}) viewed a second page. That is how far almost everyone goes: they read the landing page and leave.`);
  const G = A.G;
  if (G.n) T.push(`For comparison, Google Ads visitors in the same range: ${pc(G.cls.bounced, G.n)} bounced, ${pc(G.cls.engaged, G.n)} engaged, ${pc(G.cta, G.n)} clicked a CTA (n=${G.n.toLocaleString()}).`);
  return `<ul>${T.map((t) => `<li>${t}</li>`).join("")}</ul>`;
}

export function kpiHtml(A) {
  const M = A.M;
  const t = (v, l, s, c) => `<div class="kpi"${c ? ` style="border-top-color:${c}"` : ""}><div class="kpi-v">${v}</div><div class="kpi-l">${esc(l)}</div><div class="kpi-s">${esc(s)}</div></div>`;
  return t(M.n.toLocaleString(), "Real ad clicks", `${A.bots} crawler hits removed`, null) +
    t(M.cls.bounced.toLocaleString(), "Bounced", pc(M.cls.bounced, M.n) + " · under 5 s or no signal", "#b4442f") +
    t(M.cls.skimmed.toLocaleString(), "Skimmed", pc(M.cls.skimmed, M.n) + " · 5–30 s, no action", "#c2750a") +
    t(M.cls.engaged.toLocaleString(), "Engaged", pc(M.cls.engaged, M.n) + " · 30 s+, scroll, click or 2nd page", "#1f7a4d") +
    t(sec(M.med), "Median time on page", `among ${M.beat.toLocaleString()} visits with a signal`, null) +
    t(M.cta, "Clicked a CTA", pc(M.cta, M.n) + " of visits", "#1b6f8a");
}

export function ladderHtml(M, firstLabel = "Landed from the ad") {
  const steps = [
    [firstLabel, M.n], ["Registered any time on page", M.beat], ["Stayed 10 s+", M.ge10], ["Stayed 30 s+", M.ge30],
    ["Stayed 60 s+", M.ge60], ["Scrolled at all", M.scrolled], ["Scrolled half the page", M.sc50], ["Opened a 2nd page", M.multi], ["Clicked a CTA", M.cta],
  ];
  const max = Math.max(1, M.n);
  return steps.map(([l, n], i) => `<div class="fn-row"><div class="fn-label">${esc(l)}</div><div class="fn-track"><div class="fn-bar grow" style="width:${Math.max(n ? 2 : 0, (100 * n) / max)}%;animation-delay:${i * 60}ms"></div></div><div class="fn-num">${n.toLocaleString()}<small>${pc(n, M.n)}</small></div></div>`).join("");
}

export function dwellHtml(A) {
  const max = Math.max(1, ...A.dwell.map((d) => d[1]));
  const colors = ["#b4442f", "#b4442f", "#c2750a", "#c2750a", "#1f7a4d", "#1f7a4d"];
  return A.dwell.map(([l, n], i) => `<div class="fn-row"><div class="fn-label">${esc(l)}</div><div class="fn-track"><div class="fn-bar grow" style="width:${Math.max(n ? 2 : 0, (100 * n) / max)}%;background:${colors[i]}"></div></div><div class="fn-num">${n.toLocaleString()}<small>${pc(n, A.M.n)}</small></div></div>`).join("");
}

export function groupTable(title, groups, keyLabel, minN = 1) {
  const rows = groups.filter((g) => g.n >= minN);
  const body = rows.map((g) => `<tr><td>${esc(g.key)}</td><td class="num">${g.n.toLocaleString()}</td><td class="num">${pc(g.cls.bounced, g.n)}</td><td class="num">${pc(g.cls.engaged, g.n)}<small>${g.cls.engaged}</small></td><td class="num">${pc(g.ge10, g.n)}</td><td class="num">${pc(g.ge30, g.n)}</td><td class="num">${g.cta}</td><td class="num">${sec(g.med)}</td></tr>`).join("");
  const small = groups.length - rows.length;
  return `<h3>${esc(title)}</h3><table class="seg"><thead><tr><th>${esc(keyLabel)}</th><th class="num">Visits</th><th class="num">Bounced</th><th class="num">Engaged</th><th class="num">10 s+</th><th class="num">30 s+</th><th class="num">CTA clicks</th><th class="num">Median stay</th></tr></thead><tbody>${body || `<tr><td colspan="8" class="muted">No data.</td></tr>`}</tbody></table>${small ? `<p class="hint">${small} more group${small === 1 ? "" : "s"} with fewer than ${minN} visits not shown.</p>` : ""}`;
}

export function compareHtml(M, G) {
  const col = (label, s, color) =>
    `<div class="cmp-col"><div class="cmp-h" style="border-color:${color}">${esc(label)} <b>${s.n.toLocaleString()}</b></div><dl>` +
    `<dt>Bounced</dt><dd>${pc(s.cls.bounced, s.n)} <small>${s.cls.bounced}</small></dd>` +
    `<dt>Skimmed (5–30 s)</dt><dd>${pc(s.cls.skimmed, s.n)} <small>${s.cls.skimmed}</small></dd>` +
    `<dt>Engaged</dt><dd>${pc(s.cls.engaged, s.n)} <small>${s.cls.engaged}</small></dd>` +
    `<dt>Clicked a CTA</dt><dd>${pc(s.cta, s.n)} <small>${s.cta}</small></dd>` +
    `<dt>Mobile or tablet</dt><dd>${pc(s.mobile, s.n)} <small>${s.mobile}</small></dd>` +
    `<dt>Median stay</dt><dd>${sec(s.med)}</dd></dl></div>`;
  return `<div class="cmp">${col("Meta ads", M, "#1b6f8a")}${col("Google Ads", G, "#c2750a")}</div>`;
}

export function ctaHtml(A) {
  if (!A.ctas.length) return `<p class="muted">No button clicks recorded.</p>`;
  const max = Math.max(1, A.ctas[0][1]);
  return A.ctas.map(([c, n]) => `<div class="fr-row"><div class="fr-label">${esc(c.replace(/_/g, " "))}</div><div class="fn-track"><div class="fn-bar fr grow" style="width:${(100 * n) / max}%"></div></div><div class="fn-num">${n}<small>${pc(n, A.M.n)} of visits</small></div></div>`).join("");
}

export function browserHtml(B) {
  if (!B.n) return `<p class="muted">No cookie-consenting Meta sessions in this range.</p>`;
  const row = (l, n) => `<dt>${esc(l)}</dt><dd>${pc(n, B.n)} <small>${n}</small></dd>`;
  return `<div class="cmp"><div class="cmp-col"><div class="cmp-h" style="border-color:#1b6f8a">Sessions with full browser tracking <b>${B.n}</b></div><dl>` +
    row("Opened a 2nd page", B.multi) + row("Clicked something", B.clicked) + row("Looked at Pricing", B.pricing) + row("Tried the hero prompt", B.hero) + row("Hit a dead / rage click", B.frustrated) + row("Read half the page", B.read50) + row("Stayed 30 s+", B.dur30) +
    `<dt>Median stay (when recorded)</dt><dd>${sec(B.medDur)}</dd></dl></div></div>`;
}
