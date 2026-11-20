// Pure calculations for the Signup Cohort Explorer. Every number the page shows is computed here
// from the selected rows — nothing is hardcoded.

export const INVITED = "Joined an existing org";
export const OUTPUT = "Got an output / finished a build";
export const STALLED = "Stalled after real intent";
export const BROWSED = "Browsed, no task";
export const BOUNCED = "Bounced at home";
export const NEVER = "Never got in";
export const UNKNOWN = "Unknown";

export const TIERS = [
  { key: OUTPUT, short: "Got an output", color: "#1f7a4d" },
  { key: STALLED, short: "Stalled after intent", color: "#c2750a" },
  { key: INVITED, short: "Joined an existing org", color: "#1b6f8a" },
  { key: BROWSED, short: "Browsed, no task", color: "#5b6b8c" },
  { key: BOUNCED, short: "Bounced at home", color: "#b4442f" },
  { key: NEVER, short: "Never got in", color: "#8a8478" },
  { key: UNKNOWN, short: "Unknown (no browser events)", color: "#b8b2a4" },
];
export const TIER_BY_KEY = Object.fromEntries(TIERS.map((t, i) => [t.key, { ...t, order: i }]));

export const SOURCES = ["Google Ads", "Direct", "Auth redirect", "Corvic link", "Shared app link", "Invite flow"];
export const DEVICES = ["Desktop", "Mobile or tablet", "Unknown"];

