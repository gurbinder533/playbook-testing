import { esc } from "@corvic/live";
import { usd, int, qty, href, params, navHtml, notice, dateFilterHtml, wireDateFilter, dateWhere } from "../lib/app.js";

const LIMIT = 1500;

const STEPS = [
  ["Reserve to OH", "1", "Unreserved on-hand stock for the item and warehouse, taken in order of promise date"],
  ["Reserve to PO", "2", "Open PO supply for the item and warehouse (promised date, else need-by date), taken in order of promise date"],
  ["Buy", "3", "No stock or PO left: must be purchased (available after the item lead time)"],
];

function searchForm(val) {
  return `<form id="al-form" class="slicers so-filter">
    <label class="slicer"><span>Sales Order number</span>
      <input id="al-input" type="search" inputmode="numeric" autocomplete="off" placeholder="e.g. 2419667 (partial number lists matches)" value="${esc(val)}"></label>
    <button type="submit" class="chip on">Show allocation</button></form>${dateFilterHtml("Narrows the list of matching orders; a specific sales order always opens.")}`;
}

export default async function render(ctx) {
  ctx.content.innerHTML = `${navHtml(ctx)}<main><p class="muted">Loading\u2026</p></main>`;
  const sp = params(ctx);
  const order = (sp.get("order") || "").trim();
  const wire = () => {
    wireDateFilter(ctx);
    const f = ctx.content.querySelector("#al-form");
    if (f) f.addEventListener("submit", (e) => {
      e.preventDefault();
      ctx.navigate(href("allocation", { order: ctx.content.querySelector("#al-input").value.trim() }));
    }, { signal: ctx.signal });
  };

  const explain = `<div class="card"><h2>How the allocation works</h2>
    <p class="muted">Only <b>equipment</b> lines (stocked, shippable, purchasable items) are matched to supply. Each open quantity is filled step by step, in this order:</p>
    <ol class="steps">${STEPS.map((s) => `<li><b>${esc(s[0])}</b> \u2014 ${esc(s[2])}</li>`).join("")}</ol>
    <p class="muted">Allocated qty = MIN(remaining demand, supply quantity). A line split across several supplies has several rows (Sub No). The line's ship-ready date is the latest supply date among its rows, and the order's ship-ready date is the latest across its equipment lines.
    <b>Software, services, freight, EQ discount and model/kit lines are not allocated against inventory</b>: they are listed here for completeness with the reason.</p></div>`;

  if (!order) {
    ctx.content.innerHTML = `${navHtml(ctx)}<main><h1>Allocation by order</h1>
      <p class="muted">Enter a sales order (or open one from the <a href="orders">order grid</a>) to see every line and how it was allocated.</p>
      ${searchForm("")}${explain}</main>`;
    wire();
    return;
  }

  let lines, summ, head;
  try {
    [lines, summ, head] = await Promise.all([
      ctx.db.rows(`SELECT CATEGORY, SUPPLY_ALLOCATED, SO_LINE_NUMBER, SHIP_SET, SUB_NO, ITEM_NUMBER, ITEM_DESCRIPTION, ITEM_TYPE,
          LINE_STAGE, ALLOC_RULE, QTY_ORDERED, QTY_OPEN, SUPPLY_QTY_AT_TIME, QTY_ALLOCATED, REMAINING_DEMAND, UNIT_USD, USD_VALUE,
          SUBINV_OR_PO_OR_ISO, LOCATOR_OR_PO_LINE, CAST(SUPPLY_AVAILABLE_DT AS VARCHAR) AS SUPPLY_AVAILABLE_DT, SUPPLIER_UNCOMMITTED, TO_PURCHASE,
          CUSTOMER_NAME, OPERATING_UNIT, ORDER_TYPE, HOLDS
        FROM alloc WHERE ORDER_NUMBER = ? ORDER BY CAT_SORT, SHIP_SET, SO_LINE_SORT, SUB_NO LIMIT ${LIMIT}`, [order], ctx.signal),
      ctx.db.rows(`SELECT CATEGORY, SUPPLY_ALLOCATED, count(DISTINCT LINE_ID) AS n_lines, count(*) AS n_rows, sum(USD_VALUE) AS usd, sum(QTY_ALLOCATED) AS q
        FROM alloc WHERE ORDER_NUMBER = ? GROUP BY ALL ORDER BY min(CAT_SORT), SUPPLY_ALLOCATED DESC`, [order], ctx.signal),
      ctx.db.rows(`SELECT ORDER_NUMBER, CUSTOMER_NAME, OPERATING_UNIT, ORDER_TYPE, coalesce(ORDER_HOLDS,'') AS ORDER_HOLDS, TOTAL_USD, WEEK_NO,
          CAST(SHIP_READY_DT AS VARCHAR) AS SHIP_READY_DT FROM orders WHERE ORDER_NUMBER = ? LIMIT 1`, [order], ctx.signal),
    ]);
  } catch (err) {
    if (ctx.signal.aborted) return;
    notice(ctx.content.querySelector("main"), err, ctx);
    return;
  }
  if (ctx.signal.aborted) return;

  if (!lines.length) {
    let near = [];
    try {
      near = await ctx.db.rows(`SELECT ORDER_NUMBER, CUSTOMER_NAME, OPERATING_UNIT FROM orders LEFT JOIN odates USING (HEADER_ID) WHERE ORDER_NUMBER LIKE ?${dateWhere().sql} ORDER BY ORDER_NUMBER LIMIT 30`, [`%${order}%`, ...dateWhere().args], ctx.signal);
    } catch (e) { /* ignore */ }
    if (ctx.signal.aborted) return;
    ctx.content.innerHTML = `${navHtml(ctx)}<main><h1>Allocation by order</h1>${searchForm(order)}
      ${near.length ? `<p class="muted">No exact match for "${esc(order)}". Orders containing it:</p>
        <ul>${near.map((o) => `<li><a href="${esc(href("allocation", { order: o.ORDER_NUMBER }))}">${esc(o.ORDER_NUMBER)}</a> \u00b7 ${esc(o.CUSTOMER_NAME)} \u00b7 ${esc(o.OPERATING_UNIT)}</li>`).join("")}</ul>`
        : `<p class="muted">No open order lines found for "${esc(order)}".</p>`}</main>`;
    wire();
    return;
  }

  const h = head[0] || {};
  const f0 = lines[0];
  const cust = h.CUSTOMER_NAME || f0.CUSTOMER_NAME;
  const total = summ.reduce((a, s) => a + (s.usd || 0), 0);
  const nAll = summ.reduce((a, s) => a + Number(s.n_rows || 0), 0);
  const holds = h.ORDER_HOLDS || "";

  const sumRows = summ.map((s) => `<tr><td>${esc(s.CATEGORY)}</td><td>${s.SUPPLY_ALLOCATED ? "Yes \u2014 matched to supply" : "No"}</td>
    <td class="n">${int(s.n_lines)}</td><td class="n">${int(s.n_rows)}</td><td class="n">${usd(s.usd)}</td></tr>`).join("");

  let lastCat = null;
  const body = lines.map((l) => {
    let sep = "";
    if (l.CATEGORY !== lastCat) {
      lastCat = l.CATEGORY;
      sep = `<tr class="sect"><td colspan="17">${esc(l.CATEGORY)} lines</td></tr>`;
    }
    const al = l.SUPPLY_ALLOCATED;
    const flag = l.TO_PURCHASE ? ' <span class="tag">to purchase</span>' : (l.SUPPLIER_UNCOMMITTED ? ' <span class="tag">supplier uncommitted</span>' : "");
    return `${sep}<tr>
      <td>${esc(l.SHIP_SET || "")}</td><td>${esc(l.SO_LINE_NUMBER || "")}</td>
      <td>${esc(l.ITEM_NUMBER || "")}</td><td>${esc(l.ITEM_DESCRIPTION || "")}</td><td>${esc(l.ITEM_TYPE || "")}</td>
      <td class="n">${qty(l.QTY_ORDERED)}</td><td class="n">${qty(l.QTY_OPEN)}</td>
      <td>${al ? `${esc(l.LINE_STAGE)}${flag}` : '<span class="muted">Not allocated</span>'}</td>
      <td class="n">${al ? int(l.SUB_NO) : ""}</td>
      <td class="n">${al ? qty(l.SUPPLY_QTY_AT_TIME) : ""}</td><td class="n">${al ? qty(l.QTY_ALLOCATED) : ""}</td>
      <td class="n">${al ? qty(l.REMAINING_DEMAND) : ""}</td>
      <td class="n">${usd(l.USD_VALUE)}</td>
      <td>${esc(al ? (l.SUBINV_OR_PO_OR_ISO || "") : "")}</td><td>${esc(al ? (l.LOCATOR_OR_PO_LINE || "") : "")}</td>
      <td>${esc(l.SUPPLY_AVAILABLE_DT || "")}</td>
      <td class="rule">${esc(l.ALLOC_RULE || "")}</td>
    </tr>`;
  }).join("");

  ctx.content.innerHTML = `${navHtml(ctx)}<main>
    <p><a href="orders">\u2190 Order grid</a> \u00b7 <a href="${esc(href("lines", { order }))}">Line view for this order</a></p>
    <h1>Allocation \u00b7 sales order ${esc(order)}</h1>
    <p class="muted">${esc(cust)} \u00b7 ${esc(h.OPERATING_UNIT || f0.OPERATING_UNIT || "")} \u00b7 ${esc(h.ORDER_TYPE || f0.ORDER_TYPE || "")}${h.SHIP_READY_DT ? ` \u00b7 order ship-ready ${esc(h.SHIP_READY_DT)} (week ${h.WEEK_NO})` : ""}${holds ? ` \u00b7 Active header holds: ${esc(holds)}` : ""}</p>
    ${searchForm(order)}
    <div class="card"><h2>Lines by type</h2>
      <div class="tablewrap"><table class="grid"><thead><tr><th>Line type</th><th>Allocated against supply?</th><th class="n">Lines</th><th class="n">Allocation rows</th><th class="n">Open value (USD)</th></tr></thead>
      <tbody>${sumRows}<tr class="total"><td>Total, all line types</td><td></td><td></td><td class="n">${int(nAll)}</td><td class="n">${usd(total)}</td></tr></tbody></table></div>
      <p class="muted">This tab shows every open line. The Summary and Order grid revenue count equipment, container equipment, EQ discount and software only, so their total for this order can be lower than the all-lines total here (services, freight and other lines are not in the ship-readiness revenue).</p></div>
    <p class="muted">${int(nAll)} allocation rows${nAll > LIMIT ? ` \u00b7 showing the first ${int(LIMIT)}` : ""}. Equipment lines have one row per supply used (Sub No), in the order the supply was consumed.</p>
    <div class="tablewrap tall"><table class="grid lines">
      <thead><tr><th>Ship set</th><th>SO line</th><th>Part number</th><th>Description</th><th>Item type</th>
        <th class="n">Qty ordered</th><th class="n">Qty open</th><th>Allocation step (line stage)</th><th class="n">Sub No</th>
        <th class="n">Supply qty</th><th class="n">Allocated qty</th><th class="n">Remaining demand</th><th class="n">Value (USD)</th>
        <th>Subinventory / PO / ISO #</th><th>Locator / PO / ISO line</th><th>Supply available</th><th>How it is allocated</th></tr></thead>
      <tbody>${body}</tbody></table></div>
    ${explain}
  </main>`;
  wire();
}
