import { esc } from "@corvic/live";
import { notMeasurableHtml } from "../lib/attr.js";
import { visitsPerDayHtml } from "../lib/charts.js";
import { pctText } from "../lib/calc.js";
import { VISITS_SQL as META_SQL, ladderHtml, dwellHtml, ctaHtml, browserHtml, metrics } from "../lib/meta.js";
import { VISITS_SQL, BROWSER_SQL, PLATFORMS, analyse, prep, kpiHtml, verdictHtml, platformCompareHtml, groupTable, visitorTable } from "../lib/ugc.js";

const DAY = 86400000;
const FIRST = "2026-09-01"; // the pull starts here; first UGC landing is later
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const today = () => iso(Date.now());
const PRESETS = [
  { id: "7d", label: "Last 7 days", start: () => iso(Date.now() - 6 * DAY) },
  { id: "30d", label: "Last 30 days", start: () => iso(Date.now() - 29 * DAY) },
  { id: "all", label: "Since first UGC visit", start: () => FIRST },
];
const S = { start: null, end: null, platform: "all", result: "all" };

export default async function render(ctx) {
  if (!S.end) { S.end = today(); S.start = PRESETS[1].start(); }
  ctx.content.innerHTML = shell();
  const el = (id) => ctx.content.querySelector(id);
  const on = (n, ev, fn) => n && n.addEventListener(ev, fn, { signal: ctx.signal });
  let DATA = null;

  async function load() {
    el("#status").textContent = "Loading UGC visits…";
    try {
      const params = [S.start, S.end];
      const [v, paidRaw, b, sig, own] = await Promise.all([
        ctx.db.rows(VISITS_SQL, params, ctx.signal),
        ctx.db.rows(META_SQL, ["meta", ...params], ctx.signal).catch(() => []),
        ctx.db.rows(BROWSER_SQL, params, ctx.signal).catch(() => []),
        ctx.db.rows("SELECT signup_day AS d, count(*) AS n FROM roster WHERE NOT is_internal AND signup_day >= ? AND signup_day <= ? GROUP BY 1 ORDER BY 1 LIMIT 400", params, ctx.signal).catch(() => []),
        ctx.db.rows("SELECT count(*) AS n, count(*) FILTER (WHERE regexp_matches(lower(coalesce(initial_referring_domain,'') || ' ' || coalesce(initial_referrer,'')), 'instagram|youtube|youtu\\.be')) AS ugc FROM cohort WHERE signup_day >= ? AND signup_day <= ?", params, ctx.signal).catch(() => []),
      ]);
      if (ctx.signal.aborted) return;
      DATA = { v, paidRaw, b, sig, own: own[0] || { n: 0, ugc: 0 } };
      paint();
    } catch (err) {
      if (ctx.signal.aborted) return;
      const msg = String(err?.message || err);
      if (/not_run|not found in FROM|does not exist/i.test(msg)) {
        el("#status").textContent = "The UGC data has not been produced yet — run the pipeline from the main page, then come back.";
      } else {
        ctx.reportError(err);
        el("#status").textContent = "Could not load data: " + msg.slice(0, 200);
      }
    }
  }

  function paint() {
    if (!DATA) return;
    const A = analyse(DATA.v, DATA.b, S.platform);
    const paidHuman = DATA.paidRaw.filter((x) => !/facebookexternalhit|meta-externalagent|bot\b|crawler|headless|preview/i.test(x.ua || "") && !/^\{\{/.test(x.ad || ""));
    const paid = metrics(paidHuman);
    const label = PLATFORMS.find((p) => p.id === S.platform).label;
    ctx.content.querySelectorAll("[data-preset]").forEach((b) => {
      const p = PRESETS.find((x) => x.id === b.dataset.preset);
      b.classList.toggle("on", S.end === today() && S.start === p.start());
    });
    ctx.content.querySelectorAll("[data-plat]").forEach((b) => b.classList.toggle("on", b.dataset.plat === S.platform));
    ctx.content.querySelectorAll("[data-res]").forEach((b) => b.classList.toggle("on", b.dataset.res === S.result));
    el("#d-start").value = S.start;
    el("#d-end").value = S.end;
    el("#status").textContent = `${S.start} to ${S.end} (UTC). ${A.raw.toLocaleString()} UGC landings recorded, ${A.bots} link-preview crawler hits excluded. Showing: ${label}.`;
    el("#kpis").innerHTML = kpiHtml(A);
    el("#verdict").innerHTML = verdictHtml(A, paid, label);
    el("#ladder").innerHTML = A.M.n ? ladderHtml(A.M, "Landed from a shared link") : `<p class="muted">No visits.</p>`;
    el("#dwell").innerHTML = A.M.n ? dwellHtml(A) : `<p class="muted">No visits.</p>`;
    el("#cmp").innerHTML = platformCompareHtml(A, paid);
    el("#cta").innerHTML = ctaHtml(A);
    el("#bytag").innerHTML = groupTable("By link tag (source / medium)", A.byTag, "Source / medium", 1);
    el("#bycontent").innerHTML = groupTable("By content tag (utm_content)", A.byContent, "Content tag", 3);
    el("#bycampaign").innerHTML = groupTable("By campaign", A.byCampaign, "Campaign", 3);
    el("#bylanding").innerHTML = groupTable("By landing page", A.byLanding, "Landing page", 3);
    el("#bydevice").innerHTML = groupTable("By browser / device", A.byDevice, "Browser", 1);
    el("#bycountry").innerHTML = groupTable("By country", A.byCountry, "Country", 3);
    const sd = new Map(DATA.sig.map((r) => [r.d, r.n]));
    const body = A.byDay.map((d) => `<tr><td>${esc(d.key)}</td><td class="num">${d.n.toLocaleString()}</td><td class="num">${pctText(d.cls.bounced, d.n)}</td><td class="num">${pctText(d.cls.engaged, d.n)}<small>${d.cls.engaged}</small></td><td class="num">${d.cta}</td><td class="num">${sd.get(d.key) ?? 0}</td></tr>`).join("");
    el("#daychart").innerHTML = visitsPerDayHtml(A.byDay, S, "UGC visitors");
    el("#byday").innerHTML = `<h3>By day</h3><table class="seg"><thead><tr><th>Day (UTC)</th><th class="num">UGC visitors</th><th class="num">Bounced</th><th class="num">Engaged</th><th class="num">CTA clicks</th><th class="num">All product signups</th></tr></thead><tbody>${body || `<tr><td colspan="6" class="muted">No data.</td></tr>`}</tbody></table>`;
    el("#browser").innerHTML = browserHtml(A.B);
    const tot = DATA.sig.reduce((a, r) => a + r.n, 0);
    el("#attr").innerHTML = notMeasurableHtml("Instagram and YouTube", tot);
    const filtered = A.pick.filter((v) => S.result === "all" || visitClass(v) === S.result);
    el("#visitors").innerHTML = visitorTable(filtered);
    el("#v-count").textContent = `${filtered.length.toLocaleString()} visitor${filtered.length === 1 ? "" : "s"}`;
  }

  ctx.content.querySelectorAll("[data-preset]").forEach((b) => on(b, "click", () => {
    const p = PRESETS.find((x) => x.id === b.dataset.preset);
    S.start = p.start(); S.end = today(); load();
  }));
  ctx.content.querySelectorAll("[data-plat]").forEach((b) => on(b, "click", () => { S.platform = b.dataset.plat; paint(); }));
  ctx.content.querySelectorAll("[data-res]").forEach((b) => on(b, "click", () => { S.result = b.dataset.res; paint(); }));
  on(el("#d-start"), "change", (e) => { if (e.target.value && e.target.value <= S.end) { S.start = e.target.value; load(); } });
  on(el("#d-end"), "change", (e) => { if (e.target.value && e.target.value >= S.start) { S.end = e.target.value; load(); } });
  await load();
}

import { classify } from "../lib/meta.js";
const visitClass = (v) => classify(v);

function shell() {
  return `
<div class="wrap">
  <nav class="topnav"><a href="home">Signup cohorts</a><a href="meta">Meta ads</a><a href="ugc" aria-current="page">UGC</a><a href="ai">AI chatbots</a></nav>
  <header class="top">
    <div>
      <div class="eyebrow">Marketing site (PostHog project "webflow") · Instagram and YouTube links with no paid tag · all times UTC</div>
      <h1>UGC: do shared-link visitors engage?</h1>
      <p class="lede">What people who arrived through a user-generated-content link (Instagram or YouTube, not a paid ad) did on corvic.ai — how long they stayed, how far they scrolled, which buttons they pressed — and how many just bounced. A visitor counts as UGC when <code>utm_source</code> is <code>ig</code>, <code>instagram</code> or <code>youtube</code> and <code>utm_medium</code> carries no paid tag. Bounced / skimmed / engaged are <span class="inferred">inferred</span> from the page-time and scroll signals.</p>
    </div>
  </header>
  <section class="controls card">
    <div class="ctl-row">
      <label>Start <input type="date" id="d-start"></label>
      <label>End <input type="date" id="d-end"></label>
      <div class="presets">${PRESETS.map((p) => `<button type="button" class="pbtn" data-preset="${p.id}">${p.label}</button>`).join("")}</div>
      <div class="presets">${PLATFORMS.map((p) => `<button type="button" class="pbtn" data-plat="${p.id}">${p.label}</button>`).join("")}</div>
      <span class="tz">Timezone: UTC</span>
    </div>
    <div id="status" class="status muted sm" role="status" aria-live="polite"></div>
  </section>
  <section id="kpis" class="kpis"></section>
  <section class="card takeaways"><h2>The short answer</h2><div id="verdict"></div></section>
  <div class="grid2">
    <section class="card"><h2>How far they go <span class="inferred">inferred</span></h2><p class="hint">Share of all UGC visitors reaching each step. Steps are not strictly nested (a visitor can click without scrolling).</p><div id="ladder"></div></section>
    <section class="card"><h2>Time on the landing page</h2><p class="hint">Longest visible time reported for the visit.</p><div id="dwell"></div></section>
  </div>
  <section class="card"><h2>Instagram, YouTube and paid Meta side by side</h2><p class="hint">Same date range, same site, same definitions. Not affected by the platform filter.</p><div id="cmp"></div></section>
  <div class="grid2">
    <section class="card"><h2>Buttons clicked</h2><p class="hint">Call-to-action clicks on the landing page, by button.</p><div id="cta"></div></section>
    <section class="card"><div id="bytag"></div></section>
  </div>
  <section class="card"><div id="bycontent"></div></section>
  <section class="card"><div id="bycampaign"></div></section>
  <div class="grid2">
    <section class="card"><div id="bylanding"></div></section>
    <section class="card"><div id="bydevice"></div></section>
  </div>
  <section class="card"><h2>UGC visitors per day</h2><p class="hint">Each bar is one day, split by how the visitors behaved.</p><div id="daychart"></div></section>
  <div class="grid2">
    <section class="card"><div id="bycountry"></div></section>
    <section class="card"><div id="byday"></div></section>
  </div>
  <section class="card">
    <h2>Every visitor <span id="v-count" class="muted sm"></span></h2>
    <p class="hint">Filter by result. One row is one landing, not necessarily one person.</p>
    <div class="filters">${[["all", "All"], ["engaged", "Engaged"], ["skimmed", "Skimmed"], ["bounced", "Bounced"]].map(([id, l]) => `<button type="button" class="tbtn" data-res="${id}">${l}</button>`).join("")}</div>
    <div id="visitors"></div>
  </section>
  <div class="grid2">
    <section class="card"><h2>Cookie-consenting visitors</h2><p class="hint">Only visitors who accepted cookies get full browser tracking, so this is a small, self-selected slice — read it as colour, not as the rate.</p><div id="browser"></div></section>
    <section class="card"><h2>Did UGC clicks become signups?</h2><div id="attr"></div></section>
  </div>
  <footer class="card method">
    <h2>Method and limits</h2>
    <ul>
      <li><b>Who counts as UGC:</b> a landing on the marketing site whose link carries <code>utm_source</code> of <code>ig</code>, <code>instagram</code> or <code>youtube</code>, and whose <code>utm_medium</code> is not a paid tag (<code>paid</code>, <code>cpc</code>, <code>paid-social</code>, or a Meta placement name such as Instagram_Feed). Reddit, chatgpt.com, newsletters and referral sites are not included.</li>
      <li><b>Removed:</b> link-preview crawlers and bots (for example <code>facebookexternalhit</code>, Slack and WhatsApp previews). Everything else counts, including people who may have re-clicked.</li>
      <li><b>Bounced</b> = no time-on-page signal at all, or under 5 seconds. A missing signal can also mean an in-app browser closed before it could send one, so the bounce rate is an upper bound. <b>Skimmed</b> = 5–30 seconds, nothing else. <b>Engaged</b> = 30 seconds or more, scrolled at least half the page, clicked a button or opened a second page.</li>
      <li>Scroll depth is only reported when the visitor leaves, and is 0 for most mobile in-app visits, so scroll understates reading.</li>
      <li>Groups with fewer than 3 visits are left out of the content, campaign, landing-page and country tables; percentages on small groups swing by many points.</li>
    </ul>
  </footer>
</div>`;
}
