import { esc } from "@corvic/live";
import { usd, int, href, params, navHtml, notice, dateFilterHtml, wireDateFilter, dateOk } from "../lib/app.js";

// Order Holds view: same data, quarter scope, week-ending buckets, region filter and equipment-revenue
// calculation as the Equipment revenue page (eqdash.EQ_USD = equipment + kit/container lines + EQ discounts, no software).
const NP = "NO PROMISE DATE";
const LIMIT = 1000;
const REGION_ORDER = ["North America", "Latin America", "Europe", "Middle East", "Africa", "APAC", "Unassigned"];
let rgOpen = false;

const SQL = `SELECT e.SLICE, e.HEADER_ID, e.ORDER_NUMBER, coalesce(e.CUSTOMER_NAME, '(Gap)') AS CUSTOMER_NAME,
  coalesce(e.OPERATING_UNIT, '') AS OPERATING_UNIT, coalesce(g.REGION, 'Unassigned') AS REGION, coalesce(e.CUST_PO_NUMBER, '') AS CUST_PO_NUMBER,
  e.SO_TYPE, e.CLASS, CAST(e.WEEK_ENDING AS VARCHAR) AS WEEK_ENDING, e.IN_QUARTER, coalesce(e.EQ_USD, 0) AS AMT,
  CAST(e.ORDER_PROMISE_DT AS VARCHAR) AS ORDER_PROMISE_DT,
  CAST(e.QTR_START AS VARCHAR) AS QTR_START, CAST(e.QTR_END AS VARCHAR) AS QTR_END, CAST(e.TODAY AS VARCHAR) AS TODAY, CAST(od.ORDER_DATE AS VARCHAR) AS ORDER_DATE
  FROM eqdash e LEFT JOIN regions g ON g.HEADER_ID = e.HEADER_ID LEFT JOIN odates od ON od.HEADER_ID = e.HEADER_ID WHERE coalesce(e.EQ_USD, 0) <> 0`;
// Holds on the order's equipment-revenue lines (open / planned slice). Line holds already include the header holds.
const HOLD_SQL = `SELECT e.HEADER_ID, h.HOLDS, count(DISTINCT e.LINE_ID) AS N, sum(e.LINE_USD) AS USD
  FROM eqlines e JOIN (SELECT LINE_ID, any_value(HOLDS) AS HOLDS FROM lines WHERE coalesce(HOLDS, '') <> '' GROUP BY LINE_ID) h ON h.LINE_ID = e.LINE_ID
  WHERE e.SLICE = 'PLANNED' GROUP BY e.HEADER_ID, h.HOLDS`;
const HDR_SQL = `SELECT HEADER_ID, ORDER_HOLDS FROM orders WHERE coalesce(ORDER_HOLDS, '') <> ''`;

const CATS = [
  { key: "DF", label: "Design / Frequency Hold" },
  { key: "ASO", label: "ASO" },
  { key: "FIN", label: "Financial Hold" },
  { key: "OTH", label: "Other Holds" },
];
const CAT_LABEL = Object.fromEntries(CATS.map((c) => [c.key, c.label]));

// Hold-name groups (case-insensitive). Anything else is an "Other" hold.
const isDesign = (n) => /design|frequency/i.test(n);
const isFinancial = (n) => /^cash in advance/i.test(n) || /^financial/i.test(n);
const nameGroup = (n) => (isDesign(n) ? "DF" : isFinancial(n) ? "FIN" : "OTH");

