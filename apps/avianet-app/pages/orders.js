import { esc } from "@corvic/live";
import {
  BUCKETS, usd, int, qty, aheadLate, aheadLateClass, weekEnding, href, params, slicerState,
  slicersHtml, wireSlicers, applySlicers, loadOrders, navHtml, notice, OTHER, OTHER_LABEL,
  dateFilterHtml, wireDateFilter, loadDateCoverage, dateOk, quarterOf, orderCat, CATS, FY_CAL,
} from "../lib/app.js";

const PAGE = 3000; // large enough to list every order in a date range on one page

export default async function render(ctx) {
  ctx.content.innerHTML = `${navHtml(ctx)}<main><p class="muted">Loading\u2026</p></main>`;
  const sp = params(ctx);
  const st = slicerState(sp);
  const wk = sp.get("wk") ? Number(sp.get("wk")) : null;
  const bKey = sp.get("b") || "";
  const cat = CATS.some((c) => c[0] === sp.get("cat")) ? sp.get("cat") : "";
  const sq = sp.get("sq") || "";
  const soRaw = (sp.get("so") || "").trim();
  const soTerms = soRaw.split(/[\s,;]+/).filter(Boolean);
  const page = Math.max(0, Number(sp.get("p") || 0) || 0);
  let orders;
  try {
    orders = await loadOrders(ctx);
  } catch (err) {
    if (ctx.signal.aborted) return;
    notice(ctx.content.querySelector("main"), err, ctx);
    return;
  }
  if (ctx.signal.aborted) return;
  await loadDateCoverage(ctx);
  if (ctx.signal.aborted) return;
  const shownInReport = orders.filter((o) => dateOk(o.ORDER_DATE)).length;

  let rows = applySlicers(orders, st);
  const bucket = BUCKETS.find((b) => b.key === bKey);
  if (wk != null) rows = rows.filter((o) => o.WEEK_NO === wk);
  if (cat) rows = rows.filter((o) => orderCat(o) === cat);
  if (sq) rows = rows.filter((o) => quarterOf(o.SHIP_WEEK_START) === sq);
  if (bucket) rows = rows.filter((o) => bucket.test(o.WEEK_NO));
  if (soTerms.length) rows = rows.filter((o) => soTerms.some((t) => String(o.ORDER_NUMBER).includes(t)));
  rows = rows.slice().sort((a, b) =>
    (a.WEEK_NO - b.WEEK_NO) ||
    String(weekEnding(a.SHIP_WEEK_START)).localeCompare(weekEnding(b.SHIP_WEEK_START)) ||
    String(a.OPERATING_UNIT).localeCompare(b.OPERATING_UNIT) ||
    String(a.CUSTOMER_NAME).localeCompare(b.CUSTOMER_NAME) ||
    String(a.ORDER_NUMBER).localeCompare(b.ORDER_NUMBER));

  const base = { ou: st.ou, cust: st.cust, wk: wk || "", b: bKey, so: soRaw, cat, sq };
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
  const filterBits = [];
  if (wk != null) filterBits.push(`ship week ${wk}`);
  if (bucket) filterBits.push(bucket.label);
  if (cat) filterBits.push(`${esc(CATS.find((c) => c[0] === cat)[1])} orders`);
  if (sq) { const fq = FY_CAL.find((q) => q.key === sq); filterBits.push(fq ? `${fq.fy} ${fq.q} (ship week ${fq.start} to ${fq.end})` : "after FY27"); }
  if (soTerms.length) filterBits.push(`sales order ${esc(soTerms.join(", "))}`);
  if (st.ou) filterBits.push(esc(st.ou));
  if (st.cust) filterBits.push(st.cust === OTHER ? OTHER_LABEL : esc(st.cust));

  const tr = slice.map((o) => {
    const sw = o.SOFTWARE_ONLY;
    const holds = o.ORDER_HOLDS;
    return `<tr>
      <td class="n">${o.WEEK_NO}</td>
      <td>${esc(sw ? "" : weekEnding(o.SHIP_WEEK_START))}</td>
      <td>${esc(o.ORDER_DATE || "")}</td>
      <td>${esc(o.OPERATING_UNIT)}</td>
      <td><a href="${esc(href("lines", { cust: o.CUSTOMER_NAME }))}">${esc(o.CUSTOMER_NAME)}</a></td>
      <td><a href="${esc(href("lines", { order: o.ORDER_NUMBER }))}">${esc(o.ORDER_NUMBER)}</a></td>
      <td><a href="${esc(href("allocation", { order: o.ORDER_NUMBER }))}">how allocated</a></td>
      <td class="n">${int(o.EQUIPMENT_LINES)}</td>
      <td class="n">${usd(o.EQ_COMMITTED_USD)}</td>
      <td class="n">${usd(o.EQ_UNCOMMITTED_USD)}</td>
      <td class="n">${usd(o.EQ_DISCOUNT_USD)}</td>
      <td>${esc(sw ? "" : o.SHIP_READY_DT || "")}</td>
      <td>${esc(o.EARLIEST_PROMISE_DT || "")}</td>
      <td class="n ${aheadLateClass(o.DAYS_LATE_VS_PROMISE)}">${esc(aheadLate(o.DAYS_LATE_VS_PROMISE))}</td>
      <td class="holds">${esc(holds)}</td>
      <td class="n">${int(o.LINES_TO_PURCHASE)}</td>
      <td class="n">${o.UNCOMMITTED_QTY ? qty(o.UNCOMMITTED_QTY) + " units / " + int(o.UNCOMMITTED_LINES) + " ln" : ""}</td>
      <td>${esc(o.ORDER_TYPE || "")}${sw ? ' <span class="tag">software only</span>' : ""}</td>
    </tr>`;
  }).join("");

  const pager = rows.length > PAGE
    ? `<div class="pager">${page > 0 ? `<a href="${esc(href("orders", { ...base, p: page - 1 }))}">\u2190 Previous</a>` : ""}
       <span>Rows ${page * PAGE + 1}\u2013${Math.min(rows.length, page * PAGE + PAGE)} of ${int(rows.length)}</span>
       ${(page + 1) * PAGE < rows.length ? `<a href="${esc(href("orders", { ...base, p: page + 1 }))}">Next \u2192</a>` : ""}</div>`
    : "";

  ctx.content.innerHTML = `${navHtml(ctx)}<main>
    <h1>Order grid</h1>
    <p class="muted">${int(rows.length)} orders${filterBits.length ? " \u00b7 " + filterBits.join(" \u00b7 ") : ""} \u00b7 sorted by ship week, then week-ending Friday.
      ${filterBits.length ? `<a href="orders">Clear filters</a>` : ""} Click a customer or sales order to open its lines.</p>
    <div class="slicers" id="dl-bar">
      <button type="button" id="dl-csv" class="chip on" ${rows.length ? "" : "disabled"}>\u2B07 Download CSV (${int(rows.length)} orders)</button>
      <button type="button" id="dl-copy" class="chip" ${rows.length ? "" : "disabled"}>Copy to clipboard (paste into Excel)</button>
      <span class="muted" id="dl-status">Exports all rows matching the current filters, not just this page.</span></div>
    <div id="dl-fallback" hidden></div>
    ${slicersHtml(orders, st, "orders")}
    ${dateFilterHtml("", shownInReport)}
    <form id="so-form" class="slicers so-filter">
      <label class="slicer"><span>Sales Order number</span>
        <input id="so-input" type="search" inputmode="numeric" autocomplete="off" placeholder="e.g. 4611529 (several: comma separated; partial ok)" value="${esc(soRaw)}" style="min-width:22rem"></label>
      <button type="submit" class="chip on">Filter</button>
      ${soRaw ? `<a class="chip" href="${esc(href("orders", { ...base, so: "", p: "" }))}">Clear order filter</a>` : ""}
    </form>
    ${pager}
    <div class="tablewrap tall"><table class="grid orders">
      <thead><tr><th class="n">Ship wk</th><th>W/E Friday</th><th>Order date</th><th>Operating Unit</th><th>Customer</th><th>Sales Order</th><th>Allocation</th>
        <th class="n">Equip. lines</th><th class="n">USD on-hand / committed</th><th class="n">USD supplier-uncommitted</th>
        <th class="n">EQ Discount</th><th>Ship-ready date</th><th>Earliest promised</th><th class="n">Days ahead / late</th>
        <th>Active header holds</th><th class="n">Lines to purchase</th><th class="n">Supplier-uncommitted supply</th><th>Order type</th></tr></thead>
      <tbody>${tr || '<tr><td colspan="18" class="muted">No orders match.</td></tr>'}</tbody></table></div>
    ${pager}
  </main>`;
  wireSlicers(ctx, "orders", { wk: wk || "", b: bKey, so: soRaw, cat, sq });
  wireDateFilter(ctx);
  const dlCols = [
    ["Ship week", (o) => o.WEEK_NO],
    ["Week ending Friday", (o) => (o.SOFTWARE_ONLY ? "" : weekEnding(o.SHIP_WEEK_START))],
    ["Order date", (o) => o.ORDER_DATE],
    ["Operating Unit", (o) => o.OPERATING_UNIT],
    ["Customer", (o) => o.CUSTOMER_NAME],
    ["Sales Order", (o) => o.ORDER_NUMBER],
    ["Equipment lines", (o) => o.EQUIPMENT_LINES],
    ["USD on-hand / committed", (o) => o.EQ_COMMITTED_USD],
    ["USD supplier-uncommitted", (o) => o.EQ_UNCOMMITTED_USD],
    ["EQ Discount USD", (o) => o.EQ_DISCOUNT_USD],
    ["Software USD", (o) => o.SOFTWARE_USD],
    ["Total USD", (o) => o.TOTAL_USD],
    ["Ship-ready date", (o) => (o.SOFTWARE_ONLY ? "" : o.SHIP_READY_DT)],
    ["Earliest promised date", (o) => o.EARLIEST_PROMISE_DT],
    ["Days late vs promise (negative = ahead)", (o) => o.DAYS_LATE_VS_PROMISE],
    ["Days ahead / late", (o) => aheadLate(o.DAYS_LATE_VS_PROMISE)],
    ["Active header holds", (o) => o.ORDER_HOLDS],
    ["Lines to purchase", (o) => o.LINES_TO_PURCHASE],
    ["Supplier-uncommitted units", (o) => o.UNCOMMITTED_QTY],
    ["Supplier-uncommitted lines", (o) => o.UNCOMMITTED_LINES],
    ["Order type", (o) => o.ORDER_TYPE],
    ["Software only", (o) => (o.SOFTWARE_ONLY ? "Y" : "N")],
  ];
  const buildText = (sep) => {
    const cell = (v) => {
      if (v == null) return "";
      const s = String(v);
      if (sep === "\t") return s.replace(/[\t\r\n]+/g, " ");
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [dlCols.map((c) => cell(c[0])).join(sep)]
      .concat(rows.map((o) => dlCols.map((c) => cell(c[1](o))).join(sep)))
      .join("\r\n");
  };
  const statusEl = ctx.content.querySelector("#dl-status");
  const fbEl = ctx.content.querySelector("#dl-fallback");
  const setStatus = (t) => { if (statusEl) statusEl.textContent = t; };
  const showFallback = (text, why) => {
    // Last resort when the browser blocks downloads/clipboard: show the data to copy by hand.
    fbEl.hidden = false;
    fbEl.innerHTML = `<p class="muted">${esc(why)} Select all in the box below, copy, and paste into Excel (or a .csv file).</p>
      <textarea id="dl-text" readonly rows="8" style="width:100%;font-family:monospace;font-size:12px"></textarea>`;
    const ta = fbEl.querySelector("#dl-text");
    ta.value = text;
    ta.focus();
    ta.select();
  };
  const copyText = async (text) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* fall through */ }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (e) { return false; }
  };
  const dl = ctx.content.querySelector("#dl-csv");
  if (dl) {
    dl.addEventListener("click", async () => {
      const csv = buildText(",");
      const fname = `clear-to-pick-order-grid-${new Date().toISOString().slice(0, 10)}${filterBits.length ? "-filtered" : ""}.csv`;
      // Preferred: browser save dialog (works where the host allows file saves).
      try {
        if (window.showSaveFilePicker) {
          const h = await window.showSaveFilePicker({ suggestedName: fname, types: [{ description: "CSV", accept: { "text/csv": [".csv"] } }] });
          const w = await h.createWritable();
          await w.write("\uFEFF" + csv);
          await w.close();
          setStatus(`Saved ${fname}.`);
          return;
        }
      } catch (e) {
        if (e && e.name === "AbortError") return;
        /* blocked in a sandbox: fall back */
      }
      try {
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fname;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch (e) { /* ignore */ }
      // Downloads may be silently blocked by the host page, which cannot be detected; always offer the copy route.
      const ok = await copyText(buildText("\t"));
      if (ok) setStatus(`If no file was saved (your browser/host blocked the download), the ${int(rows.length)} rows were copied to your clipboard instead: paste into Excel.`);
      else showFallback(buildText("\t"), "The download may have been blocked by the host page.");
    }, { signal: ctx.signal });
  }
  const cp = ctx.content.querySelector("#dl-copy");
  if (cp) {
    cp.addEventListener("click", async () => {
      const tsv = buildText("\t");
      const ok = await copyText(tsv);
      if (ok) setStatus(`Copied ${int(rows.length)} rows + header to the clipboard. Paste into Excel or Google Sheets.`);
      else showFallback(tsv, "Clipboard access is blocked here.");
    }, { signal: ctx.signal });
  }
  const form = ctx.content.querySelector("#so-form");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const v = ctx.content.querySelector("#so-input").value.trim();
      ctx.navigate(href("orders", { ...base, so: v, p: "" }));
    }, { signal: ctx.signal });
  }
}
