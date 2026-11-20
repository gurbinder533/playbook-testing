import { esc } from "@corvic/live";
import { notMeasurableHtml } from "../lib/attr.js";
import { visitsPerDayHtml } from "../lib/charts.js";
import { pctText } from "../lib/calc.js";
import {
  VISITS_SQL, BROWSER_SQL, analyse, verdictHtml, kpiHtml, ladderHtml, dwellHtml, groupTable, compareHtml, ctaHtml, browserHtml,
} from "../lib/meta.js";

const DAY = 86400000;
const LAUNCH = "2026-10-27"; // first real Meta ad click recorded
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const today = () => iso(Date.now());
const PRESETS = [
  { id: "7d", label: "Last 7 days", start: () => iso(Date.now() - 6 * DAY) },
  { id: "3d", label: "Last 3 days", start: () => iso(Date.now() - 2 * DAY) },
  { id: "all", label: "Since launch", start: () => LAUNCH },
];
const S = { start: null, end: null };

export default async function render(ctx) {
  if (!S.end) { S.end = today(); S.start = PRESETS[0].start(); }
  ctx.content.innerHTML = shell();
  const el = (id) => ctx.content.querySelector(id);
  const on = (n, ev, fn) => n && n.addEventListener(ev, fn, { signal: ctx.signal });

  async function load() {
    el("#status").textContent = "Loading Meta ad visits…";
    try {
      const params = [S.start, S.end];
      const [m, g, b, sig, own] = await Promise.all([
        ctx.db.rows(VISITS_SQL, ["meta", ...params], ctx.signal),
        ctx.db.rows(VISITS_SQL, ["google", ...params], ctx.signal),
        ctx.db.rows(BROWSER_SQL, params, ctx.signal).catch(() => []),
        ctx.db.rows("SELECT signup_day AS d, count(*) AS n FROM roster WHERE NOT is_internal AND signup_day >= ? AND signup_day <= ? GROUP BY 1 ORDER BY 1 LIMIT 400", params, ctx.signal).catch(() => []),
        ctx.db.rows("SELECT count(*) AS n, count(*) FILTER (WHERE regexp_matches(lower(coalesce(initial_referring_domain,'') || ' ' || coalesce(initial_referrer,'')), 'facebook|instagram|meta')) AS fb FROM cohort WHERE signup_day >= ? AND signup_day <= ?", params, ctx.signal).catch(() => []),
      ]);
      if (ctx.signal.aborted) return;
      const A = analyse(m, g, b);
      paint(A, sig, own[0] || { n: 0, fb: 0 });
      el("#status").textContent = `${S.start} to ${S.end} (UTC). ${A.raw.toLocaleString()} Meta landings recorded, ${A.bots} link-preview crawler hits excluded.`;
    } catch (err) {
      if (ctx.signal.aborted) return;
      const msg = String(err?.message || err);
      if (/not_run|not found in FROM|does not exist/i.test(msg)) {
        el("#status").textContent = "The Meta ad data has not been produced yet — run the pipeline from the main page, then come back.";
      } else {
        ctx.reportError(err);
        el("#status").textContent = "Could not load data: " + msg.slice(0, 200);
      }
    }
  }

  function paint(A, sig, own) {
    ctx.content.querySelectorAll("[data-preset]").forEach((b) => {
      const p = PRESETS.find((x) => x.id === b.dataset.preset);
      b.classList.toggle("on", S.end === today() && S.start === p.start());
    });
    el("#d-start").value = S.start;
    el("#d-end").value = S.end;
    el("#kpis").innerHTML = kpiHtml(A);
    el("#verdict").innerHTML = verdictHtml(A);
    el("#ladder").innerHTML = A.M.n ? ladderHtml(A.M) : `<p class="muted">No visits.</p>`;
    el("#dwell").innerHTML = A.M.n ? dwellHtml(A) : "";
    el("#cmp").innerHTML = compareHtml(A.M, A.G);
    el("#cta").innerHTML = ctaHtml(A);
    el("#byad").innerHTML = groupTable("By ad creative", A.byAd, "Ad", 1);
    el("#bylanding").innerHTML = groupTable("By landing page", A.byLanding, "Landing page", 5);
    el("#bydevice").innerHTML = groupTable("By browser / device", A.byDevice, "Browser", 1);
    el("#browser").innerHTML = browserHtml(A.B);
    // per day: ad clicks next to signups to the product
    const sd = new Map(sig.map((r) => [r.d, r.n]));
    const body = A.byDay.map((d) => `<tr><td>${esc(d.key)}</td><td class="num">${d.n.toLocaleString()}</td><td class="num">${pctText(d.cls.bounced, d.n)}</td><td class="num">${pctText(d.cls.engaged, d.n)}<small>${d.cls.engaged}</small></td><td class="num">${d.cta}</td><td class="num">${sd.get(d.key) ?? 0}</td></tr>`).join("");
    el("#daychart").innerHTML = visitsPerDayHtml(A.byDay, S, "ad clicks");
    el("#byday").innerHTML = `<h3>By day</h3><table class="seg"><thead><tr><th>Day (UTC)</th><th class="num">Ad clicks</th><th class="num">Bounced</th><th class="num">Engaged</th><th class="num">CTA clicks</th><th class="num">All product signups</th></tr></thead><tbody>${body || `<tr><td colspan="6" class="muted">No data.</td></tr>`}</tbody></table>`;
    const tot = sig.reduce((a, r) => a + r.n, 0);
    el("#attr").innerHTML = notMeasurableHtml("Meta ad", tot);
  }

  ctx.content.querySelectorAll("[data-preset]").forEach((b) => on(b, "click", () => {
    const p = PRESETS.find((x) => x.id === b.dataset.preset);
    S.start = p.start(); S.end = today(); load();
  }));
  on(el("#d-start"), "change", (e) => { if (e.target.value && e.target.value <= S.end) { S.start = e.target.value; load(); } });
  on(el("#d-end"), "change", (e) => { if (e.target.value && e.target.value >= S.start) { S.end = e.target.value; load(); } });
  await load();
}

