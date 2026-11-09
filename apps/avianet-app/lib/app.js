import { esc } from "@corvic/live";

export const OTHER = "__OTHER__";
export const OTHER_LABEL = "All other customers";

const N0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const N1 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function usd(n) {
  if (n == null || Number.isNaN(Number(n))) return "";
  const v = Math.round(Number(n));
  return (v < 0 ? "-" : "") + "$" + N0.format(Math.abs(v));
}
export function compact(n) {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1e9) return s + "$" + (a / 1e9).toFixed(1) + "B";
  if (a >= 1e6) return s + "$" + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
  if (a >= 1e3) return s + "$" + (a / 1e3).toFixed(0) + "K";
  return s + "$" + Math.round(a);
}
export function qty(n) {
  if (n == null || Number.isNaN(Number(n))) return "";
  return N1.format(Number(n));
}
export function int(n) {
  if (n == null || Number.isNaN(Number(n))) return "";
  return N0.format(Number(n));
}

/** "5d late" / "3d ahead" / "on time". Positive = ready after promise. */
export function aheadLate(n) {
  if (n == null || Number.isNaN(Number(n))) return "";
  const v = Number(n);
  if (v === 0) return "on time";
  return v > 0 ? `${v}d late` : `${-v}d ahead`;
}
export function aheadLateClass(n) {
  if (n == null) return "";
  return Number(n) > 0 ? "late" : Number(n) < 0 ? "ahead" : "";
}

/** Friday that ends the week starting Monday `mon` (YYYY-MM-DD). */
export function weekEnding(mon) {
  if (!mon) return "";
  const d = new Date(mon + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + 4);
  return d.toISOString().slice(0, 10);
}

export const BUCKETS = [
  { key: "w1", label: "Week 1", test: (w) => w === 1 },
  { key: "w2_4", label: "Weeks 2\u20134", test: (w) => w >= 2 && w <= 4 },
  { key: "w5_12", label: "Weeks 5\u201312", test: (w) => w >= 5 && w <= 12 },
  { key: "w13_19", label: "Weeks 13\u201319", test: (w) => w >= 13 && w <= 19 },
  { key: "w20", label: "Week 20", test: (w) => w === 20 },
  { key: "later", label: "Beyond week 20", test: (w) => w > 20 },
];

export function params(ctx) {
  let sp = new URLSearchParams();
  try {
    const u = new URL(ctx.route.url, "http://x/");
    if ([...u.searchParams].length) sp = u.searchParams;
  } catch (_) { /* fall through */ }
  if (![...sp].length) {
    try { sp = new URLSearchParams(window.location.search); } catch (_) { /* none */ }
  }
  return sp;
}

// Order date range chosen on any page; carried on every link so the filter follows the reader across tabs.
let CARRY = { of: "", ot: "" };
export function href(path, obj0 = {}) {
  const obj = { ...obj0 };
  if (!("of" in obj) && CARRY.of) obj.of = CARRY.of;
  if (!("ot" in obj) && CARRY.ot) obj.ot = CARRY.ot;
  const q = Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return q ? `${path}?${q}` : path;
}

const ORDER_SQL = `SELECT HEADER_ID, ORDER_NUMBER, coalesce(CUSTOMER_NAME, '(Gap)') AS CUSTOMER_NAME,
  coalesce(OPERATING_UNIT, '(none)') AS OPERATING_UNIT, ORDER_TYPE, EQUIPMENT_LINES, WEEK_NO,
  CAST(SHIP_READY_DT AS VARCHAR) AS SHIP_READY_DT, CAST(SHIP_WEEK_START AS VARCHAR) AS SHIP_WEEK_START,
  CAST(EARLIEST_PROMISE_DT AS VARCHAR) AS EARLIEST_PROMISE_DT, DAYS_LATE_VS_PROMISE, LINES_TO_PURCHASE,
  UNCOMMITTED_LINES, UNCOMMITTED_QTY, EQ_COMMITTED_USD, EQ_UNCOMMITTED_USD, EQ_DISCOUNT_USD,
  SOFTWARE_USD, TOTAL_USD, coalesce(ORDER_HOLDS, '') AS ORDER_HOLDS, SOFTWARE_ONLY, CAST(ORDER_DATE AS VARCHAR) AS ORDER_DATE FROM orders LEFT JOIN odates USING (HEADER_ID)`;

export async function loadOrders(ctx) {
  return ctx.db.rows(ORDER_SQL, [], ctx.signal);
}

export function topCustomers(orders, ou) {
  const m = new Map();
  for (const o of orders) {
    if (ou && o.OPERATING_UNIT !== ou) continue;
    m.set(o.CUSTOMER_NAME, (m.get(o.CUSTOMER_NAME) || 0) + (o.TOTAL_USD || 0));
  }
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, 5).map((x) => x[0]);
}

