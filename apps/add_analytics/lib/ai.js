// AI chatbot deep dive (ChatGPT, Gemini, Perplexity): queries, per-visit analysis, HTML builders. All values go through esc().
import { esc } from "@corvic/live";
import { pctText, fmtDur, fmtWhen } from "./calc.js";
import { metrics, classify, browserKind } from "./meta.js";

export const BOTS = [
  { id: "all", label: "All chatbots" },
  { id: "ChatGPT", label: "ChatGPT" },
  { id: "Gemini", label: "Gemini" },
  { id: "Perplexity", label: "Perplexity" },
];

export const VISITS_SQL =
  "WITH e AS (SELECT * FROM aichat WHERE kind = 'server'), " +
  "v AS (SELECT visit_id, " +
  "min(ts) FILTER (WHERE event = 'ad_visit') AS t0, " +
  "any_value(platform) AS platform, " +
  "any_value(path) FILTER (WHERE event = 'ad_visit') AS landing, " +
  "any_value(ua) FILTER (WHERE event = 'ad_visit') AS ua, " +
  "any_value(country) FILTER (WHERE event = 'ad_visit') AS country, " +
  "any_value(refdom) FILTER (WHERE event = 'ad_visit') AS refdom, " +
  "bool_or(tagged) AS tagged, " +
  "max(visible_ms) FILTER (WHERE event = 'ad_visit_engagement') AS vms, " +
  "max(scroll) FILTER (WHERE event = 'ad_visit_engagement') AS sc, " +
  "max(page_count) FILTER (WHERE event = 'ad_visit_engagement') AS pc, " +
  "count(*) FILTER (WHERE event = 'ad_visit_cta') AS ncta, " +
  "string_agg(DISTINCT cta, ',') FILTER (WHERE event = 'ad_visit_cta') AS ctas " +
  "FROM e GROUP BY visit_id) " +
  "SELECT * FROM v WHERE t0 IS NOT NULL AND left(t0, 10) >= ? AND left(t0, 10) <= ? ORDER BY t0 LIMIT 40000";

export const BROWSER_SQL =
  "SELECT session_id, platform, tagged, event, path, entry_path, device, country, max_content_pct, prev_duration, ts " +
  "FROM aichat WHERE kind = 'browser' AND day >= ? AND day <= ? LIMIT 20000";

