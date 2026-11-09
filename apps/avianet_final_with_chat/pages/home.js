import { esc } from "@corvic/live";
import {
  BUCKETS, usd, compact, int, href, params, slicerState, slicersHtml, wireSlicers,
  applySlicers, loadOrders, navHtml, notice, dateFilterHtml, wireDateFilter, loadDateCoverage, dateOk, quarterOf, orderCat, CATS, FY_CAL,
} from "../lib/app.js";

const PALETTE = ["#2F6F8F", "#E08E2B", "#4DA67A", "#B35C9E", "#D1573F", "#7C8BA1", "#9A8F3C", "#3E4C9A"];

function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * p;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtStart(iso) {
  return iso ? `${MON[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}` : "";
}
// Monday that starts each ship week 1..12. Read from the orders (all orders, so labels do not move with the slicers);
// a week with no dated order is filled in from a known week (+7 days per week).
function weekStarts(orders) {
  const known = new Map();
  for (const o of orders) {
    if (o.SOFTWARE_ONLY || !o.SHIP_WEEK_START || o.WEEK_NO < 1 || o.WEEK_NO > 12) continue;
    if (!known.has(o.WEEK_NO) || o.SHIP_WEEK_START < known.get(o.WEEK_NO)) known.set(o.WEEK_NO, o.SHIP_WEEK_START);
  }
  const out = new Array(12).fill("");
  const anchor = [...known][0];
  for (let w = 1; w <= 12; w++) {
    if (known.has(w)) { out[w - 1] = known.get(w); continue; }
    if (!anchor) continue;
    const d = new Date(anchor[1] + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 7 * (w - anchor[0]));
    out[w - 1] = d.toISOString().slice(0, 10);
  }
  return out;
}

// Chart slots: current week + 11 weeks (default) or the Aviat fiscal quarters (toggle).
function buildSlots(rows, starts, mode, today, extra) {
  if (mode === "q") {
    const qs = FY_CAL.filter((q) => q.end >= today).map((q) => ({
      key: q.key, label: `${q.fy} ${q.q}`, sub: `${fmtStart(q.start)} \u2013 ${fmtStart(q.end)}`,
      link: { sq: q.key, ...extra }, test: (o) => quarterOf(o.SHIP_WEEK_START) === q.key,
      tip: `${q.fy} ${q.q} (${q.start} to ${q.end})`,
    }));
    if (rows.some((o) => quarterOf(o.SHIP_WEEK_START) === "BEYOND")) {
      qs.push({ key: "BEYOND", label: "After FY27", sub: "", link: { sq: "BEYOND", ...extra }, test: (o) => quarterOf(o.SHIP_WEEK_START) === "BEYOND", tip: "After FY27" });
    }
    return qs;
  }
  return Array.from({ length: 12 }, (_, i) => ({
    key: String(i + 1), label: `W${i + 1}`, sub: starts[i] ? fmtStart(starts[i]) : "",
    link: { wk: i + 1, ...extra }, test: (o) => o.WEEK_NO === i + 1,
    tip: `Week ${i + 1}${starts[i] ? ` (week starting ${starts[i]})` : ""}`,
  }));
}