export function median(values) {
  const v = values.filter((x) => x !== null && x !== undefined && !Number.isNaN(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export function pct(n, d) {
  return d ? (100 * n) / d : null;
}
export function pctText(n, d) {
  const p = pct(n, d);
  return p === null ? "—" : `${p.toFixed(p >= 10 || p === 0 ? 0 : 1)}%`;
}

export function fmtDur(secs) {
  if (secs === null || secs === undefined) return "—";
  const s = Math.round(secs);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

export function fmtWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC",
  });
}

export function issues(r) {
  const out = [];
  if (r.exc_418) out.push(`418×${r.exc_418}`);
  if (r.exc_441) out.push(`441×${r.exc_441}`);
  if (r.dead_clicks) out.push(`${r.dead_clicks}d`);
  if (r.dead_swipes) out.push(`${r.dead_swipes}s`);
  if (r.rage_clicks) out.push(`${r.rage_clicks}r`);
  return out.join(" ");
}

export function dayList(start, end) {
  const out = [];
  let t = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  for (let i = 0; t <= e && i < 400; i += 1, t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

// Possible intent: people below stage 3 whose journey shows several intent signals but no engagement click.
// Signals come from fields the pipeline already stores (digest, feature_signals, counters).
export const INTENT_SIGNALS = [
  { key: "sources", label: "Opened Sources / Vault / MCP", strong: true },
  { key: "billing", label: "Looked at Plan / Credits / Billing", strong: true },
  { key: "card", label: "Clicked Add card", strong: true },
  { key: "token", label: "Opened Access Tokens", strong: true },
  { key: "dataloc", label: "Said where their data lives", strong: false },
  { key: "friction", label: "Dead or rage clicks while exploring", strong: false },
  { key: "return", label: "Came back after 1h+", strong: false },
];

export function intentSignals(r) {
  const d = r.digest || "";
  const fs = r.feature_signals || "";
  const on = {
    sources: (r.connector_events || 0) >= 1 || /page:\/vault|page:\/settings\/vault|click:sources|click:connector vault|page:\/room\/<id>\/mcp|click:mcp playground/.test(fs),
    billing: /PV \/settings\/(plan|credits|billing)/.test(d),
    card: /click "Add card/.test(d),
    token: /PV \/settings\/accessTokens|click "(Create token|Access Tokens)"/.test(d),
    dataloc: /click "(Cloud storage|Database|Data warehouse|Local files|Spreadsheets)"/.test(d),
    friction: ((r.dead_clicks || 0) + (r.rage_clicks || 0)) > 0 && ((r.connector_events || 0) >= 1 || fs !== ""),
    return: !!r.returned_1h && (r.active_secs || 0) >= 120,
  };
  const hit = INTENT_SIGNALS.filter((s) => on[s.key]);
  return { hit, n: hit.length, strong: hit.some((s) => s.strong) };
}

const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function names(list, max = 8) {
  const e = list.map((r) => escHtml(r.email || r.name || r.person_id.slice(0, 8)));
  if (e.length <= max) return e.join(", ");
  return `${e.slice(0, max).join(", ")} and ${e.length - max} more`;
}

function group(rows, keyFn, keys) {
  return keys.map((k) => {
    const g = rows.filter((r) => keyFn(r) === k);
    return {
      key: k,
      people: g.length,
      used: g.filter((r) => r.stage >= 3).length,
      output: g.filter((r) => r.stage >= 4).length,
      lost: g.filter((r) => r.tier === BOUNCED || r.tier === NEVER).length,
      med: median(g.filter((r) => r.has_browser_events).map((r) => r.active_secs)),
    };
  });
}

function segment(rows) {
  const n = rows.length;
  const used = rows.filter((r) => r.stage >= 3).length;
  return {
    n,
    used,
    output: rows.filter((r) => r.stage >= 4).length,
    lost: rows.filter((r) => r.tier === BOUNCED || r.tier === NEVER).length,
    med: median(rows.filter((r) => r.has_browser_events).map((r) => r.active_secs)),
    mobile: rows.filter((r) => r.device === "Mobile or tablet").length,
  };
}

export function analyse(rows, biz, range) {
  const self = rows.filter((r) => r.tier !== INVITED);
  const invited = rows.filter((r) => r.tier === INVITED);
  const n = self.length;
  const cnt = (f) => self.filter(f).length;
  const kpi = {
    n,
    past: cnt((r) => r.stage >= 1),
    room: cnt((r) => r.stage >= 2),
    used: cnt((r) => r.stage >= 3),
    output: cnt((r) => r.stage >= 4),
    lost: cnt((r) => r.tier === BOUNCED || r.tier === NEVER),
    back: cnt((r) => r.returned_1h),
    invited: invited.length,
  };
  const funnel = [
    { label: "Self-serve signups", n: kpi.n },
    { label: "Got past signup", n: kpi.past },
    { label: "Entered a room", n: kpi.room },
    { label: "Used features beyond the tour", n: kpi.used },
    { label: "Got an output (inferred from clicks)", n: kpi.output },
  ];
  const tierCounts = TIERS.map((t) => ({ ...t, n: rows.filter((r) => r.tier === t.key).length }));

  const days = dayList(range.start, range.end).map((d) => {
    const g = self.filter((r) => r.signup_day === d);
    const ads = g.filter((r) => r.source === "Google Ads").length;
    return { day: d, ads, other: g.length - ads, engaged: g.filter((r) => r.stage >= 3).length };
  });

  const bySource = group(self, (r) => r.source, SOURCES.filter((s) => s !== "Invite flow"));
  const byDevice = group(self, (r) => r.device, DEVICES);
  const ads = self.filter((r) => r.source === "Google Ads");
  const others = self.filter((r) => r.source !== "Google Ads");
  const adCompare = { ads: segment(ads), others: segment(others) };

  const finished = self.filter((r) => r.onboarding_done);
  const engaged = self.filter((r) => r.stage >= 3);
  const connectorEngaged = engaged.filter((r) => r.connector_events >= 2);
  const friction = [
    { label: "Left onboarding without finishing", n: cnt((r) => !r.onboarding_done), of: n },
    { label: "React #418 on first screen (of those who finished)", n: finished.filter((r) => r.exc_418 > 0).length, of: finished.length },
    { label: "Any dead click", n: cnt((r) => r.dead_clicks > 0), of: n },
    { label: "Five or more dead clicks", n: cnt((r) => r.dead_clicks >= 5), of: n },
    { label: "Connector, Vault or Sources friction (of engaged)", n: connectorEngaged.length, of: engaged.length },
    { label: "Rage clicks", n: cnt((r) => r.rage_clicks > 0), of: n },
    { label: "React #441 (Plan page)", n: cnt((r) => r.exc_441 > 0), of: n },
  ];

  // --- takeaways (every figure computed) ---
  const T = [];
  if (n === 0) {
    T.push("No self-serve signups were analysed for this date range yet.");
  } else {
    const outRows = self.filter((r) => r.stage >= 4);
    T.push(
      `<b>${pctText(kpi.used, n)}</b> of self-serve signups (${kpi.used} of ${n}) used features beyond the tour, and <b>${pctText(kpi.output, n)}</b> (${kpi.output}) got an output, inferred from clicks${outRows.length ? `: ${names(outRows)}` : ""}.`,
    );
    T.push(
      `<b>${pctText(kpi.lost, n)}</b> (${kpi.lost}) bounced at home or never got in; <b>${kpi.back}</b> ${kpi.back === 1 ? "person" : "people"} came back after a gap of an hour or more.`,
    );
    if (ads.length) {
      const a = adCompare.ads;
      const o = adCompare.others;
      T.push(
        `Google Ads brought <b>${pctText(ads.length, n)}</b> of signups (${ads.length}). ${pctText(a.used, a.n)} of them used features versus ${pctText(o.used, o.n)} of everyone else; median active time ${fmtDur(a.med)} versus ${fmtDur(o.med)}.`,
      );
    } else {
      T.push("No signups in this range came from a Google Ads click.");
    }
    const mid = (Date.parse(`${range.start}T00:00:00Z`) + Date.parse(`${range.end}T00:00:00Z`) + 86400000) / 2;
    const h1 = self.filter((r) => Date.parse(r.created_at_utc) < mid);
    const h2 = self.filter((r) => Date.parse(r.created_at_utc) >= mid);
    if (h1.length && h2.length) {
      const ad1 = h1.filter((r) => r.source === "Google Ads").length;
      const ad2 = h2.filter((r) => r.source === "Google Ads").length;
      const e1 = h1.filter((r) => r.stage >= 3).length;
      const e2 = h2.filter((r) => r.stage >= 3).length;
      T.push(
        `First half of the range (${h1.length} signups): ad share ${pctText(ad1, h1.length)}, engaged ${pctText(e1, h1.length)}. Second half (${h2.length}): ad share ${pctText(ad2, h2.length)}, engaged ${pctText(e2, h2.length)}.`,
      );
    }
    if (engaged.length) {
      T.push(
        connectorEngaged.length
          ? `Connector, Vault or Sources friction showed up for <b>${connectorEngaged.length}</b> of ${engaged.length} engaged users (${pctText(connectorEngaged.length, engaged.length)}): ${names(connectorEngaged)}.`
          : `None of the ${engaged.length} engaged users showed repeated Connector, Vault or Sources activity.`,
      );
    }
    if (finished.length) {
      const fe = finished.filter((r) => r.stage >= 3);
      const fl = finished.filter((r) => r.stage < 3);
      const b = (g) => g.filter((r) => r.exc_418 > 0).length;
      T.push(
        `React #418 hit <b>${pctText(b(finished), finished.length)}</b> of people who finished onboarding (${b(finished)} of ${finished.length}): ${pctText(b(fe), fe.length)} of the engaged (${fe.length}) versus ${pctText(b(fl), fl.length)} of those who left early (${fl.length}).`,
      );
    }
    const mob = self.filter((r) => r.device === "Mobile or tablet");
    const desk = self.filter((r) => r.device === "Desktop");
    if (mob.length || desk.length) {
      const mobAds = mob.filter((r) => r.source === "Google Ads").length;
      T.push(
        `Mobile or tablet: ${pctText(mob.filter((r) => r.stage >= 3).length, mob.length)} engaged (${mob.length} people) versus desktop ${pctText(desk.filter((r) => r.stage >= 3).length, desk.length)} (${desk.length}). ${pctText(mobAds, mob.length)} of mobile users came from ads — the two groups overlap, so the effects cannot be separated.`,
      );
    }
    const shared = self.filter((r) => r.source === "Shared app link");
    if (shared.length) {
      T.push(
        `<b>${shared.length}</b> signup${shared.length === 1 ? " was" : "s were"} from a shared app link; ${shared.filter((r) => r.shared_app_views >= 3).length} opened that link three or more times.`,
      );
    }
  }
  const paid = biz.filter((b) => !b.internal && (b.event === "subscription::organization_upgrade" || b.event === "billing::organization_topup"));
  const pids = new Set(rows.map((r) => r.person_id));
  const oids = new Set(rows.map((r) => r.org_id).filter(Boolean));
  const fromCohort = paid.filter((b) => pids.has(b.person_id) || (b.organization_id && oids.has(b.organization_id)));
  const up = paid.filter((b) => b.event === "subscription::organization_upgrade").length;
  T.push(
    `Paid actions in the range: <b>${paid.length}</b> (${up} upgrade${up === 1 ? "" : "s"}, ${paid.length - up} top-up${paid.length - up === 1 ? "" : "s"}); <b>${fromCohort.length}</b> came from people or organisations that signed up in this range (test accounts excluded).`,
  );

  const worth = rows
    .filter((r) => (r.worth_a_look || "").trim() !== "")
    .sort((a, b) => b.stage - a.stage || b.active_secs - a.active_secs);

  // possible intent: not already in the model-written list, below stage 3, not invited / unknown / never got in
  const intent = rows
    .filter((r) => r.stage < 3 && ![INVITED, UNKNOWN, NEVER].includes(r.tier) && !(r.worth_a_look || "").trim())
    .map((r) => ({ r, s: intentSignals(r) }))
    .filter((x) => x.s.n >= 2 && x.s.strong)
    .sort((a, b) => b.s.n - a.s.n || b.r.active_secs - a.r.active_secs);

  return { self, invited, kpi, funnel, tierCounts, days, bySource, byDevice, adCompare, friction, takeaways: T, worth, intent };
}
