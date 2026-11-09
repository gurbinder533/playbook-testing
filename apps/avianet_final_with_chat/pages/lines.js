import { esc } from "@corvic/live";
import { usd, int, qty, aheadLate, aheadLateClass, href, params, navHtml, notice, dateFilterHtml, wireDateFilter, dateWhere } from "../lib/app.js";

const LIMIT = 1500;

export default async function render(ctx) {
  ctx.content.innerHTML = `${navHtml(ctx)}<main><p class="muted">Loading\u2026</p></main>`;
  const sp = params(ctx);
  const order = sp.get("order") || "";
  const cust = sp.get("cust") || "";
  if (!order && !cust) {
    ctx.content.innerHTML = `${navHtml(ctx)}<main><h1>Line view</h1><p class="muted">Open a sales order or customer from the <a href="orders">order grid</a>.</p></main>`;
    return;
  }
  const where = order ? "ORDER_NUMBER = ?" : "CUSTOMER_NAME = ?";
  const arg = [order || cust];
  // The order date range narrows a customer's orders; a specific sales order always opens.
  const dw = order ? { sql: "", args: [] } : dateWhere();
  const lwhere = where + (dw.sql ? ` AND HEADER_ID IN (SELECT HEADER_ID FROM odates WHERE 1 = 1${dw.sql})` : "");
  const larg = [...arg, ...dw.args];
  let lines, head, agg;
  try {
    [lines, head, agg] = await Promise.all([
      ctx.db.rows(`SELECT ORDER_NUMBER, CUSTOMER_NAME, OPERATING_UNIT, SHIP_SET, SECTION_NO, LINE_GROUP, SO_LINE_NUMBER,
          ITEM_NUMBER, ITEM_DESCRIPTION, QTY_ORDERED, QTY_OPEN, QTY_SUPPLY, USD_VALUE, SUPPLY_STATUS,
          SUBINV_OR_PO_OR_ISO, LOCATOR_OR_PO_LINE, CAST(SHIP_READY_DT AS VARCHAR) AS SHIP_READY_DT, SUPPLIER_COMMIT,
          CAST(PROMISE_DT AS VARCHAR) AS PROMISE_DT, DAYS_LATE_VS_PROMISE, HOLDS
        FROM lines WHERE ${lwhere}
        ORDER BY ${order ? "" : "ORDER_NUMBER, "}SECTION_NO, SHIP_SET, SO_LINE_SORT, SUB_NO LIMIT ${LIMIT}`, larg, ctx.signal),
      ctx.db.rows(`SELECT ORDER_NUMBER, CUSTOMER_NAME, OPERATING_UNIT, ORDER_TYPE, coalesce(ORDER_HOLDS,'') AS ORDER_HOLDS,
          SOFTWARE_ONLY, TOTAL_USD, CAST(ORDER_DATE AS VARCHAR) AS ORDER_DATE FROM orders LEFT JOIN odates USING (HEADER_ID) WHERE ${where} ORDER BY ORDER_NUMBER LIMIT 1`, arg, ctx.signal),
      ctx.db.rows(`SELECT count(*) AS n, count(DISTINCT ORDER_NUMBER) AS orders, sum(USD_VALUE) AS usd FROM lines WHERE ${lwhere}`, larg, ctx.signal),
    ]);
  } catch (err) {
    if (ctx.signal.aborted) return;
    notice(ctx.content.querySelector("main"), err, ctx);
    return;
  }
  if (ctx.signal.aborted) return;

  const total = agg[0]?.n ?? lines.length;
  const h = head[0];
  const title = order
    ? `Sales order ${esc(order)}${h ? " \u00b7 " + esc(h.CUSTOMER_NAME) : ""}`
    : `Customer: ${esc(cust)}`;
  const sub = order && h
    ? `${esc(h.OPERATING_UNIT)} \u00b7 ${esc(h.ORDER_TYPE || "")} \u00b7 <a href="${esc(href("lines", { cust: h.CUSTOMER_NAME }))}">all lines for this customer</a> \u00b7 <a href="${esc(href("allocation", { order }))}">how this order is allocated</a>${h.ORDER_HOLDS ? " \u00b7 Active header holds: " + esc(h.ORDER_HOLDS) : ""}`
    : `${int(agg[0]?.orders)} orders`;

  let lastSection = null;
  const names = { 1: "Equipment lines", 2: "Software lines", 3: "EQ discount lines" };
  const body = lines.map((l) => {
    let sep = "";
    if (l.SECTION_NO !== lastSection) {
      lastSection = l.SECTION_NO;
      sep = `<tr class="sect"><td colspan="15">${names[l.SECTION_NO] || "Other lines"}</td></tr>`;
    }
    const eq = l.SECTION_NO === 1;
    return `${sep}<tr>
      <td><a href="${esc(href("lines", { order: l.ORDER_NUMBER }))}">${esc(l.ORDER_NUMBER)}</a></td>
      <td>${esc(l.SHIP_SET || "")}</td><td>${esc(l.SO_LINE_NUMBER || "")}</td>
      <td>${esc(l.ITEM_NUMBER || "")}</td><td>${esc(l.ITEM_DESCRIPTION || "")}</td>
      <td class="n">${qty(l.QTY_ORDERED)}</td><td class="n">${eq ? qty(l.QTY_SUPPLY) : ""}</td>
      <td class="n">${usd(l.USD_VALUE)}</td><td>${esc(eq ? (l.SUPPLY_STATUS || "") : (l.SUPPLY_STATUS || ""))}</td>
      <td>${esc(l.SUBINV_OR_PO_OR_ISO || "")}</td><td>${esc(l.LOCATOR_OR_PO_LINE || "")}</td>
      <td>${esc(eq ? l.SHIP_READY_DT || "" : "")}</td><td class="c">${esc(eq ? l.SUPPLIER_COMMIT || "" : "")}</td>
      <td>${esc(l.PROMISE_DT || "")}</td>
      <td class="n ${aheadLateClass(l.DAYS_LATE_VS_PROMISE)}">${esc(eq ? aheadLate(l.DAYS_LATE_VS_PROMISE) : "")}</td>
      <td class="holds">${esc(l.HOLDS || "")}</td>
    </tr>`;
  }).join("");

  ctx.content.innerHTML = `${navHtml(ctx)}<main>
    <p><a href="orders">\u2190 Order grid</a> \u00b7 <a href="home">Summary</a></p>
    <h1>${title}</h1>
    <p class="muted">${sub}${order && h && h.ORDER_DATE ? ` · Order date ${esc(h.ORDER_DATE)}` : ""}</p>
    ${dateFilterHtml(order ? "A specific sales order always opens, whatever its order date." : "Narrows this customer's orders.")}
    <p class="muted">${int(total)} lines \u00b7 ${usd(agg[0]?.usd)} line value${total > LIMIT ? ` \u00b7 showing the first ${int(LIMIT)}` : ""}.
      Ordered by ship set, then SO line number; software lines follow the equipment lines. Holds = parent order header holds, then the line's own holds.</p>
    <div class="tablewrap tall"><table class="grid lines">
      <thead><tr><th>Sales Order</th><th>Ship set</th><th>SO line</th><th>Part number</th><th>Description</th>
        <th class="n">Qty ordered</th><th class="n">Qty available by supply</th><th class="n">Revenue (USD)</th><th>Supply status</th>
        <th>Subinventory / PO / ISO #</th><th>Locator / PO / ISO line</th><th>Ship-ready date</th><th class="c">Supplier commit</th>
        <th>Promised date</th><th class="n">Days ahead / late</th><th>Active holds (header, then line)</th></tr></thead>
      <tbody>${body || '<tr><td colspan="16" class="muted">No lines found.</td></tr>'}</tbody></table></div>
  </main>`;
  wireDateFilter(ctx);
}