function chartSvg(rows, st, slots, mode) {
  const n = slots.length;
  const ouTotals = new Map();
  const byWeek = slots.map(() => new Map());
  rows.forEach((o) => {
    const i = slots.findIndex((s) => s.test(o));
    if (i < 0) return;
    const m = byWeek[i];
    m.set(o.OPERATING_UNIT, (m.get(o.OPERATING_UNIT) || 0) + (o.TOTAL_USD || 0));
    ouTotals.set(o.OPERATING_UNIT, (ouTotals.get(o.OPERATING_UNIT) || 0) + Math.abs(o.TOTAL_USD || 0));
  });
  const ous = [...ouTotals].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  const color = (ou) => PALETTE[ous.indexOf(ou) % PALETTE.length];

  const pos = byWeek.map((m) => [...m.values()].filter((v) => v > 0).reduce((a, b) => a + b, 0));
  const neg = byWeek.map((m) => [...m.values()].filter((v) => v < 0).reduce((a, b) => a + b, 0));
  const tot = byWeek.map((m) => [...m.values()].reduce((a, b) => a + b, 0));
  const cum = []; tot.reduce((a, v, i) => (cum[i] = a + v), 0);

  const yMax = niceMax(Math.max(...pos, 1));
  const yMin = neg.some((v) => v < 0) ? -niceMax(Math.max(...neg.map((v) => -v))) : 0;
  const cMax = niceMax(Math.max(...cum, 1));
  const cMin = yMin < 0 ? (cMax * yMin) / yMax : 0;

  const W = 1000, H = 420, L = 76, R = 76, T = 18, B = 78;
  const pw = W - L - R, ph = H - T - B;
  const y = (v) => T + ph * (1 - (v - yMin) / (yMax - yMin));
  const yc = (v) => T + ph * (1 - (Math.max(v, cMin) - cMin) / (cMax - cMin));
  const step = pw / n, bw = Math.min(step * 0.62, 150);
  const x = (i) => L + step * i + (step - bw) / 2;

  let s = `<svg viewBox="0 0 ${W} ${H}" class="combo" role="img" aria-label="Revenue by ship ${mode === "q" ? "quarter" : "week"}, stacked by operating unit, with cumulative line">`;
  for (let k = 0; k <= 5; k++) {
    const v = yMin + ((yMax - yMin) * k) / 5;
    const vc = cMin + ((cMax - cMin) * k) / 5;
    s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/>`;
    s += `<text x="${L - 8}" y="${y(v) + 4}" class="ax" text-anchor="end">${compact(v)}</text>`;
    s += `<text x="${W - R + 8}" y="${y(v) + 4}" class="ax cum" text-anchor="start">${compact(vc)}</text>`;
  }
  s += `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" class="zero"/>`;
  slots.forEach((sl, i) => {
    let up = 0, down = 0;
    const parts = ous.filter((o) => byWeek[i].has(o));
    let bars = "";
    for (const ou of parts) {
      const v = byWeek[i].get(ou);
      if (!v) continue;
      const y0 = v > 0 ? y(up) : y(down);
      const y1 = v > 0 ? y(up + v) : y(down + v);
      if (v > 0) up += v; else down += v;
      bars += `<rect x="${x(i)}" y="${Math.min(y0, y1)}" width="${bw}" height="${Math.max(Math.abs(y0 - y1), 0.5)}" fill="${color(ou)}"><title>${esc(sl.tip)} \u00b7 ${esc(ou)}: ${usd(v)}</title></rect>`;
    }
    s += `<a href="${esc(href("orders", { ...sl.link, ou: st.ou }))}">${bars}<rect x="${x(i) - 4}" y="${T}" width="${bw + 8}" height="${ph}" fill="transparent"><title>${esc(sl.tip)}: ${usd(tot[i])} \u00b7 click for orders</title></rect></a>`;
    s += `<text x="${x(i) + bw / 2}" y="${H - B + 18}" class="ax" text-anchor="middle">${esc(sl.label)}</text>`;
    if (sl.sub) s += `<text x="${x(i) + bw / 2}" y="${H - B + 33}" class="ax wkstart" text-anchor="middle">${esc(sl.sub)}</text>`;
  });
  const pts = cum.map((v, i) => `${x(i) + bw / 2},${yc(v)}`).join(" ");
  s += `<polyline points="${pts}" class="cumline"/>`;
  cum.forEach((v, i) => { s += `<circle cx="${x(i) + bw / 2}" cy="${yc(v)}" r="3.5" class="cumdot"><title>Cumulative through ${esc(slots[i].tip)}: ${usd(v)}</title></circle>`; });
  s += mode === "q"
    ? `<text x="${L}" y="${H - 8}" class="axt">Ship quarter (Aviat fiscal calendar, quarters run Saturday to Friday) \u00b7 quarter of the week the order is ready to ship \u00b7 includes software-only orders</text>`
    : `<text x="${L}" y="${H - 8}" class="axt">Ship week (1 = current week; week 1 includes software-only orders) \u00b7 date under each week = week starting (Monday)</text>`;
  s += `<text x="${W - R}" y="${H - 8}" class="axt cum" text-anchor="end">Cumulative revenue (right axis)</text>`;
  s += "</svg>";
  const legend = ous.map((o) => `<span class="lg"><i style="background:${color(o)}"></i>${esc(o)}</span>`).join("") +
    `<span class="lg"><i class="line"></i>Cumulative revenue</span>`;
  return s + `<div class="legend">${legend}</div>`;
}

function summaryTable(rows, st, extra) {
  const sum = (a, f) => a.reduce((t, o) => t + (f(o) || 0), 0);
  const line = (label, a, key) => {
    const c = sum(a, (o) => o.EQ_COMMITTED_USD), u = sum(a, (o) => o.EQ_UNCOMMITTED_USD);
    const d = sum(a, (o) => o.EQ_DISCOUNT_USD), sw = sum(a, (o) => o.SOFTWARE_USD);
    const t = sum(a, (o) => o.TOTAL_USD);
    const link = key
      ? `<a href="${esc(href("orders", { b: key, ou: st.ou, ...extra }))}">${label}</a>`
      : `<a href="${esc(href("orders", { ou: st.ou, ...extra }))}">${label}</a>`;
    return `<tr class="${key ? "" : "total"}"><th>${link}</th><td class="n">${int(a.length)}</td>
      <td class="n">${usd(c)}</td><td class="n">${usd(u)}</td><td class="n">${usd(d)}</td>
      <td class="n">${usd(sw)}</td><td class="n strong">${usd(t)}</td></tr>`;
  };
  return `<div class="tablewrap"><table class="grid summary">
    <thead>
      <tr><th rowspan="2">Ship window</th><th rowspan="2" class="n">Orders</th>
        <th colspan="2" class="n grp">Equipment (USD)</th><th rowspan="2" class="n">EQ Discount</th>
        <th rowspan="2" class="n">Software</th><th rowspan="2" class="n">Total</th></tr>
      <tr><th class="n sub">On-hand / committed</th><th class="n sub">Supplier-uncommitted</th></tr>
    </thead><tbody>
    ${BUCKETS.map((b) => line(b.label, rows.filter((o) => b.test(o.WEEK_NO)), b.key)).join("")}
    ${line("Total", rows, null)}
    </tbody></table></div>`;
}

export default async function render(ctx) {
  ctx.content.innerHTML = `${navHtml(ctx)}<main><p class="muted">Loading\u2026</p></main>`;
  const sp = params(ctx);
  const st = slicerState(sp);
  st.cust = ""; // the top-5 customer filter is not part of the Summary page
  const cat = CATS.some((c) => c[0] === sp.get("cat")) ? sp.get("cat") : "";
  const mode = sp.get("cv") === "q" ? "q" : "w";
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
  const base = applySlicers(orders, st);
  const rows = cat ? base.filter((o) => orderCat(o) === cat) : base;
  const total = rows.reduce((t, o) => t + (o.TOTAL_USD || 0), 0);
  const w1 = rows.filter((o) => o.WEEK_NO === 1).reduce((t, o) => t + (o.TOTAL_USD || 0), 0);
  const w12 = rows.filter((o) => o.WEEK_NO >= 1 && o.WEEK_NO <= 12).reduce((t, o) => t + (o.TOTAL_USD || 0), 0);
  const inChart = rows.filter((o) => o.WEEK_NO >= 1 && o.WEEK_NO <= 12).length;
  const afterChart = rows.filter((o) => o.WEEK_NO > 12).length;
  const late = rows.filter((o) => (o.DAYS_LATE_VS_PROMISE || 0) > 0).length;
  const today = new Date().toISOString().slice(0, 10);
  const extra = cat ? { cat } : {};
  const slots = buildSlots(rows, weekStarts(orders), mode, today, extra);

  const catCount = (k) => base.filter((o) => orderCat(o) === k).length;
  const catChip = (label, k, n) => `<a class="chip${cat === k ? " on" : ""}" href="${esc(href("home", { ou: st.ou, cat: k, cv: mode === "q" ? "q" : "" }))}">${esc(label)}<small>${int(n)}</small></a>`;
  const catBar = `<div class="slicers"><div class="slicer wide"><span>Order type (each order counted in one type: Equipment, then Discounts, then Software, then Others)</span>
    <div class="chips">${catChip("All orders", "", base.length)}${CATS.map((c) => catChip(c[1], c[0], catCount(c[0]))).join("")}</div></div></div>`;
  const viewChip = (label, v) => `<a class="chip${mode === v ? " on" : ""}" href="${esc(href("home", { ou: st.ou, cat, cv: v === "q" ? "q" : "" }))}">${label}</a>`;

  ctx.content.innerHTML = `${navHtml(ctx)}<main>
    <h1>Clear to Pick \u2014 ship readiness summary</h1>
    ${slicersHtml(orders, st, "home", { customers: false })}
    ${catBar}
    ${dateFilterHtml("Order date is the date the sales order was entered.", shownInReport)}
    <section class="kpis">
      <div class="kpi"><span>Orders</span><b>${int(rows.length)}</b></div>
      <div class="kpi"><span>Total revenue (all weeks)</span><b>${compact(total)}</b></div>
      <div class="kpi"><span>Week 1 revenue</span><b>${compact(w1)}</b></div>
      <div class="kpi"><span>Weeks 1\u201312 revenue</span><b>${compact(w12)}</b></div>
      <div class="kpi"><span>Orders ready after promise</span><b>${int(late)}</b></div>
    </section>
    <section class="card"><h2>Revenue by ship ${mode === "q" ? "quarter" : "week"}${mode === "q" ? " (Aviat fiscal calendar)" : " (current week \u2013 12 weeks)"}</h2>
      <div class="chips" style="margin-bottom:8px"><span class="muted" style="align-self:center">View:</span>${viewChip("Current week \u2013 12 weeks", "w")}${viewChip("Quarterly (FY27)", "q")}</div>
      <p class="muted">Stacked columns by Operating Unit; line = cumulative revenue (secondary axis). ${mode === "q" ? "Each column is a fiscal quarter, using the quarter of the week the order is ready to ship; it covers all orders, not only the next 12 weeks." : "Each week shows its week-starting (Monday) date."} Click a column to see its orders.${mode === "q" ? "" : ` This chart shows ship weeks 1\u201312 only: ${int(inChart)} of the ${int(rows.length)} orders selected${afterChart ? `; ${int(afterChart)} ship after week 12 (see the ship-window table below or the Quarterly view)` : ""}.`}</p>
      ${chartSvg(rows, st, slots, mode)}</section>
    <section class="card"><h2>Revenue by ship window</h2>
      <p class="muted">Equipment is split by supplier commitment: on-hand/committed supply vs. supplier-uncommitted (no PO promise date, or still to purchase). Click a row to open its orders.</p>
      ${summaryTable(rows, st, extra)}</section>
  </main>`;
  wireSlicers(ctx, "home", { cat, cv: mode === "q" ? "q" : "" });
  wireDateFilter(ctx);
}
