// Billing page errors: who opened Plan / Credits / Billing, who hit a client-side error there, and whether a
// paid action (upgrade or top-up) followed. Everything is computed from the selected date range.
import { esc } from "@corvic/live";
import { fmtWhen, pctText } from "./calc.js";

const INTENT = new Set(["Upgrade to Premium", "Get Developer", "Get Premium", "Upgrade", "Subscribe", "Checkout", "Add credits"]);
const isPlan = (p) => (p || "").startsWith("/settings/plan");
const isBillingPath = (p) => /^\/settings\/(plan|credits|billing)/.test(p || "");

function nameList(list, max = 6) {
  const e = list.map((r) => esc(r.email || r.person_id.slice(0, 8)));
  return e.length <= max ? e.join(", ") : `${e.slice(0, max).join(", ")} and ${e.length - max} more`;
}

export function analyseBilling(events, biz) {
  const ev = (events || []).filter((e) => !(e.email || "").endsWith("@corvic.ai"));
  const paid = (biz || []).filter(
    (b) => !b.internal && (b.event === "subscription::organization_upgrade" || b.event === "billing::organization_topup"),
  );
  const people = new Map();
  const get = (e) => {
    if (!people.has(e.person_id)) {
      people.set(e.person_id, {
        person_id: e.person_id, email: e.email, org: e.org_name, plan: e.plan, country: e.country,
        planViews: 0, errLoadKeys: new Set(), firstErr: null, dead: 0, deadAfterErr: 0, intent: [], intentFirst: null, hadBilling: true,
      });
    }
    const p = people.get(e.person_id);
    if (!p.email && e.email) { p.email = e.email; p.org = e.org_name; p.plan = e.plan; p.country = e.country; }
    return p;
  };
  const sorted = [...ev].sort((a, b) => (a.ts > b.ts ? 1 : -1));
  let planLoads = 0;
  let errBursts = 0;
  const burstSeen = new Set();
  for (const e of sorted) {
    if (!e.person_id) continue;
    const p = get(e);
    if (e.event === "$pageview" && isPlan(e.path)) { p.planViews += 1; planLoads += 1; }
    if (e.event === "$exception" && e.exc_kind === "441" && isPlan(e.path)) {
      const key = `${e.person_id}|${(e.ts || "").slice(0, 19)}`;
      if (!burstSeen.has(key)) { burstSeen.add(key); errBursts += 1; p.errLoadKeys.add(key); }
      if (!p.firstErr) p.firstErr = e.ts;
    }
    if (e.event === "$dead_click" && isPlan(e.path)) {
      p.dead += 1;
      if (p.firstErr) p.deadAfterErr += 1;
    }
    if (e.event === "$autocapture" && INTENT.has(e.el_text) && isBillingPath(e.path)) {
      p.intent.push(e.el_text);
      if (!p.intentFirst) p.intentFirst = e.ts;
    }
  }
  const paidBy = new Map();
  for (const b of paid) {
    if (!paidBy.has(b.person_id)) paidBy.set(b.person_id, []);
    paidBy.get(b.person_id).push(b);
  }
  const paidAfter = (p, since) => (paidBy.get(p.person_id) || []).some((b) => !since || (b.timestamp_utc || "") >= since);

  const all = [...people.values()];
  const errored = all.filter((p) => p.firstErr);
  const erroredNoPaid = errored.filter((p) => !paidAfter(p, p.firstErr));
  const erroredPaid = errored.filter((p) => paidAfter(p, p.firstErr));
  const intentNoErr = all.filter((p) => !p.firstErr && p.intent.length && !paidAfter(p, p.intentFirst));

  const rows = [
    ...erroredNoPaid.map((p) => ({ ...p, kind: "error", outcome: "No upgrade or top-up seen after the error" })),
    ...erroredPaid.map((p) => ({ ...p, kind: "error-paid", outcome: "Paid action followed the error" })),
    ...intentNoErr.map((p) => ({ ...p, kind: "intent", outcome: "Clicked an upgrade button, no paid action seen (no error recorded)" })),
  ];

  const T = [];
  if (!all.length) {
    T.push("No Plan, Credits or Billing page activity from external users in this date range.");
  } else {
    T.push(
      `<b>${all.length}</b> external ${all.length === 1 ? "person" : "people"} opened the Plan, Credits or Billing pages; <b>${errored.length}</b> (${pctText(errored.length, all.length)}) hit React #441 on the Plan page — in ${errBursts} of ${planLoads} Plan-page loads (${pctText(errBursts, planLoads)}).`,
    );
    if (errored.length) {
      T.push(
        `<b>${erroredNoPaid.length}</b> of them show no upgrade or top-up afterwards${erroredNoPaid.length ? `: ${nameList(erroredNoPaid)}` : ""}. ${erroredPaid.length ? `<b>${erroredPaid.length}</b> paid after hitting the error${erroredPaid.length ? ` (${nameList(erroredPaid)})` : ""}, so the error does not always block an upgrade.` : "None of the others paid after the error either."}`,
      );
      const deadPpl = erroredNoPaid.filter((p) => p.deadAfterErr > 0);
      if (erroredNoPaid.length) {
        T.push(
          `${deadPpl.length} of the ${erroredNoPaid.length} who did not pay made dead clicks on the Plan page after the error (${deadPpl.reduce((a, p) => a + p.deadAfterErr, 0)} dead clicks in total) — clicks where nothing responded.`,
        );
      }
    } else {
      T.push("Nobody in this range hit the React #441 error on the Plan page.");
    }
    if (intentNoErr.length) {
      T.push(
        `${intentNoErr.length} ${intentNoErr.length === 1 ? "person clicked" : "people clicked"} an upgrade-type button without a completed upgrade or top-up and without a recorded error: ${nameList(intentNoErr)}.`,
      );
    }
  }
  const upg = paid.filter((b) => b.event === "subscription::organization_upgrade").length;
  T.push(`Paid actions in the range: <b>${paid.length}</b> (${upg} upgrade${upg === 1 ? "" : "s"}, ${paid.length - upg} top-up${paid.length - upg === 1 ? "" : "s"}); internal accounts excluded.`);

  return {
    opened: all.length, errored: errored.length, erroredNoPaid: erroredNoPaid.length, erroredPaid: erroredPaid.length,
    planLoads, errBursts, intentNoErr: intentNoErr.length, paid: paid.length, rows, takeaways: T,
  };
}