export function applySlicers(orders, { ou, cust }) {
  const top = topCustomers(orders, ou);
  return orders.filter((o) => {
    if (!dateOk(o.ORDER_DATE)) return false;
    if (ou && o.OPERATING_UNIT !== ou) return false;
    if (!cust) return true;
    if (cust === OTHER) return !top.includes(o.CUSTOMER_NAME);
    return o.CUSTOMER_NAME === cust;
  });
}

export function slicerState(sp) {
  return { ou: sp.get("ou") || "", cust: sp.get("cust") || "" };
}

/** Operating Unit select + customer slices (top 5 of selected OU + All other). */
export function slicersHtml(orders, st, path, opts = {}) {
  const ous = [...new Set(orders.map((o) => o.OPERATING_UNIT))].sort();
  const top = topCustomers(orders, st.ou);
  const chip = (label, value) => {
    const on = (st.cust || "") === value;
    return `<a class="chip${on ? " on" : ""}" href="${esc(href(path, { ou: st.ou, cust: value }))}">${esc(label)}</a>`;
  };
  return `<div class="slicers">
    <label class="slicer"><span>Operating Unit</span>
      <select id="ou-select">
        <option value="">All operating units</option>
        ${ous.map((o) => `<option value="${esc(o)}"${o === st.ou ? " selected" : ""}>${esc(o)}</option>`).join("")}
      </select></label>
    ${opts.customers === false ? "" : `<div class="slicer wide"><span>Customer (top 5${st.ou ? " of " + esc(st.ou) : ""})</span>
      <div class="chips">${chip("All", "")}${top.map((c) => chip(c, c)).join("")}${chip(OTHER_LABEL, OTHER)}</div></div>`}
  </div>`;
}

export function wireSlicers(ctx, path, extra = {}) {
  const sel = ctx.content.querySelector("#ou-select");
  if (!sel) return;
  sel.addEventListener("change", () => {
    ctx.navigate(href(path, { ...extra, ou: sel.value }));
  }, { signal: ctx.signal });
}

// ---- Light / dark theme: remembered per reader, defaults to the reader's system setting ------
const THEME_KEY = "ctp_theme";
function readTheme() {
  try { const v = window.localStorage.getItem(THEME_KEY); if (v === "dark" || v === "light") return v; } catch (_) { /* storage blocked */ }
  try { return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; } catch (_) { return "light"; }
}
let THEME = readTheme();
function applyTheme(t) {
  THEME = t;
  try { document.documentElement.setAttribute("data-theme", t); } catch (_) { /* ignore */ }
  document.querySelectorAll("[data-theme-toggle]").forEach((b) => {
    b.textContent = t === "dark" ? "\u2600 Light mode" : "\u263e Dark mode";
    b.setAttribute("aria-pressed", t === "dark" ? "true" : "false");
  });
}
applyTheme(THEME);
document.addEventListener("click", (e) => {
  const b = e.target && e.target.closest ? e.target.closest("[data-theme-toggle]") : null;
  if (!b) return;
  const next = THEME === "dark" ? "light" : "dark";
  try { window.localStorage.setItem(THEME_KEY, next); } catch (_) { /* storage blocked */ }
  applyTheme(next);
});

export function navHtml(ctx) {
  const here = ctx.route.path || "home";
  const _sp = params(ctx);
  const _ok = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : "");
  CARRY = { of: _ok(_sp.get("of")), ot: _ok(_sp.get("ot")) };
  const l = (p, t) => `<a href="${esc(href(p))}"${here === p || (p === "home" && here === "") ? ' aria-current="page"' : ""}>${t}</a>`;
  return `<header class="top"><div class="brand">Clear to Pick <small>Summary &amp; Drill down</small></div>
    <nav>${l("home", "Summary")}${l("dashboard", "Equipment revenue")}${l("holds", "Order Holds")}${l("orders", "Order grid")}${l("allocation", "Allocation")}<button type="button" class="theme-toggle" data-theme-toggle aria-pressed="${THEME === "dark"}">${THEME === "dark" ? "\u2600 Light mode" : "\u263e Dark mode"}</button></nav></header>`;
}

// ---- Aviat FY27 fiscal calendar (quarters run Saturday to Friday) --------------------
export const FY_CAL = [
  { key: "FY27-Q1", fy: "FY27", q: "Q1", start: "2026-07-04", end: "2026-10-02" },
  { key: "FY27-Q2", fy: "FY27", q: "Q2", start: "2026-10-03", end: "2027-01-01" },
  { key: "FY27-Q3", fy: "FY27", q: "Q3", start: "2027-01-02", end: "2027-04-02" },
  { key: "FY27-Q4", fy: "FY27", q: "Q4", start: "2027-04-03", end: "2027-07-02" },
];
export function quarterOf(iso) {
  if (!iso) return "";
  const d = String(iso).slice(0, 10);
  for (const q of FY_CAL) if (d >= q.start && d <= q.end) return q.key;
  return d > FY_CAL[FY_CAL.length - 1].end ? "BEYOND" : "BEFORE";
}