function isoDate(d) { return d.toISOString().slice(0, 10); }
function friOnOrAfter(iso) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7));
  return isoDate(d);
}
function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}
function md(iso) { return iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}` : ""; }
function bucket(r) { return r.CLASS === "UNKNOWN" ? "UNKNOWN" : r.SO_TYPE; }
const splitHolds = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);

export default async function render(ctx) {
  ctx.content.innerHTML = `${navHtml(ctx)}<main><p class="muted">Loading\u2026</p></main>`;
  const sp = params(ctx);
  const dK = sp.get("k") || "", dB = sp.get("b") || "", dW = sp.get("w") || "";
  const dR = sp.get("dr") || "", dO = sp.get("do") || "";
  const npOn = sp.get("np") === "1";
  const rgParam = (sp.get("rg") || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);

  let allRows, holdRows, hdrRows;
  try {
    [allRows, holdRows, hdrRows] = await Promise.all([
      ctx.db.rows(SQL, [], ctx.signal), ctx.db.rows(HOLD_SQL, [], ctx.signal), ctx.db.rows(HDR_SQL, [], ctx.signal),
    ]);
  } catch (err) {
    if (ctx.signal.aborted) return;
    notice(ctx.content.querySelector("main"), err, ctx);
    return;
  }
  if (ctx.signal.aborted) return;

  // ---- holds per sales order -------------------------------------------------
  const info = new Map(); // HEADER_ID -> { names:Set, lines, lineUsd, hdr:Set }
  const infoOf = (id) => { const k = Number(id); if (!info.has(k)) info.set(k, { names: new Set(), lines: 0, lineUsd: 0, hdr: new Set() }); return info.get(k); };
  for (const h of holdRows) {
    const o = infoOf(h.HEADER_ID);
    splitHolds(h.HOLDS).forEach((n) => o.names.add(n));
    o.lines += Number(h.N) || 0; o.lineUsd += Number(h.USD) || 0;
  }
  for (const h of hdrRows) {
    const o = infoOf(h.HEADER_ID);
    splitHolds(h.ORDER_HOLDS).forEach((n) => { o.names.add(n); o.hdr.add(n); });
  }

  // ---- regions / filter ------------------------------------------------------
  const regionSet = new Map();
  for (const r of allRows) regionSet.set(r.REGION.toLowerCase(), r.REGION);
  const regions = [...regionSet.values()].sort((a, b) => {
    const ia = REGION_ORDER.indexOf(a), ib = REGION_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const rgList = regions.filter((x) => rgParam.includes(x.toLowerCase()));
  const rgSel = rgList.join(",");
  const rgDisp = rgList.join(", ");
  const rgSet = new Set(rgList.map((x) => x.toLowerCase()));
  const rows = allRows.filter((r) => (!rgList.length || rgSet.has(r.REGION.toLowerCase())) && dateOk(r.ORDER_DATE));

  const today = rows.length ? rows[0].TODAY : (allRows.length ? allRows[0].TODAY : isoDate(new Date()));
  const qs = rows.length ? rows[0].QTR_START : (allRows.length ? allRows[0].QTR_START : today.slice(0, 8) + "01");
  const qe = rows.length ? rows[0].QTR_END : (allRows.length ? allRows[0].QTR_END : today);
  for (const r of rows) {
    const p = r.ORDER_PROMISE_DT || "";
    r.INQ = !!p && p >= qs && p <= qe;
  }
  const curWe = friOnOrAfter(today);
  const weeks = [];
  for (let w = friOnOrAfter(qs); ; w = addDays(w, 7)) {
    weeks.push(w);
    if (w >= qe || weeks.length > 20) break;
  }
  const lastWe = weeks[weeks.length - 1];
  const qLabel = `Q${Math.floor(((Number(qs.slice(5, 7)) + 5) % 12) / 3) + 1} ${qs.slice(0, 4)}`;
  const beyondWk = (r) => r.CLASS !== NP && r.CLASS !== "UNKNOWN" && !!r.WEEK_ENDING && r.WEEK_ENDING > lastWe;
  // same scope + week logic as the Equipment revenue page (Backlog / ASO only; Gap orders are not part of this view)
  const inScope = (r, w) => {
    const b = bucket(r);
    if (b !== "BACKLOG" && b !== "ASO") return false;
    const incl = r.INQ || (r.CLASS === NP && npOn);
    if (!incl) return false;
    if (!w || w === "ALL" || w === "QTR") return true;
    if (w === "AFTER") return beyondWk(r);
    return r.INQ && !beyondWk(r) && r.WEEK_ENDING === w;
  };

  // ---- order-level primary risk category (precedence: Design/Frequency > ASO > Financial > Other) ----
  const held = [];
  for (const r of rows) {
    if (r.SLICE !== "PLANNED") continue; // revenue still to ship; shipped revenue cannot be at risk
    const o = info.get(Number(r.HEADER_ID));
    if (!o || !o.names.size) continue;
    const b = bucket(r);
    if (b !== "BACKLOG" && b !== "ASO") continue;
    const groups = new Set([...o.names].map(nameGroup));
    r.CAT = groups.has("DF") ? "DF" : (b === "ASO" ? "ASO" : (groups.has("FIN") ? "FIN" : "OTH"));
    r.NAMES = [...o.names].sort();
    r.INFO = o;
    held.push(r);
  }
  const sumOf = (arr) => arr.reduce((a, r) => a + r.AMT, 0);
  const nOf = (arr) => new Set(arr.map((r) => r.HEADER_ID)).size;
  const sel = (w, f) => held.filter((r) => inScope(r, w) && (!f || f(r)));
  const allEq = (w, f) => rows.filter((r) => inScope(r, w) && (!f || f(r)));

  const cur = { np: npOn ? "1" : "", rg: rgSel };
  const linkTo = (over) => href("holds", { ...cur, ...over });
  const amtLink = (arr, over, cls) => (arr.length
    ? `<a href="${esc(linkTo(over))}" title="Show the sales orders and their holds">${usd(sumOf(arr))}</a>${cls === "count" ? ` <small class="muted">${int(nOf(arr))} ord.</small>` : ""}`
    : '<span class="muted">\u2013</span>');

  // ---- KPIs --------------------------------------------------------------------
  const q = (k) => sel("QTR", k === "ALL" ? null : (r) => r.CAT === k);
  const kpi = (label, arr, over, hint) => `<div class="kpi held"><span>${esc(label)}</span><b>${arr.length ? `<a href="${esc(linkTo(over))}">${usd(sumOf(arr))}</a>` : usd(0)}</b><small class="muted">${int(nOf(arr))} orders${hint ? " \u00b7 " + esc(hint) : ""}</small></div>`;
  const eqQtr = sumOf(allEq("QTR"));
  const totHeld = q("ALL");
  const kpis = `<section class="kpis">
    ${kpi("Design / Frequency Hold Revenue at Risk", q("DF"), { k: "DF", w: "QTR" })}
    ${kpi("ASO Revenue at Risk", q("ASO"), { k: "ASO", w: "QTR" }, "ASO orders on hold")}
    ${kpi("Financial Hold Revenue at Risk", q("FIN"), { k: "FIN", w: "QTR" })}
    ${kpi("Other Holds", q("OTH"), { k: "OTH", w: "QTR" }, "any other hold")}
    ${kpi("Total Hold Revenue at Risk", totHeld, { k: "ALL", w: "QTR" }, `${eqQtr ? (100 * sumOf(totHeld) / eqQtr).toFixed(1) : "0.0"}% of ${usd(eqQtr)} equipment revenue in scope`)}</section>`;

  // ---- weekly matrix -----------------------------------------------------------
  const weekHead = weeks.map((w) => {
    const st = w < curWe ? "closed" : (w === curWe ? "current" : "plan");
    return `<th class="n${w === curWe ? " cur" : ""}">${md(w)}<br><small class="muted">${st}</small></th>`;
  }).join("");
  const cols = [...weeks, "QTR", "AFTER"];
  const colCls = (w) => (w === curWe ? " cur" : "");
  const plainRow = (label, f, cls) => `<tr class="${cls || ""}"><th>${label}</th>${cols.map((w) => {
    const arr = allEq(w, f);
    return `<td class="n${colCls(w)}${w === "QTR" ? " strong" : (w === "AFTER" ? " muted" : "")}">${arr.length || w === "QTR" ? usd(sumOf(arr)) : "\u2013"}</td>`;
  }).join("")}</tr>`;
  const heldRow = (label, f, over, cls) => `<tr class="${cls || ""}"><th>${label}</th>${cols.map((w) => {
    const arr = sel(w, f);
    return `<td class="n${colCls(w)}${arr.length ? " hcell" : ""}${w === "QTR" ? " strong" : (w === "AFTER" ? " muted" : "")}">${amtLink(arr, { ...over, w }, "count")}</td>`;
  }).join("")}</tr>`;
  const basisSection = (b, title) => `<tbody><tr class="sect"><td colspan="${weeks.length + 3}">${esc(title)}</td></tr>
    ${plainRow(`${b === "ASO" ? "ASO" : "Backlog"} equipment revenue`, (r) => bucket(r) === b)}
    ${heldRow("\u26a0 Orders on hold (open revenue)", (r) => r.SO_TYPE === b, { b, k: "ALL" }, "heldtot")}
    ${CATS.map((c) => heldRow(`<span class="catdot c-${c.key}"></span>${esc(c.label)}`, (r) => bucket(r) === b && r.CAT === c.key, { b, k: c.key }, "catrow")).join("")}</tbody>`;
  const riskSection = `<tbody><tr class="sect"><td colspan="${weeks.length + 3}">TOTAL \u2014 Backlog + ASO: revenue at risk by primary category (each order counted once)</td></tr>
    ${plainRow("Total equipment revenue (Backlog + ASO)", null, "total")}
    ${CATS.map((c) => heldRow(`<span class="catdot c-${c.key}"></span>${esc(c.label)}`, (r) => r.CAT === c.key, { k: c.key }, "catrow")).join("")}
    ${heldRow("Total revenue at risk", null, { k: "ALL" }, "total heldtot")}</tbody>`;

  // ---- region / operating unit view ----------------------------------------------
  const riskTable = (title, keyOf, keys, param, dispOf) => {
    const line = (label, f, over, cls) => {
      const eq = sumOf(allEq("QTR", f));
      const cells = CATS.map((c) => { const arr = sel("QTR", (r) => (!f || f(r)) && r.CAT === c.key); return `<td class="n${arr.length ? " hcell" : ""}">${amtLink(arr, { ...over, k: c.key, w: "QTR" })}</td>`; }).join("");
      const tot = sel("QTR", f);
      return `<tr class="${cls || ""}"><th>${label}</th>${cells}<td class="n strong${tot.length ? " hcell" : ""}">${amtLink(tot, { ...over, k: "ALL", w: "QTR" })}</td>
        <td class="n">${usd(eq)}</td><td class="n">${eq ? (100 * sumOf(tot) / eq).toFixed(1) + "%" : "\u2013"}</td></tr>`;
    };
    return `<section class="card"><h2>${esc(title)}</h2>
      <div class="tablewrap"><table class="grid summary riskgrid"><thead><tr><th>${param === "dr" ? "Region" : "Operating Unit"}</th>${CATS.map((c) => `<th class="n">${esc(c.key === "DF" ? "Design/Frequency Hold" : c.key === "FIN" ? "Financial Hold" : c.label)}</th>`).join("")}
        <th class="n">Total Risk</th><th class="n">Equipment revenue in scope</th><th class="n">% at risk</th></tr></thead><tbody>
        ${keys.map((k) => line(esc(dispOf(k)), (r) => keyOf(r) === k, { [param]: k })).join("")}
        ${line("Company Total Revenue at Risk", null, {}, "total")}</tbody></table></div></section>`;
  };
  const scoped = rows.filter((r) => inScope(r, "QTR"));
  const regKeys = [...new Set(scoped.map((r) => r.REGION))].sort((a, b) => {
    const ia = REGION_ORDER.indexOf(a), ib = REGION_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const ouKeys = [...new Set(scoped.map((r) => r.OPERATING_UNIT))].sort();
  const regionCard = riskTable("Revenue at risk by Region", (r) => r.REGION, regKeys, "dr", (k) => k);
  const ouCard = riskTable("Revenue at risk by Operating Unit", (r) => r.OPERATING_UNIT, ouKeys, "do", (k) => k || "(none)");

  // ---- drill-down ------------------------------------------------------------
  let drill = "";
  if (dK) {
    const f = (r) => (!dB || dB === "ALL" || bucket(r) === dB) && (dK === "ALL" || r.CAT === dK) && (!dR || r.REGION === dR) && (!dO || r.OPERATING_UNIT === dO);
    const list = sel(dW || "QTR", f).sort((a, b) => Math.abs(b.AMT) - Math.abs(a.AMT));
    const what = [dK === "ALL" ? "All holds (total revenue at risk)" : CAT_LABEL[dK] || dK,
      dB && dB !== "ALL" ? (dB === "ASO" ? "ASO orders" : "Backlog orders") : "Backlog + ASO",
      !dW || dW === "QTR" ? `quarter ${qLabel}` : dW === "AFTER" ? `planned beyond week ending ${lastWe}` : `week ending ${dW}`,
      dR ? `region ${dR}` : "", dO ? `operating unit ${dO}` : "",
      rgList.length ? `${rgList.length > 1 ? "regions" : "region"} ${rgDisp}` : ""].filter(Boolean).join(" \u00b7 ");
    const holdTags = (r) => r.NAMES.map((n) => `<span class="tag hold g-${nameGroup(n)}" title="${esc(CAT_LABEL[nameGroup(n)] || "")}${r.INFO.hdr.has(n) ? " \u00b7 order header hold" : " \u00b7 line hold"}">${esc(n)}</span>`).join(" ");
    const body = list.slice(0, LIMIT).map((r) => `<tr class="heldrow">
      <td><a href="${esc(href("lines", { order: r.ORDER_NUMBER }))}" title="Open this order's lines and their holds">${esc(r.ORDER_NUMBER)}</a></td>
      <td>${esc(r.CUSTOMER_NAME)}</td><td>${esc(r.REGION)} / ${esc(r.OPERATING_UNIT || "(none)")}</td>
      <td>${esc(r.ORDER_PROMISE_DT || "")}</td><td>${esc(r.WEEK_ENDING || "")}</td>
      <td>${holdTags(r)}</td>
      <td><span class="tag cat c-${r.CAT}">${esc(CAT_LABEL[r.CAT])}</span></td>
      <td>${bucket(r) === "ASO" ? "ASO" : "Backlog"}</td>
      <td class="n strong">${usd(r.AMT)}</td>
      <td class="n">${int(r.INFO.lines)}</td><td class="n">${usd(r.INFO.lineUsd)}</td>
      <td>${r.INFO.hdr.size ? `Header: ${esc([...r.INFO.hdr].sort().join(", "))}` : "Line-level holds only"}</td>
      <td>${esc(r.CUST_PO_NUMBER)}</td></tr>`).join("");
    drill = `<section class="card" id="drill"><h2>Held sales orders</h2>
      <p class="muted">${esc(what)} \u2014 <b>${usd(sumOf(list))}</b> equipment revenue from ${int(nOf(list))} sales orders. Each order is listed once, under its primary category; all of its holds are shown.
        <a href="${esc(href("holds", cur))}">Close</a> \u00b7 <button type="button" id="dr-copy" class="chip">Copy rows (paste into Excel)</button> <span id="dr-status" class="muted"></span>${list.length > LIMIT ? ` Showing the largest ${int(LIMIT)}.` : ""}</p>
      <div class="tablewrap tall"><table class="grid"><thead><tr><th>Sales order</th><th>Customer</th><th>Region / Operating Unit</th><th>Order promise date</th><th>Week ending</th>
        <th>Hold name(s)</th><th>Primary hold / risk category</th><th>Backlog / ASO</th><th class="n">Equipment revenue (counted once)</th><th class="n">Held equipment lines</th><th class="n">Held lines revenue</th><th>Hold details</th><th>Customer PO #</th></tr></thead>
        <tbody>${body || '<tr><td colspan="13" class="muted">No sales orders in this amount.</td></tr>'}</tbody></table></div></section>
      <template id="dr-data">${esc(JSON.stringify(list.map((r) => [r.ORDER_NUMBER, r.CUSTOMER_NAME, `${r.REGION} / ${r.OPERATING_UNIT || "(none)"}`, r.ORDER_PROMISE_DT || "", r.WEEK_ENDING || "", r.NAMES.join("; "), CAT_LABEL[r.CAT], bucket(r) === "ASO" ? "ASO" : "Backlog", Math.round(r.AMT), r.INFO.lines])))}</template>`;
  }

  const rgSummary = !rgList.length ? "All regions (Company Total)" : (rgList.length === 1 ? rgList[0] : `${rgList.length} regions: ${rgDisp}`);
  const regionControl = `<div class="slicer"><span>Region (tick one or more)</span><details class="msel" id="rg-ms"${rgOpen ? " open" : ""}><summary>${esc(rgSummary)}</summary><div class="msel-panel">
    <label class="msel-opt"><input type="checkbox" id="rg-all"${rgList.length ? "" : " checked"}> All regions (Company Total)</label>
    ${regions.map((x) => `<label class="msel-opt"><input type="checkbox" class="rg-cb" value="${esc(x)}"${rgSet.has(x.toLowerCase()) ? " checked" : ""}> ${esc(x)}</label>`).join("")}</div></details></div>`;

  const notes = `<section class="card"><h2>How this is calculated</h2><ul class="steps" style="list-style:disc">
    <li><b>Scope and revenue</b> are the same as the Equipment revenue page: ${esc(qLabel)} (order promise date ${esc(qs)} to ${esc(qe)}), week-ending Fridays, Backlog (PO \u2260 PENDING) and ASO (PO = PENDING), equipment revenue = equipment/hardware + kit/container lines that roll up to equipment + EQ discounts (negative). Software is excluded. Gap orders (no PO number / currency rate) are not part of this view.</li>
    <li><b>What counts as on hold</b>: a sales order with at least one active hold on its header or on an equipment-revenue line. Software-line holds are ignored. Revenue at risk is the order's <b>open (planned, not yet shipped)</b> equipment revenue, because shipped revenue can no longer be held; it sits in the same week as on the Equipment revenue page.</li>
    <li><b>Hold groups</b>: <i>Design / Frequency</i> = names containing Design or Frequency (Design Hold, Frequency Hold, Design/Frequency Hold, and combined names such as \u201cDesign Hold \u2026 Scheduling Hold\u201d). <i>Financial</i> = Cash in Advance - Deliv Pick Hold, Financial - Deliv Ship Hold. <i>Other</i> = every other hold name (e.g. Scheduling, Await Customer PO, Credit Check Failure, Letter of Credit, Export Compliance).</li>
    <li><b>One category per order</b> (applied to the whole sales order, never per line): 1) Design / Frequency, 2) ASO (the order is an ASO and has any hold), 3) Financial, 4) Other holds. So Design + Financial - Deliv Ship Hold = Design / Frequency; an ASO with a Financial hold = ASO; a Backlog order with only a Cash in Advance hold = Financial. The four categories add up exactly to Total Hold Revenue at Risk; no order revenue is counted twice, however many held lines or holds it has.</li>
    <li>Drill-down lists every hold of the order (colour = hold group; header holds are marked in the details column) while counting its equipment revenue once. Click an order number to open its lines and their holds.</li></ul></section>`;

  ctx.content.innerHTML = `${navHtml(ctx)}<main>
    <h1>Clear to Pick \u2014 order holds: equipment revenue at risk</h1>
    <p class="muted">${esc(qLabel)} (promise date ${esc(qs)} to ${esc(qe)} inclusive) \u00b7 as of ${esc(today)} \u00b7 weeks end on Friday \u00b7 ${rgList.length ? `${rgList.length > 1 ? "regions" : "region"} ${esc(rgDisp)}` : "all regions"} \u00b7 equipment revenue only (software excluded) \u00b7 click any amount to see its sales orders and holds.</p>
    <div id="ctl" class="slicers so-filter">${regionControl}
      <a class="chip" href="${esc(href("holds", { np: npOn ? "" : "1", rg: cur.rg }))}">${npOn ? "Exclude NO PROMISE DATE from the quarter total" : "Include NO PROMISE DATE in the quarter total"}</a></div>
    ${dateFilterHtml("Filters the orders in every figure below.")}
    ${kpis}
    <section class="card"><h2>Backlog and ASO equipment revenue by week ending \u2014 orders on hold highlighted</h2>
      <p class="muted">Amber cells are open equipment revenue of orders that currently have holds (with the number of orders); click one to see the sales orders and their holds. Each order sits in exactly one category.</p>
      <div class="tablewrap"><table class="grid matrix">
        <thead><tr><th>Week ending</th>${weekHead}<th class="n">Quarter total</th><th class="n">Of which beyond ${md(lastWe)}</th></tr></thead>
        ${basisSection("BACKLOG", "BACKLOG \u2014 PO number \u2260 PENDING")}
        ${basisSection("ASO", "ASO \u2014 PO number = PENDING")}
        ${riskSection}
      </table></div></section>
    ${regionCard}
    ${ouCard}
    ${drill}
    ${notes}
  </main>`;

  wireDateFilter(ctx);
  const ms = ctx.content.querySelector("#rg-ms");
  if (ms) {
    ms.addEventListener("toggle", () => { rgOpen = ms.open; }, { signal: ctx.signal });
    document.addEventListener("click", (e) => {
      if (ms.open && !ms.contains(e.target)) { ms.open = false; rgOpen = false; }
    }, { signal: ctx.signal });
    ms.querySelectorAll(".rg-cb").forEach((cb) => cb.addEventListener("change", () => {
      const vals = [...ms.querySelectorAll(".rg-cb")].filter((c) => c.checked).map((c) => c.value);
      rgOpen = true;
      ctx.navigate(href("holds", { np: cur.np, rg: vals.join(",") }));
    }, { signal: ctx.signal }));
    const all = ms.querySelector("#rg-all");
    if (all) all.addEventListener("change", () => {
      rgOpen = true;
      ctx.navigate(href("holds", { np: cur.np }));
    }, { signal: ctx.signal });
  }

  const cp = ctx.content.querySelector("#dr-copy");
  if (cp) cp.addEventListener("click", async () => {
    const st = ctx.content.querySelector("#dr-status");
    let data = [];
    try { data = JSON.parse(ctx.content.querySelector("#dr-data").innerHTML.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&")); } catch (_) { data = []; }
    const head = ["Sales order", "Customer", "Region / Operating Unit", "Order promise date", "Week ending", "Hold name(s)", "Primary category", "Backlog / ASO", "Equipment USD", "Held lines"];
    const text = [head].concat(data).map((r) => r.map((c) => String(c == null ? "" : c).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\r\n");
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {
      try {
        const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select(); ok = document.execCommand("copy"); ta.remove();
      } catch (__) { ok = false; }
    }
    if (st) st.textContent = ok ? `Copied ${data.length} rows.` : "Clipboard is blocked in this view.";
  }, { signal: ctx.signal });
}