export function billingHtml(B, cohortIds) {
  const tile = (v, l, s, c) =>
    `<div class="kpi"${c ? ` style="border-top-color:${c}"` : ""}><div class="kpi-v">${v}</div><div class="kpi-l">${esc(l)}</div><div class="kpi-s">${esc(s)}</div></div>`;
  const tiles =
    `<div class="kpis bill-kpis">` +
    tile(B.opened, "Opened Plan / Credits / Billing", "external people", null) +
    tile(B.errored, "Hit React #441 on Plan page", pctText(B.errored, B.opened) + " of those", "#b4442f") +
    tile(B.erroredNoPaid, "Hit the error, no paid action", "possible blocked upgrades", "#c2750a") +
    tile(B.erroredPaid, "Hit the error, paid anyway", "error did not block", "#1f7a4d") +
    tile(`${B.errBursts}/${B.planLoads}`, "Plan-page loads with the error", pctText(B.errBursts, B.planLoads), null) +
    tile(B.paid, "Paid actions in range", "upgrades + top-ups", "#1b6f8a") +
    `</div>`;
  const tk = `<ul class="bill-tk">${B.takeaways.map((t) => `<li>${t}</li>`).join("")}</ul>`;
  const badge = (k) =>
    k === "error" ? `<span class="badge" style="background:#b4442f">Error, no paid action</span>`
      : k === "error-paid" ? `<span class="badge" style="background:#1f7a4d">Error, paid anyway</span>`
      : `<span class="badge" style="background:#c2750a">Upgrade click, no paid action</span>`;
  const body = B.rows
    .map((r) => {
      const open = cohortIds.has(r.person_id);
      const who = open
        ? `<button type="button" class="link" data-pid="${esc(r.person_id)}">${esc(r.email || r.person_id)}</button>`
        : `<b>${esc(r.email || r.person_id)}</b>`;
      return `<tr><td>${who}<div class="muted sm">${esc(r.org || "")}</div></td><td>${esc(r.plan || "—")}</td><td>${esc(r.country || "—")}</td><td>${badge(r.kind)}</td><td class="num">${r.errLoadKeys.size}</td><td class="num">${r.deadAfterErr || r.dead}</td><td class="sm">${esc([...new Set(r.intent)].join(", ") || "—")}</td><td>${esc(r.firstErr ? fmtWhen(r.firstErr) : r.intentFirst ? fmtWhen(r.intentFirst) : "—")}</td></tr>`;
    })
    .join("");
  const table = B.rows.length
    ? `<div class="tbl-wrap bill-tbl"><table class="people"><thead><tr><th>Account</th><th>Plan now</th><th>Country</th><th>Outcome <em>inferred</em></th><th class="num">Error loads</th><th class="num">Dead clicks (Plan page)</th><th>Upgrade-type clicks</th><th>First seen (UTC)</th></tr></thead><tbody>${body}</tbody></table></div>`
    : `<p class="muted">No people to list for this range.</p>`;
  return `${tiles}${tk}<h3>People to follow up</h3>${table}<p class="hint">React #441 is a server-components render error whose message is hidden in production, so the cause is not visible here. “No paid action” means no upgrade or top-up event for that person in the range; it does not prove the error stopped them, and PostHog cannot see typed card details or Stripe’s own checkout page. Upgrade-type clicks are matched by button text (Upgrade to Premium, Get Developer, Checkout, Add credits, Subscribe). Test accounts are excluded.</p>`;
}
