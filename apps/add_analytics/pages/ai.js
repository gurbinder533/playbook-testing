import { esc } from "@corvic/live";
import { notMeasurableHtml } from "../lib/attr.js";
import { visitsPerDayHtml } from "../lib/charts.js";
import { pctText } from "../lib/calc.js";
import { VISITS_SQL as META_SQL, ladderHtml, dwellHtml, ctaHtml, metrics, classify } from "../lib/meta.js";
import { VISITS_SQL, BROWSER_SQL, BOTS, analyse, kpiHtml, verdictHtml, botCompareHtml, groupTable, visitorTable, partialHtml } from "../lib/ai.js";

const DAY = 86400000;
const FIRST = "2025-01-01";
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const today = () => iso(Date.now());
const PRESETS = [
  { id: "30d", label: "Last 30 days", start: () => iso(Date.now() - 29 * DAY) },
  { id: "90d", label: "Last 90 days", start: () => iso(Date.now() - 89 * DAY) },
  { id: "all", label: "Since tracking began", start: () => FIRST },
];
const S = { start: null, end: null, bot: "all", result: "all" };

export default async function render(ctx) {
  if (!S.end) { S.end = today(); S.start = PRESETS[1].start(); }
  ctx.content.innerHTML = shell();
  const el = (id) => ctx.content.querySelector(id);
  const on = (n, ev, fn) => n && n.addEventListener(ev, fn, { signal: ctx.signal });
  let DATA = null;

  async function load() {
    el("#status").textContent = "Loading AI chatbot visits…";
    try {
      const params = [S.start, S.end];
      const [v, paidRaw, b, sig, own] = await Promise.all([
        ctx.db.rows(VISITS_SQL, params, ctx.signal),
        ctx.db.rows(META_SQL, ["meta", ...params], ctx.signal).catch(() => []),
        ctx.db.rows(BROWSER_SQL, params, ctx.signal).catch(() => []),
        ctx.db.rows("SELECT signup_day AS d, count(*) AS n FROM roster WHERE NOT is_internal AND signup_day >= ? AND signup_day <= ? GROUP BY 1 ORDER BY 1 LIMIT 800", params, ctx.signal).catch(() => []),
        ctx.db.rows("SELECT count(*) AS n, count(*) FILTER (WHERE regexp_matches(lower(coalesce(initial_referring_domain,'') || ' ' || coalesce(initial_referrer,'')), 'chatgpt|openai|gemini|perplexity')) AS ai FROM cohort WHERE signup_day >= ? AND signup_day <= ?", params, ctx.signal).catch(() => []),
      ]);
      if (ctx.signal.aborted) return;
      DATA = { v, paidRaw, b, sig, own: own[0] || { n: 0, ai: 0 } };
      paint();
    } catch (err) {
      if (ctx.signal.aborted) return;
      const msg = String(err?.message || err);
      if (/not_run|not found in FROM|does not exist/i.test(msg)) {
        el("#status").textContent = "The AI chatbot data has not been produced yet — run the pipeline from the main page, then come back.";
      } else {
        ctx.reportError(err);
        el("#status").textContent = "Could not load data: " + msg.slice(0, 200);
      }
    }
  }

  function paint() {
    if (!DATA) return;
    const A = analyse(DATA.v, DATA.b, S.bot);
    const paidHuman = DATA.paidRaw.filter((x) => !/facebookexternalhit|meta-externalagent|bot\b|crawler|headless|preview/i.test(x.ua || "") && !/^\{\{/.test(x.ad || ""));
    const paid = metrics(paidHuman);
    const label = BOTS.find((p) => p.id === S.bot).label.toLowerCase().replace("all chatbots", "AI chatbot");
    ctx.content.querySelectorAll("[data-preset]").forEach((b) => {
      const p = PRESETS.find((x) => x.id === b.dataset.preset);
      b.classList.toggle("on", S.end === today() && S.start === p.start());
    });
    ctx.content.querySelectorAll("[data-bot]").forEach((b) => b.classList.toggle("on", b.dataset.bot === S.bot));
    ctx.content.querySelectorAll("[data-res]").forEach((b) => b.classList.toggle("on", b.dataset.res === S.result));
    el("#d-start").value = S.start;
    el("#d-end").value = S.end;
    el("#status").textContent = `${S.start} to ${S.end} (UTC). ${A.raw.toLocaleString()} tracked chatbot landings recorded (${A.tagged} tagged), ${A.bots} crawler hits excluded. Showing: ${BOTS.find((p) => p.id === S.bot).label}.`;
    el("#kpis").innerHTML = kpiHtml(A);
    el("#verdict").innerHTML = verdictHtml(A, paid, label);
    el("#ladder").innerHTML = A.M.n ? ladderHtml(A.M, "Landed from a chatbot link") : `<p class="muted">No visits.</p>`;
    el("#dwell").innerHTML = A.M.n ? dwellHtml(A) : `<p class="muted">No visits.</p>`;
    el("#cmp").innerHTML = botCompareHtml(A, paid);
    el("#cta").innerHTML = ctaHtml(A);
    el("#bybot").innerHTML = groupTable("By chatbot", A.byBot, "Chatbot", 1);
    el("#bylanding").innerHTML = groupTable("By landing page", A.byLanding, "Landing page", 2);
    el("#bydevice").innerHTML = groupTable("By browser / device", A.byDevice, "Browser", 1);
    el("#bycountry").innerHTML = groupTable("By country", A.byCountry, "Country", 2);
    const sd = new Map(DATA.sig.map((r) => [r.d, r.n]));
    const body = A.byDay.map((d) => `<tr><td>${esc(d.key)}</td><td class="num">${d.n.toLocaleString()}</td><td class="num">${pctText(d.cls.bounced, d.n)}</td><td class="num">${pctText(d.cls.engaged, d.n)}<small>${d.cls.engaged}</small></td><td class="num">${d.cta}</td><td class="num">${sd.get(d.key) ?? 0}</td></tr>`).join("");
    el("#daychart").innerHTML = visitsPerDayHtml(A.byDay, S, "tracked landings");
    el("#byday").innerHTML = `<h3>By day</h3><div class="tbl-wrap"><table class="seg"><thead><tr><th>Day (UTC)</th><th class="num">Tracked landings</th><th class="num">Bounced</th><th class="num">Engaged</th><th class="num">CTA clicks</th><th class="num">All product signups</th></tr></thead><tbody>${body || `<tr><td colspan="6" class="muted">No data.</td></tr>`}</tbody></table></div>`;
    el("#partial").innerHTML = partialHtml(A);
    const tot = DATA.sig.reduce((a, r) => a + r.n, 0);
    el("#attr").innerHTML = notMeasurableHtml("AI chatbot", tot);
    const filtered = A.pick.filter((v) => S.result === "all" || classify(v) === S.result);
    el("#visitors").innerHTML = visitorTable(filtered);
    el("#v-count").textContent = `${filtered.length.toLocaleString()} visitor${filtered.length === 1 ? "" : "s"}`;
  }

  ctx.content.querySelectorAll("[data-preset]").forEach((b) => on(b, "click", () => {
    const p = PRESETS.find((x) => x.id === b.dataset.preset);
    S.start = p.start(); S.end = today(); load();
  }));
  ctx.content.querySelectorAll("[data-bot]").forEach((b) => on(b, "click", () => { S.bot = b.dataset.bot; paint(); }));
  ctx.content.querySelectorAll("[data-res]").forEach((b) => on(b, "click", () => { S.result = b.dataset.res; paint(); }));
  on(el("#d-start"), "change", (e) => { if (e.target.value && e.target.value <= S.end) { S.start = e.target.value; load(); } });
  on(el("#d-end"), "change", (e) => { if (e.target.value && e.target.value >= S.start) { S.end = e.target.value; load(); } });
  await load();
}

function shell() {
  return `
<div class="wrap">
  <nav class="topnav"><a href="home">Signup cohorts</a><a href="meta">Meta ads</a><a href="ugc">UGC</a><a href="ai" aria-current="page">AI chatbots</a></nav>
  <header class="top">
    <div>
      <div class="eyebrow">Marketing site (PostHog project "webflow") · ChatGPT, Gemini and Perplexity links · all times UTC</div>
      <h1>AI chatbots: do visitors from answers engage?</h1>
      <p class="lede">What people who clicked a link inside a ChatGPT, Gemini or Perplexity answer did on corvic.ai — how long they stayed, how far they scrolled, which buttons they pressed. A visitor counts when the link carries a chatbot <code>utm_source</code> or the referring site is a chatbot. Only tagged links (in practice ChatGPT’s) get full time-on-page and button tracking; the rest appear in the partial section. Bounced / skimmed / engaged are <span class="inferred">inferred</span> from the page-time and scroll signals.</p>
    </div>
  </header>
  <section class="controls card">
    <div class="ctl-row">
      <label>Start <input type="date" id="d-start"></label>
      <label>End <input type="date" id="d-end"></label>
      <div class="presets">${PRESETS.map((p) => `<button type="button" class="pbtn" data-preset="${p.id}">${p.label}</button>`).join("")}</div>
      <div class="presets">${BOTS.map((p) => `<button type="button" class="pbtn" data-bot="${p.id}">${p.label}</button>`).join("")}</div>
      <span class="tz">Timezone: UTC</span>
    </div>
    <div id="status" class="status muted sm" role="status" aria-live="polite"></div>
  </section>
  <section id="kpis" class="kpis"></section>
  <section class="card takeaways"><h2>The short answer</h2><div id="verdict"></div></section>
  <div class="grid2">
    <section class="card"><h2>How far they go <span class="inferred">inferred</span></h2><p class="hint">Share of tracked chatbot landings reaching each step. Steps are not strictly nested.</p><div id="ladder"></div></section>
    <section class="card"><h2>Time on the landing page</h2><p class="hint">Longest visible time reported for the visit.</p><div id="dwell"></div></section>
  </div>
  <section class="card"><h2>ChatGPT, Gemini / Perplexity and paid Meta side by side</h2><p class="hint">Same date range, same definitions. Not affected by the chatbot filter. Gemini and Perplexity have no tagged links, so they usually show no tracked landings here.</p><div id="cmp"></div></section>
  <div class="grid2">
    <section class="card"><h2>Buttons clicked</h2><p class="hint">Call-to-action clicks on the landing page, by button.</p><div id="cta"></div></section>
    <section class="card"><div id="bybot"></div></section>
  </div>
  <section class="card"><div id="bylanding"></div></section>
  <div class="grid2">
    <section class="card"><div id="bydevice"></div></section>
    <section class="card"><div id="bycountry"></div></section>
  </div>
  <section class="card"><h2>Tracked landings per day</h2><p class="hint">Each bar is one day, split by how the visitors behaved.</p><div id="daychart"></div></section>
  <section class="card"><div id="byday"></div></section>
  <section class="card">
    <h2>Every tracked visitor <span id="v-count" class="muted sm"></span></h2>
    <p class="hint">Filter by result. One row is one landing, not necessarily one person.</p>
    <div class="filters">${[["all", "All"], ["engaged", "Engaged"], ["skimmed", "Skimmed"], ["bounced", "Bounced"]].map(([id, l]) => `<button type="button" class="tbtn" data-res="${id}">${l}</button>`).join("")}</div>
    <div id="visitors"></div>
  </section>
  <div class="grid2">
    <section class="card"><h2>Referrer-only visitors (partial view)</h2><p class="hint">Visits from a chatbot with no tag on the link. Time on page and button clicks are not recorded for them; only cookie-consenting visitors show up here, so read it as colour, not as the rate.</p><div id="partial"></div></section>
    <section class="card"><h2>Did chatbot visits become signups?</h2><div id="attr"></div></section>
  </div>
  <footer class="card method">
    <h2>Method and limits</h2>
    <ul>
      <li><b>Who counts:</b> a landing whose link carries a <code>utm_source</code> naming ChatGPT / OpenAI, Gemini or Perplexity, or whose referring site is one of those chatbots. Ordinary search engines and Exa’s automated search traffic are not counted.</li>
      <li><b>Why two groups:</b> the site logs time on page, scroll and button clicks only for links that carry a campaign tag. ChatGPT tags the links it cites; Gemini and Perplexity send none, and some ChatGPT visits are untagged too. Those untagged visits are only seen through the browser, for visitors who accepted cookies.</li>
      <li><b>Removed:</b> crawlers and AI fetchers (for example GPTBot, ChatGPT-User, PerplexityBot).</li>
      <li><b>Bounced</b> = no time-on-page signal at all, or under 5 seconds. A missing signal can also mean the browser closed before it could send one, so the bounce rate is an upper bound. <b>Skimmed</b> = 5–30 seconds, nothing else. <b>Engaged</b> = 30 seconds or more, scrolled at least half the page, clicked a button or opened a second page.</li>
      <li>Counts are small, so percentages swing by many points. Groups with fewer than 2 visits are left out of the landing-page and country tables.</li>
    </ul>
  </footer>
</div>`;
}