// ---- Order category (one per order, first match wins) ---------------------------------
export const CATS = [["EQ", "Equipment"], ["DISC", "Discounts"], ["SW", "Software"], ["OTH", "Others"]];
export function orderCat(o) {
  if ((o.EQ_COMMITTED_USD || 0) !== 0 || (o.EQ_UNCOMMITTED_USD || 0) !== 0) return "EQ";
  if ((o.EQ_DISCOUNT_USD || 0) !== 0) return "DISC";
  if ((o.SOFTWARE_USD || 0) !== 0) return "SW";
  return "OTH";
}

// ---- Order date filter -----------------------------------------------------------------
export function dateOk(d) {
  if (!CARRY.of && !CARRY.ot) return true;
  if (!d) return false;
  const s = String(d).slice(0, 10);
  return (!CARRY.of || s >= CARRY.of) && (!CARRY.ot || s <= CARRY.ot);
}
/** SQL fragment (uses an ORDER_DATE column) + params for the current order date range. */
export function dateWhere() {
  const sql = [], args = [];
  if (CARRY.of) { sql.push(" AND ORDER_DATE >= CAST(? AS DATE)"); args.push(CARRY.of); }
  if (CARRY.ot) { sql.push(" AND ORDER_DATE <= CAST(? AS DATE)"); args.push(CARRY.ot); }
  return { sql: sql.join(""), args };
}
let COVER = null;
/** Count of ALL orders (any status) entered in the chosen range, so the pages can say how many are in this report. */
export async function loadDateCoverage(ctx) {
  COVER = null;
  if (!CARRY.of && !CARRY.ot) return;
  try {
    const w = dateWhere();
    const r = await ctx.db.rows(`SELECT count(*) AS n FROM odates WHERE 1=1${w.sql}`, w.args, ctx.signal);
    COVER = r && r[0] ? Number(r[0].n) : null;
  } catch (_) { COVER = null; }
}
export function dateFilterHtml(note, shown) {
  const on = !!(CARRY.of || CARRY.ot);
  const cov = on && COVER != null && shown != null
    ? `<span class="muted" style="flex-basis:100%"><b>${int(shown)}</b> of the <b>${int(COVER)}</b> orders entered in this range are in this report${COVER > shown ? ` (the other ${int(COVER - shown)} have no open equipment or software revenue still to ship: for example services-only, return or internal orders, cancelled or already-shipped orders. This report shows open orders by the week they are ready to ship; shipped revenue is on the Equipment revenue page)` : ""}.</span>`
    : "";
  return `<form class="slicers so-filter" id="od-form">
    <label class="slicer"><span>Order date from</span><input type="date" id="od-from" value="${esc(CARRY.of)}"></label>
    <label class="slicer"><span>Order date to</span><input type="date" id="od-to" value="${esc(CARRY.ot)}"></label>
    <button type="submit" class="chip on">Apply dates</button>${on ? '<button type="button" id="od-clear" class="chip">Clear dates</button>' : ""}
    <span class="muted">${on ? `Showing orders entered ${CARRY.of ? "from " + esc(CARRY.of) : ""} ${CARRY.ot ? "to " + esc(CARRY.ot) : ""}. ` : "All order dates. "}${esc(note || "")}</span>${cov}</form>`;
}
export function wireDateFilter(ctx) {
  const form = ctx.content.querySelector("#od-form");
  if (!form) return;
  const go = (of, ot) => {
    if (of && ot && of > ot) [of, ot] = [ot, of];
    const o = {};
    for (const [k, v] of params(ctx)) o[k] = v;
    delete o.p;
    o.of = of; o.ot = ot;
    ctx.navigate(href(ctx.route.path || "home", o));
  };
  form.addEventListener("submit", (e) => { e.preventDefault(); go(form.querySelector("#od-from").value, form.querySelector("#od-to").value); }, { signal: ctx.signal });
  // Apply automatically once both dates are filled in (the button still works for a one-sided range).
  let timer = null;
  for (const id of ["#od-from", "#od-to"]) {
    const inp = form.querySelector(id);
    inp.addEventListener("change", () => {
      clearTimeout(timer);
      const f = form.querySelector("#od-from").value, t = form.querySelector("#od-to").value;
      if (f && t && (f !== CARRY.of || t !== CARRY.ot)) timer = setTimeout(() => go(f, t), 400);
    }, { signal: ctx.signal });
  }
  ctx.signal.addEventListener("abort", () => clearTimeout(timer));
  const clr = form.querySelector("#od-clear");
  if (clr) clr.addEventListener("click", () => go("", ""), { signal: ctx.signal });
}

export function notice(el, err, ctx) {
  el.innerHTML += `<p class="muted err">Could not load data: ${esc(err && err.message ? err.message : String(err))}</p>`;
  if (ctx && ctx.reportError) ctx.reportError(err);
}
