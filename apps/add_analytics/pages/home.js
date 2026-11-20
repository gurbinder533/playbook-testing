import { esc } from "@corvic/live";
import {
  TIERS, TIER_BY_KEY, SOURCES, INVITED, analyse, fmtDur, fmtWhen, issues, pctText,
} from "../lib/calc.js";
import { analyseBilling, billingHtml } from "../lib/billing.js";
import {
  funnelHtml, tierBarHtml, dailyHtml, timelineHtml, segmentTable, adCompareHtml, frictionHtml, stageDots,
} from "../lib/charts.js";

const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const today = () => iso(Date.now());

// Module-level state survives ctx.reload().
const S = {
  start: null, end: null, tier: "", q: "", source: "", sort: "signup", dir: -1,
  open: null, note: "",
};

const STAGE_NAMES = [
  "0 · Did not finish signup", "1 · Reached home", "2 · Entered a room", "3 · Used features", "4 · Got an output / finished a build",
];
const PRESETS = [
  { id: "72h", label: "Last 72 hours", days: 2 },
  { id: "10d", label: "Last 10 days", days: 9 },
  { id: "30d", label: "Last 30 days", days: 29 },
];

export default async function render(ctx) {
  if (!S.end) {
    S.end = today();
    S.start = iso(Date.now() - 9 * DAY);
  }
  ctx.content.innerHTML = shell();
  const el = (id) => ctx.content.querySelector(id);
  const on = (node, ev, fn) => node && node.addEventListener(ev, fn, { signal: ctx.signal });

  let data = { rows: [], biz: [], seen: { internal: 0, ext: 0 }, cov: null, bill: [], billMissing: false };
  let A = null;
  let loadErr = "";

  // The pipeline runs once a day and stores each COMPLETE UTC day. `covered_until` is the end of the last stored
  // day; anything after it (normally just today) is not available yet. The app never reads PostHog itself.
  function coverage() {
    const c = data.cov;
    if (!c || !c.covered_until) return { known: false, c: null, lastDay: "", partial: false };
    const lastDay = iso(Date.parse(c.covered_until) - DAY); // covered_until is midnight after the last stored day
    return { known: true, c, lastDay, partial: S.end > lastDay };
  }

  async function load() {
    el("#status").textContent = "Loading results…";
    el("#status").className = "status muted sm";
    try {
      const params = [S.start, S.end];
      const [rows, biz, seen, cov] = await Promise.all([
        ctx.db.rows("SELECT * FROM cohort WHERE signup_day >= ? AND signup_day <= ? ORDER BY created_at_utc DESC LIMIT 3000", params, ctx.signal),
        ctx.db.rows("SELECT event, day, timestamp_utc, person_id, organization_id, internal FROM biz WHERE day >= ? AND day <= ? LIMIT 3000", params, ctx.signal),
        ctx.db.rows("SELECT count(*) FILTER (WHERE is_internal) AS internal, count(*) FILTER (WHERE NOT is_internal) AS ext FROM roster WHERE signup_day >= ? AND signup_day <= ?", params, ctx.signal),
        ctx.db.rows("SELECT max(covered_until) AS covered_until, max(pulled_at) AS pulled_at, min(history_start) AS history_start FROM coverage", [], ctx.signal).catch(() => []),
      ]);
      // billing-page events load on their own so a missing table cannot break the rest of the page
      const bill = await ctx.db.rows("SELECT event_id, ts, event, person_id, path, el_text, exc_kind, email, org_name, plan, country FROM billing WHERE day >= ? AND day <= ? LIMIT 5000", params, ctx.signal).catch(() => null);
      if (ctx.signal.aborted) return;
      data = { rows, biz, seen: seen[0] || { internal: 0, ext: 0 }, cov: cov[0] && cov[0].pulled_at ? cov[0] : null, bill: bill || [], billMissing: bill === null };
      loadErr = "";
    } catch (err) {
      if (ctx.signal.aborted) return;
      const msg = String(err?.message || err);
      if (/not_run|not found in FROM|does not exist/i.test(msg)) {
        loadErr = "No results yet — the daily pipeline run has not produced data. Try again later.";
      } else {
        ctx.reportError(err);
        loadErr = "Could not load data: " + msg.slice(0, 200);
      }
    }
    paintAll();
  }

  async function startPull(cv) {
    S.run = { state: "running", at: Date.now(), before: data.cov?.pulled_at || "", msg: "Starting…" };
    S.note = "";
    paintControls();
    try {
      const resp = await fetch(PIPELINE, { method: "POST", signal: ctx.signal });
      if (resp.headers.get("x-corvic-error-reason") === "SIGN_IN_REQUIRED") {
        S.run = { state: "idle", at: 0, before: "", msg: "" }; S.note = "Login to use the app.";
      } else if (resp.status === 401 || resp.status === 403) {
        S.run = { state: "idle", at: 0, before: "", msg: "" }; S.note = "You can't start a PostHog read. Ask the app's owner to allow running the pipeline.";
      } else if (resp.status === 429) {
        S.run = { state: "idle", at: 0, before: "", msg: "" }; S.note = "PostHog has been read a lot recently. Try again later.";
      } else if (!resp.ok) {
        S.run = { state: "idle", at: 0, before: "", msg: "" }; S.note = `Couldn't start the PostHog read (${resp.status}). Try again in a minute.`;
      } else {
        S.run.msg = resp.status === 202 ? "A PostHog read is already under way — joined it." : "";
      }
    } catch (err) {
      if (ctx.signal.aborted) return;
      S.run = { state: "idle", at: 0, before: "", msg: "" };
      S.note = err instanceof Error ? err.message : String(err);
      ctx.reportError(err);
    }
    paintControls();
    schedule();
  }

  function paintAll() {
    A = analyse(data.rows, data.biz, { start: S.start, end: S.end });
    paintControls();
    paintTop();
    paintTable();
    paintDrawer();
    paintBilling();
    paintFooter();
  }

  function paintBilling() {
    const box = el("#billing");
    if (!box) return;
    if (data.billMissing) {
      box.innerHTML = `<p class="muted">The billing-page data has not been produced yet; this section fills in after the next daily pipeline run.</p>`;
      return;
    }
    const B = analyseBilling(data.bill, data.biz);
    box.innerHTML = billingHtml(B, new Set(data.rows.map((r) => r.person_id)));
  }

  // ---------- controls ----------
  function paintControls() {
    el("#d-start").value = S.start;
    el("#d-end").value = S.end;
    ctx.content.querySelectorAll("[data-preset]").forEach((b) => {
      const p = PRESETS.find((x) => x.id === b.dataset.preset);
      b.classList.toggle("on", S.end === today() && S.start === iso(Date.now() - p.days * DAY));
    });
    const seen = data.seen.ext || 0;
    const done = data.rows.length;
    const pctDone = seen ? Math.min(100, Math.round((100 * done) / seen)) : 100;
    const cv = coverage();
    el("#progress").innerHTML =
      `<div class="prog-top"><span>${done} of ${seen} signups in range analysed</span><span class="muted">${seen > done ? "the rest are on days not stored yet (the latest day completes after midnight UTC)" : ""}</span></div>` +
      `<div class="prog-bar"><div class="prog-fill" style="width:${pctDone}%"></div></div>`;
    // status bar below the buttons
    const st = el("#status");
    let text;
    if (loadErr) {
      text = loadErr;
    } else if (cv.known) {
      text = `Latest complete day available: ${cv.lastDay} (UTC), stored ${fmtWhen(cv.c.pulled_at)} UTC. The pipeline adds each new full day once a day.`;
      if (cv.partial) text += ` The range ends ${S.end}, which is not complete yet, so signups after ${cv.lastDay} are not included.`;
    } else {
      text = "No data recorded yet — the daily pipeline run has not produced results.";
    }
    if (S.note) text = `${S.note} ${text}`;
    if (cv.known && S.start < String(cv.c.history_start || "").slice(0, 10)) {
      text += ` Note: stored history starts ${String(cv.c.history_start).slice(0, 10)}; earlier signups are not available.`;
    }
    st.textContent = text;
    st.className = "status sm muted";
  }

  // ---------- top: KPIs, charts, takeaways ----------
  function paintTop() {
    const k = A.kpi;
    const tiles = [
      ["Self-serve signups", k.n, "base for all percentages", null],
      ["Got past signup", k.past, pctText(k.past, k.n), null],
      ["Used features beyond the tour", k.used, pctText(k.used, k.n), "#c2750a"],
      ["Got an output (inferred)", k.output, pctText(k.output, k.n), "#1f7a4d"],
      ["Bounced or never got in", k.lost, pctText(k.lost, k.n), "#b4442f"],
      ["Came back after 1h+", k.back, pctText(k.back, k.n), null],
      ["Invited into an existing org", k.invited, "not in the funnel", "#1b6f8a"],
    ];
    el("#kpis").innerHTML = tiles
      .map(([l, v, s, c]) => `<div class="kpi"${c ? ` style="border-top-color:${c}"` : ""}><div class="kpi-v">${v}</div><div class="kpi-l">${esc(l)}</div><div class="kpi-s">${esc(s)}</div></div>`)
      .join("");
    el("#takeaways").innerHTML = A.takeaways.map((t) => `<li>${t}</li>`).join("");
    el("#funnel").innerHTML = funnelHtml(A.funnel);
    el("#tierbar").innerHTML = tierBarHtml(A.tierCounts, S.tier);
    el("#daily").innerHTML = dailyHtml(A.days);
    el("#timeline").innerHTML = timelineHtml(data.rows, { start: S.start, end: S.end });
    el("#seg-source").innerHTML = segmentTable("By source", A.bySource);
    el("#seg-device").innerHTML = segmentTable("By device", A.byDevice);
    el("#adcmp").innerHTML = adCompareHtml(A.adCompare);
    el("#friction").innerHTML = frictionHtml(A.friction);
    el("#worth").innerHTML = A.worth.length
      ? A.worth.slice(0, 40).map((r) => `<li><button type="button" class="link" data-pid="${esc(r.person_id)}">${esc(r.email || r.person_id)}</button> ${stageDots(r.stage)} <span class="muted">${esc(fmtDur(r.active_secs))} active</span><div>${esc(r.worth_a_look)}</div></li>`).join("")
      : `<li class="muted">Nobody in this range shows a specific need or a real attempt.</li>`;
    el("#intent").innerHTML = A.intent.length
      ? A.intent.slice(0, 40).map(({ r, s }) => `<li><button type="button" class="link" data-pid="${esc(r.person_id)}">${esc(r.email || r.person_id)}</button> ${stageDots(r.stage)} <span class="muted">${esc(fmtDur(r.active_secs))} active · ${esc(r.source)} · ${esc(r.country)}</span><div class="chips tight">${s.hit.map((h) => `<span class="chip soft">${esc(h.label)}</span>`).join("")}</div><div class="muted sm">${esc(r.headline || "")}</div></li>`).join("")
      : `<li class="muted">Nobody else in this range matches the intent pattern.</li>`;
  }

  // ---------- table ----------
  function filtered() {
    const q = S.q.trim().toLowerCase();
    let r = data.rows.filter((x) => (!S.tier || x.tier === S.tier) && (!S.source || x.source === S.source));
    if (q) r = r.filter((x) => `${x.email} ${x.country} ${x.org_name} ${x.name}`.toLowerCase().includes(q));
    const key = {
      signup: (x) => Date.parse(x.created_at_utc), tier: (x) => TIER_BY_KEY[x.tier]?.order ?? 99,
      stage: (x) => x.stage, active: (x) => x.active_secs, span: (x) => x.span_secs, sessions: (x) => x.sessions,
      back: (x) => (x.returned_1h ? 1 : 0), source: (x) => x.source,
    }[S.sort] || ((x) => x.created_at_utc);
    return r.sort((a, b) => {
      const A1 = key(a), B1 = key(b);
      return (A1 > B1 ? 1 : A1 < B1 ? -1 : 0) * S.dir;
    });
  }

  function paintTable() {
    const rows = filtered();
    ctx.content.querySelectorAll("[data-tierbtn]").forEach((b) => b.classList.toggle("on", b.dataset.tierbtn === S.tier));
    const sel = el("#f-source");
    if (!sel.dataset.ready) {
      sel.innerHTML = `<option value="">All sources</option>` + SOURCES.map((s) => `<option>${esc(s)}</option>`).join("");
      sel.dataset.ready = "1";
    }
    sel.value = S.source;
    el("#count").textContent = `Showing ${rows.length} of ${data.rows.length} people (${A.kpi.n} self-serve + ${A.kpi.invited} invited into an existing org)`;
    const th = (id, label, cls = "") => `<th class="sortable ${cls}${S.sort === id ? " sorted" : ""}" data-sort="${id}">${label}${S.sort === id ? (S.dir > 0 ? " ▲" : " ▼") : ""}</th>`;
    const head = `<tr><th>#</th><th>Account</th>${th("signup", "Signed up (UTC)")}<th>Country · device</th>${th("source", "Source")}${th("tier", "Tier <em>inferred</em>")}${th("stage", "Stage <em>inferred</em>")}${th("active", "Active", "num")}${th("span", "Span", "num")}${th("sessions", "Sess.", "num")}${th("back", "Back 1h+")}<th>Issues</th><th>Headline · where it ended</th><th>Worth a look</th></tr>`;
    const body = rows
      .slice(0, 600)
      .map((r, i) => {
        const t = TIER_BY_KEY[r.tier];
        return `<tr data-pid="${esc(r.person_id)}" class="clickrow"><td class="muted">${i + 1}</td><td><b>${esc(r.email || "(no email)")}</b><div class="muted sm">${esc(r.org_name || "")}</div></td><td>${esc(fmtWhen(r.created_at_utc))}</td><td>${esc(r.country)}<div class="muted sm">${esc(r.device)}</div></td><td>${esc(r.source)}</td><td><span class="badge" style="background:${t?.color || "#999"}">${esc(t?.short || r.tier)}</span></td><td>${stageDots(r.stage)}</td><td class="num">${esc(fmtDur(r.has_browser_events ? r.active_secs : null))}</td><td class="num">${esc(fmtDur(r.has_browser_events ? r.span_secs : null))}</td><td class="num">${r.sessions || 0}</td><td>${r.returned_1h ? "yes" : ""}</td><td class="mono sm">${esc(issues(r))}</td><td class="hl">${esc(r.headline || "—")}<div class="muted sm">${esc(r.drop_off || "")}</div></td><td class="sm">${esc(r.worth_a_look || "")}</td></tr>`;
      })
      .join("");
    el("#tbl").innerHTML = `<thead>${head}</thead><tbody>${body || `<tr><td colspan="13" class="muted pad">No people match.</td></tr>`}</tbody>`;
  }

  // ---------- drawer ----------
  function paintDrawer() {
    const dr = el("#drawer");
    const r = S.open ? data.rows.find((x) => x.person_id === S.open) : null;
    dr.classList.toggle("open", !!r);
    if (!r) { dr.innerHTML = ""; return; }
    const t = TIER_BY_KEY[r.tier];
    const steps = ["Finished signup", "Entered a room", "Used features", "Got an output"]
      .map((s, i) => `<li class="${r.stage > i ? "on" : ""}"><i></i>${esc(s)}</li>`).join("");
    const chips = (r.friction || "").split("|").map((x) => x.trim()).filter(Boolean).map((c) => `<span class="chip">${esc(c)}</span>`).join("");
    const stat = (l, v) => `<div class="stat"><div class="stat-v">${esc(v)}</div><div class="stat-l">${esc(l)}</div></div>`;
    dr.innerHTML = `<div class="dr-head"><button type="button" class="x" data-close aria-label="Close">×</button>` +
      `<span class="badge" style="background:${t?.color || "#999"}">${esc(t?.short || r.tier)}</span> <span class="inferred">inferred</span>` +
      `<h2>${esc(r.headline || r.email || r.person_id)}</h2>` +
      `<div class="meta">${esc(r.email || "(no email)")}${r.org_name ? ` · ${esc(r.org_name)}` : ""} · signed up ${esc(fmtWhen(r.created_at_utc))} UTC · ${esc(r.country)} · ${esc(r.device)} · ${esc(r.source)}${r.plan ? ` · plan ${esc(r.plan)}` : ""}</div></div>` +
      `<div class="dr-body"><ol class="track">${steps}</ol><p class="hint">${esc(STAGE_NAMES[r.stage] || "")} — inferred from clicks and pages, not confirmed by the product.</p>` +
      (r.narrative ? `<h4>What happened <span class="inferred">inferred</span></h4><p>${esc(r.narrative)}</p>` : `<p class="muted">No narrative written${r.model_error && r.model_error !== "not written" ? ` (${esc(r.model_error)})` : " yet — run the pipeline"}.</p>`) +
      (r.intent ? `<h4>What they seemed to want</h4><p>${esc(r.intent)}</p>` : "") +
      (r.outcome ? `<h4>Outcome</h4><p>${esc(r.outcome)}</p>` : "") +
      (r.drop_off ? `<h4>Where it ended</h4><p>${esc(r.drop_off)}</p>` : "") +
      (chips ? `<div class="chips">${chips}</div>` : "") +
      (r.worth_a_look ? `<div class="worth-box"><b>Worth a look:</b> ${esc(r.worth_a_look)}</div>` : "") +
      `<div class="stats">${stat("Active time", fmtDur(r.active_secs))}${stat("First → last event", fmtDur(r.span_secs))}${stat("Sessions", r.sessions)}${stat("Page views", r.pageviews)}${stat("Clicks", r.clicks)}` +
      `${stat("Errors", `418×${r.exc_418} · 441×${r.exc_441} · other ${r.exc_other}`)}${stat("Dead clicks / swipes", `${r.dead_clicks} / ${r.dead_swipes}`)}${stat("Rage clicks", r.rage_clicks)}${stat("Rooms visited", r.rooms_visited)}${stat("Last event", fmtWhen(r.last_event_utc))}</div>` +
      (r.truncated ? `<p class="warn">Event pull was capped at 5,000 events for this person — later activity is missing.</p>` : "") +
      (r.merged_devices ? `<p class="hint">Merged ${r.merged_devices} extra device id${r.merged_devices === 1 ? "" : "s"} that map to this person only.</p>` : "") +
      `<details><summary>Event digest (${r.n_events} events pulled; repeats collapsed)</summary><pre class="digest">${esc(r.digest || "(no browser events)")}</pre></details></div>`;
  }

  function paintFooter() {
    const rg = `${S.start} to ${S.end} (UTC)`;
    el("#footer-range").textContent = rg;
    el("#footer-test").textContent = String(data.seen.internal || 0);
    const waiting = Math.max(0, (data.seen.ext || 0) - data.rows.length);
    el("#footer-wait").textContent = waiting ? `${waiting} signup${waiting === 1 ? "" : "s"} in this range are not analysed yet (their day is not stored or their first 3 hours are not complete).` : "";
  }

  // ---------- events ----------
  function setRange(a, b) {
    if (!a || !b || a > b) return;
    S.start = a; S.end = b; S.tier = ""; S.open = null; S.note = "";
    load();
  }
  ctx.content.querySelectorAll("[data-preset]").forEach((b) =>
    on(b, "click", () => {
      const p = PRESETS.find((x) => x.id === b.dataset.preset);
      setRange(iso(Date.now() - p.days * DAY), today());
    }));
  on(el("#d-start"), "change", (e) => setRange(e.target.value, S.end));
  on(el("#d-end"), "change", (e) => setRange(S.start, e.target.value));
  on(el("#q"), "input", (e) => { S.q = e.target.value; paintTable(); });
  on(el("#f-source"), "change", (e) => { S.source = e.target.value; paintTable(); });
  on(ctx.content, "click", (e) => {
    const t = e.target.closest?.("[data-tier],[data-tierbtn]");
    if (t) {
      const v = t.dataset.tier ?? t.dataset.tierbtn;
      S.tier = S.tier === v || v === "" ? "" : v;
      paintTop(); paintTable();
      if (S.tier) el("#table-sec").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const s = e.target.closest?.("[data-sort]");
    if (s) {
      const id = s.dataset.sort;
      if (S.sort === id) S.dir = -S.dir; else { S.sort = id; S.dir = id === "tier" || id === "source" ? 1 : -1; }
      paintTable();
      return;
    }
    if (e.target.closest?.("[data-close]")) { S.open = null; paintDrawer(); return; }
    const p = e.target.closest?.("[data-pid]");
    if (p) { S.open = p.dataset.pid; paintDrawer(); }
  });
  on(document, "keydown", (e) => { if (e.key === "Escape" && S.open) { S.open = null; paintDrawer(); } });

  // No Reload button: changing the dates or clicking a preset re-reads the stored results (setRange -> load).
  // PostHog is read by the daily pipeline run, never from here.

  await load();
}

function shell() {
  const tierBtns = `<button type="button" class="tbtn" data-tierbtn="">All</button>` +
    TIERS.map((t) => `<button type="button" class="tbtn" data-tierbtn="${esc(t.key)}"><i style="background:${t.color}"></i>${esc(t.short)}</button>`).join("");
  return `
<div class="wrap">
  <nav class="topnav"><a href="home" aria-current="page">Signup cohorts</a><a href="meta">Meta ads</a><a href="ugc">UGC</a><a href="ai">AI chatbots</a></nav>
  <header class="top">
    <div>
      <div class="eyebrow">PostHog project 70607 · all times UTC</div>
      <h1>Signup Cohort Explorer</h1>
      <p class="lede">Who got value from Corvic, who got stuck, and where people dropped off — for everyone who signed up in the range you pick. Tiers, stages and narratives are <span class="inferred">inferred</span> from clicks and pages.</p>
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
    <div id="progress" class="progress"></div>
  </section>

  <section id="kpis" class="kpis"></section>

  <section class="card takeaways"><h2>What the data says</h2><p class="hint">Every figure below is recomputed from the selected range.</p><ul id="takeaways"></ul></section>

  <div class="grid2">
    <section class="card"><h2>Funnel <span class="inferred">inferred</span></h2><div id="funnel"></div></section>
    <section class="card"><h2>Where people ended up <span class="inferred">inferred</span></h2><div id="tierbar"></div></section>
  </div>

  <section class="card"><h2>Signups per day</h2><div id="daily"></div></section>
  <section class="card"><h2>Signup timeline — one dot per person</h2><p class="hint">Click a dot to open the person.</p><div id="timeline" class="scrollx"></div></section>

  <div class="grid2">
    <section class="card"><div id="seg-source"></div></section>
    <section class="card"><div id="seg-device"></div></section>
  </div>
  <div class="grid2">
    <section class="card"><h2>Ad click versus everything else</h2><div id="adcmp"></div></section>
    <section class="card"><h2>Friction — number of people affected</h2><div id="friction"></div></section>
  </div>

  <section class="card"><h2>Worth a conversation <span class="inferred">inferred</span></h2><p class="hint">A specific need or a real attempt. Ordered by furthest stage, then active time.</p><ul id="worth" class="worth"></ul></section>

  <section class="card"><h2>Possible intent — no attempt seen <span class="inferred">inferred</span></h2><p class="hint">People who have not engaged a feature (below stage 3) but whose journey shows at least two intent signals, at least one of them strong: opened Sources, Vault or MCP; looked at Plan, Credits or Billing; clicked “Add card”; or opened Access Tokens. Weaker signals: said where their data lives, dead or rage clicks while exploring, or came back after an hour or more. A pattern of interest, not proof of an attempt. Ordered by number of signals, then active time; people already listed above are not repeated.</p><ul id="intent" class="worth"></ul></section>

  <section class="card" id="billing-sec">
    <h2>Billing page errors <span class="inferred">inferred</span></h2>
    <p class="hint">Everyone (not only new signups) who opened the Plan, Credits or Billing pages in the selected range, whether they hit a client-side error there, and whether an upgrade or top-up followed.</p>
    <div id="billing"></div>
  </section>

  <section class="card" id="table-sec">
    <h2>Everyone who signed up</h2>
    <div class="filters">${tierBtns}<input id="q" type="search" placeholder="Search email, country, org…"><select id="f-source"></select></div>
    <div id="count" class="muted sm"></div>
    <div class="tbl-wrap"><table id="tbl" class="people"></table></div>
  </section>

  <footer class="card method">
    <h2>Method and limits</h2>
    <p><b>Source:</b> PostHog project 70607. <b>Range:</b> <span id="footer-range"></span>. Signup is the person's <code>created_at</code>, converted from project time (UTC−5) to UTC. PostHog is read by a daily pipeline run, one complete UTC day at a time; a stored day is never re-read. Each person's journey is built from their stored events (plus devices that map to them alone).</p>
    <p><b>Tiers and stages are judgments, not system labels.</b> Stage 0–4 is assigned by rules over pages and clicks; the tier follows from the stage, the time on site and whether the person was invited. Narratives are written by a model from a compact event digest and are inferred.</p>
    <p><b>Test accounts removed:</b> <span id="footer-test">0</span> (corvic.ai emails, staging referrers, corvic.dev / corvic.live) — excluded from every count and never listed. Invited members (role member, no onboarding event, named in an invite) are shown but kept out of the funnel. <span id="footer-wait"></span></p>
    <ul>
      <li>PostHog masks typed text and does not capture chat prompts or agent results. “Got an output” is inferred from clicks such as Download, Run and Approve — not from confirmed results.</li>
      <li>Samples are small. Percentages are directional; one person can move a rate by several points.</li>
      <li>Active time (gaps of 120s or less between meaningful events) under-counts reading and typing — treat it as a floor.</li>
      <li>Some accounts have no PostHog profile or no browser events and cannot be analysed (tier “Unknown”).</li>
      <li>Mobile and Google Ads traffic overlap, so their effects can't be separated.</li>
    </ul>
  </footer>
  <aside id="drawer" class="drawer" aria-label="Person detail"></aside>
</div>`;
}