const isBot = (v) => /bot\b|crawler|spider|headless|preview|slackbot|whatsapp|telegram|discord|linkedinbot|embedly|GPTBot|ChatGPT-User|PerplexityBot|OAI-SearchBot/i.test(v.ua || "");
const median = (a) => {
  const s = a.filter((x) => x != null && !Number.isNaN(x)).sort((x, y) => x - y);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function sessions(browserRows, bot) {
  const ses = new Map();
  (browserRows || []).filter((r) => bot === "all" || r.platform === bot).forEach((r) => {
    if (!ses.has(r.session_id)) ses.set(r.session_id, { id: r.session_id, platform: r.platform, tagged: false, t0: r.ts, pages: new Set(), clicks: 0, dead: 0, pricing: false, maxc: 0, dur: 0, device: r.device, country: r.country, entry: r.entry_path || r.path, n: 0 });
    const s = ses.get(r.session_id);
    s.n += 1;
    if (r.tagged) s.tagged = true;
    if (r.ts < s.t0) s.t0 = r.ts;
    if (r.event === "$pageview") s.pages.add(r.path);
    if (r.event === "$autocapture") s.clicks += 1;
    if (r.event === "$dead_click" || r.event === "$rageclick") s.dead += 1;
    if (/pricing/.test(r.path || "")) s.pricing = true;
    s.maxc = Math.max(s.maxc, r.max_content_pct || 0);
    s.dur = Math.max(s.dur, r.prev_duration || 0);
  });
  return [...ses.values()];
}

export function analyse(all, browserRows, bot) {
  const people = all.filter((v) => !isBot(v));
  const bots = all.length - people.length;
  const pick = bot === "all" ? people : people.filter((v) => v.platform === bot);
  const group = (list, keyf) => {
    const m = new Map();
    list.forEach((v) => { const k = keyf(v) || "(none)"; if (!m.has(k)) m.set(k, []); m.get(k).push(v); });
    return [...m.entries()].map(([key, l]) => ({ key, ...metrics(l) })).sort((a, b) => b.n - a.n);
  };
  const M = metrics(pick);
  const dwell = [
    ["No engagement signal", pick.filter((v) => v.vms == null).length],
    ["Under 5 s", pick.filter((v) => v.vms != null && v.vms < 5000).length],
    ["5–10 s", pick.filter((v) => v.vms >= 5000 && v.vms < 10000).length],
    ["10–30 s", pick.filter((v) => v.vms >= 10000 && v.vms < 30000).length],
    ["30–60 s", pick.filter((v) => v.vms >= 30000 && v.vms < 60000).length],
    ["60 s or more", pick.filter((v) => v.vms >= 60000).length],
  ];
  const ctas = new Map();
  pick.filter((v) => v.ctas).forEach((v) => String(v.ctas).split(",").forEach((c) => ctas.set(c, (ctas.get(c) || 0) + 1)));
  // browser-side sessions. Tagged ones overlap the server-side visits above, so "referrer only" keeps untagged sessions.
  const S = sessions(browserRows, bot);
  const refOnly = S.filter((s) => !s.tagged);
  const stat = (list) => ({
    n: list.length, multi: list.filter((s) => s.pages.size >= 2).length, clicked: list.filter((s) => s.clicks > 0).length,
    pricing: list.filter((s) => s.pricing).length, frustrated: list.filter((s) => s.dead > 0).length,
    read50: list.filter((s) => s.maxc >= 0.5).length, dur30: list.filter((s) => s.dur >= 30).length,
    medDur: median(list.map((s) => s.dur).filter((x) => x > 0)),
  });
  return {
    GP: metrics(people.filter((v) => v.platform !== "ChatGPT")), M, bots, raw: all.length, pick, tagged: pick.filter((v) => v.tagged).length, untaggedServer: pick.filter((v) => !v.tagged).length,
    byBot: group(people, (v) => v.platform), byLanding: group(pick, (v) => v.landing), byDevice: group(pick, (v) => browserKind(v.ua)),
    byCountry: group(pick, (v) => v.country),
    byDay: group(pick, (v) => String(v.t0).slice(0, 10)).sort((a, b) => (a.key > b.key ? 1 : -1)),
    dwell, ctas: [...ctas.entries()].sort((a, b) => b[1] - a[1]),
    B: stat(S), R: stat(refOnly), refOnly,
  };
}

const pc = pctText;
const sec = (x) => (x == null ? "—" : fmtDur(Math.round(x)));

export function kpiHtml(A) {
  const M = A.M;
  const t = (v, l, s, c) => `<div class="kpi"${c ? ` style="border-top-color:${c}"` : ""}><div class="kpi-v">${v}</div><div class="kpi-l">${esc(l)}</div><div class="kpi-s">${esc(s)}</div></div>`;
  return t(M.n.toLocaleString(), "Chatbot landings tracked", `${A.bots} crawler hits removed`, null) +
    t(M.cls.bounced.toLocaleString(), "Bounced", pc(M.cls.bounced, M.n) + " · under 5 s or no signal", "#b4442f") +
    t(M.cls.skimmed.toLocaleString(), "Skimmed", pc(M.cls.skimmed, M.n) + " · 5–30 s, no action", "#c2750a") +
    t(M.cls.engaged.toLocaleString(), "Engaged", pc(M.cls.engaged, M.n) + " · 30 s+, scroll, click or 2nd page", "#1f7a4d") +
    t(sec(M.med), "Median time on page", `among ${M.beat.toLocaleString()} visits with a signal`, null) +
    t(M.cta, "Clicked a CTA", pc(M.cta, M.n) + " of visits", "#1b6f8a");
}

export function verdictHtml(A, paid, label) {
  const M = A.M;
  const T = [];
  if (!M.n) T.push(`No tracked chatbot landings for ${esc(label)} in this date range. Tracked means the link carried a chatbot <code>utm_source</code>; visits with only a chatbot referrer are in the partial section below.`);
  else {
    T.push(`<b>${M.n.toLocaleString()}</b> tracked ${esc(label)} landings (${A.bots} crawler hits removed). <b>${pc(M.cls.bounced, M.n)}</b> bounced — no sign of life, or gone in under 5 seconds. <b>${pc(M.cls.skimmed, M.n)}</b> skimmed for 5–30 seconds. <b>${pc(M.cls.engaged, M.n)}</b> (${M.cls.engaged}) engaged: stayed 30 s+, scrolled half the page, clicked a button or opened a second page.`);
    T.push(`Of the ${M.beat.toLocaleString()} visits that registered any time on page, the median stay was <b>${sec(M.med)}</b>; ${pc(M.ge10, M.n)} of all visits reached 10 s, ${pc(M.ge30, M.n)} reached 30 s and ${pc(M.ge60, M.n)} reached a minute. <b>${M.cta}</b> (${pc(M.cta, M.n)}) clicked a call-to-action button and <b>${M.multi}</b> (${pc(M.multi, M.n)}) viewed a second page.`);
    if (paid && paid.n) T.push(`Against paid Meta ads in the same range (n=${paid.n.toLocaleString()}): ${pc(paid.cls.bounced, paid.n)} bounced, ${pc(paid.cls.engaged, paid.n)} engaged, ${pc(paid.cta, paid.n)} clicked a CTA, median stay ${sec(paid.med)}.`);
  }
  if (A.R.n) T.push(`Separately, <b>${A.R.n}</b> ${esc(label)} session${A.R.n === 1 ? "" : "s"} came with only a chatbot referrer (no tag) and accepted cookies: ${pc(A.R.multi, A.R.n)} opened a second page and ${pc(A.R.clicked, A.R.n)} clicked something. That is a partial view — see the last section.`);
  if (M.n && M.n < 100) T.push(`Small sample (${M.n} tracked landings): percentages swing by many points with this few visitors.`);
  return `<ul>${T.map((t) => `<li>${t}</li>`).join("")}</ul>`;
}

export function botCompareHtml(A, paid) {
  const by = Object.fromEntries(A.byBot.map((g) => [g.key, g]));
  const col = (label, s, color) =>
    s && s.n
      ? `<div class="cmp-col"><div class="cmp-h" style="border-color:${color}">${esc(label)} <b>${s.n.toLocaleString()}</b></div><dl>` +
        `<dt>Bounced</dt><dd>${pc(s.cls.bounced, s.n)} <small>${s.cls.bounced}</small></dd>` +
        `<dt>Skimmed (5–30 s)</dt><dd>${pc(s.cls.skimmed, s.n)} <small>${s.cls.skimmed}</small></dd>` +
        `<dt>Engaged</dt><dd>${pc(s.cls.engaged, s.n)} <small>${s.cls.engaged}</small></dd>` +
        `<dt>Clicked a CTA</dt><dd>${pc(s.cta, s.n)} <small>${s.cta}</small></dd>` +
        `<dt>Mobile or tablet</dt><dd>${pc(s.mobile, s.n)} <small>${s.mobile}</small></dd>` +
        `<dt>Median stay</dt><dd>${sec(s.med)}</dd></dl></div>`
      : `<div class="cmp-col"><div class="cmp-h" style="border-color:${color}">${esc(label)} <b>0</b></div><p class="muted">No tracked landings in this range.</p></div>`;
  return `<div class="cmp3">${col("ChatGPT", by.ChatGPT, "#1f7a4d")}${col("Gemini / Perplexity", A.GP, "#7a5b13")}${col("Paid Meta ads", paid, "#1b6f8a")}</div>`;
}

export function groupTable(title, groups, keyLabel, minN = 1) {
  const rows = groups.filter((g) => g.n >= minN);
  const body = rows.map((g) => `<tr><td>${esc(g.key)}</td><td class="num">${g.n.toLocaleString()}</td><td class="num">${pc(g.cls.bounced, g.n)}</td><td class="num">${pc(g.cls.engaged, g.n)}<small>${g.cls.engaged}</small></td><td class="num">${pc(g.ge10, g.n)}</td><td class="num">${pc(g.ge30, g.n)}</td><td class="num">${g.cta}</td><td class="num">${sec(g.med)}</td></tr>`).join("");
  const small = groups.length - rows.length;
  return `<h3>${esc(title)}</h3><table class="seg"><thead><tr><th>${esc(keyLabel)}</th><th class="num">Visits</th><th class="num">Bounced</th><th class="num">Engaged</th><th class="num">10 s+</th><th class="num">30 s+</th><th class="num">CTA clicks</th><th class="num">Median stay</th></tr></thead><tbody>${body || `<tr><td colspan="8" class="muted">No data.</td></tr>`}</tbody></table>${small ? `<p class="hint">${small} more group${small === 1 ? "" : "s"} with fewer than ${minN} visits not shown.</p>` : ""}`;
}

const BADGE = { engaged: ["Engaged", "#1f7a4d"], skimmed: ["Skimmed", "#c2750a"], bounced: ["Bounced", "#b4442f"] };
export function visitorTable(list, cap = 100) {
  const rows = [...list].sort((a, b) => (a.t0 < b.t0 ? 1 : -1)).slice(0, cap);
  if (!rows.length) return `<p class="muted">No visitors match.</p>`;
  const body = rows.map((v) => {
    const [bl, bc] = BADGE[classify(v)];
    return `<tr><td>${esc(fmtWhen(v.t0))}</td><td>${esc(v.platform)}</td><td>${esc(v.landing || "—")}</td><td>${esc(browserKind(v.ua))}</td><td>${esc(v.country || "—")}</td><td class="num">${v.vms == null ? "—" : sec(v.vms / 1000)}</td><td class="num">${v.sc == null ? "—" : Math.round(v.sc) + "%"}</td><td class="num">${v.pc ?? "—"}</td><td>${esc(v.ctas ? String(v.ctas).replace(/_/g, " ") : "—")}</td><td><span class="badge" style="background:${bc}">${bl}</span></td></tr>`;
  }).join("");
  return `<div class="tbl-wrap"><table class="seg people"><thead><tr><th>When (UTC)</th><th>Chatbot</th><th>Landing page</th><th>Browser</th><th>Country</th><th class="num">Time on page</th><th class="num">Scroll</th><th class="num">Pages</th><th>Button clicked</th><th>Result</th></tr></thead><tbody>${body}</tbody></table></div>` +
    (list.length > cap ? `<p class="hint">Showing the latest ${cap} of ${list.length.toLocaleString()} visitors.</p>` : "");
}

export function partialHtml(A) {
  const R = A.R;
  if (!R.n) return `<p class="muted">No referrer-only, cookie-consenting sessions in this range.</p>`;
  const row = (l, n) => `<dt>${esc(l)}</dt><dd>${pc(n, R.n)} <small>${n}</small></dd>`;
  const byBot = new Map();
  A.refOnly.forEach((s) => byBot.set(s.platform, (byBot.get(s.platform) || 0) + 1));
  const split = [...byBot.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${esc(k)} ${n}`).join(" · ");
  const top = new Map();
  A.refOnly.forEach((s) => top.set(s.entry || "(unknown)", (top.get(s.entry || "(unknown)") || 0) + 1));
  const landings = [...top.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([p, n]) => `<li>${esc(p)} <small class="muted">${n}</small></li>`).join("");
  return `<div class="cmp"><div class="cmp-col"><div class="cmp-h" style="border-color:#7a5b13">Sessions with a chatbot referrer and no tag <b>${R.n}</b></div><p class="hint">${split}</p><dl>` +
    row("Opened a 2nd page", R.multi) + row("Clicked something", R.clicked) + row("Looked at Pricing", R.pricing) + row("Hit a dead / rage click", R.frustrated) + row("Read half the page", R.read50) + row("Stayed 30 s+", R.dur30) +
    `<dt>Median stay (when recorded)</dt><dd>${sec(R.medDur)}</dd></dl></div>` +
    `<div class="cmp-col"><div class="cmp-h" style="border-color:#7a5b13">Where they landed</div><ul class="hint" style="padding-left:16px">${landings}</ul></div></div>`;
}