function shell() {
  return `
<div class="wrap">
  <nav class="topnav"><a href="home">Signup cohorts</a><a href="meta" aria-current="page">Meta ads</a><a href="ugc">UGC</a><a href="ai">AI chatbots</a></nav>
  <header class="top">
    <div>
      <div class="eyebrow">Marketing site (PostHog project "webflow") · utm_source = meta · all times UTC</div>
      <h1>Meta ads: are they engaged?</h1>
      <p class="lede">What people who clicked a Meta ad did on corvic.ai — how long they stayed, how far they scrolled, which buttons they pressed — and how many just bounced. Every figure is recomputed from the date range you pick. Bounced / skimmed / engaged are <span class="inferred">inferred</span> from the page-time and scroll signals.</p>
    </div>
  </header>
  <section class="controls card">
    <div class="ctl-row">
      <label>Start <input type="date" id="d-start"></label>
      <label>End <input type="date" id="d-end"></label>
      <div class="presets">${PRESETS.map((p) => `<button type="button" class="pbtn" data-preset="${p.id}">${p.label}</button>`).join("")}</div>
      <span class="tz">Timezone: UTC</span>
    </div>
    <div id="status" class="status muted sm" role="status" aria-live="polite"></div>
  </section>
  <section id="kpis" class="kpis"></section>
  <section class="card takeaways"><h2>The short answer</h2><div id="verdict"></div></section>
  <div class="grid2">
    <section class="card"><h2>How far they go <span class="inferred">inferred</span></h2><p class="hint">Share of all real ad clicks reaching each step. Steps are not strictly nested (a visitor can click without scrolling).</p><div id="ladder"></div></section>
    <section class="card"><h2>Time on the landing page</h2><p class="hint">Longest visible time reported for the visit.</p><div id="dwell"></div></section>
  </div>
  <div class="grid2">
    <section class="card"><h2>Meta versus Google Ads</h2><p class="hint">Same date range, same site, same definitions.</p><div id="cmp"></div></section>
    <section class="card"><h2>Buttons clicked</h2><p class="hint">Call-to-action clicks on the landing page, by button.</p><div id="cta"></div></section>
  </div>
  <section class="card"><div id="byad"></div></section>
  <div class="grid2">
    <section class="card"><div id="bylanding"></div></section>
    <section class="card"><div id="bydevice"></div></section>
  </div>
  <section class="card"><h2>Ad clicks per day</h2><p class="hint">Each bar is one day, split by how the visitors behaved.</p><div id="daychart"></div></section>
  <section class="card"><div id="byday"></div></section>
  <div class="grid2">
    <section class="card"><h2>Cookie-consenting visitors</h2><p class="hint">Only visitors who accepted cookies get full browser tracking, so this is a small, self-selected slice — read it as colour, not as the rate.</p><div id="browser"></div></section>
    <section class="card"><h2>Did ad clicks become signups?</h2><div id="attr"></div></section>
  </div>
  <footer class="card method">
    <h2>Method and limits</h2>
    <ul>
      <li><b>Source:</b> every landing from a link tagged <code>utm_source=meta</code> is logged on the marketing site as an ad visit, with a second record for time on page, scroll and pages seen, and a third for button clicks. One visit is one page load of an ad link, not necessarily one person.</li>
      <li><b>Removed:</b> Meta's link-preview crawler (<code>facebookexternalhit</code>) and the test placeholders (<code>{{ad.name}}</code>) from when the ad was being set up. Everything else counts, including people who may have re-clicked.</li>
      <li><b>Bounced</b> = no time-on-page signal at all, or under 5 seconds. A missing signal can also mean the in-app browser closed before it could send one, so the bounce rate is an upper bound. <b>Skimmed</b> = 5–30 seconds, nothing else. <b>Engaged</b> = 30 seconds or more, scrolled at least half the page, clicked a button or opened a second page.</li>
      <li>Scroll depth is only reported at the moment the visitor leaves, and is 0 for most mobile in-app visits, so scroll understates reading.</li>
      <li>Every ad that received a visit in the date range is listed, including ads with only a few visits, so read the percentages on small ads with care: they swing by many points. Landing pages with fewer than 5 visits are left out of the landing-page table.</li>
    </ul>
  </footer>
</div>`;
}
