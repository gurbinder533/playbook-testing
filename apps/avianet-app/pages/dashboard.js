import { esc } from "@corvic/live";
import { usd, int, qty, href, params, navHtml, notice, dateFilterHtml, wireDateFilter, dateOk } from "../lib/app.js";

const CLASSES = ["SECURE - ON TIME", "SECURE - LATE", "PO RISK", "MATERIAL RISK"];
const NP = "NO PROMISE DATE";
const LIMIT = 1000;
// The data keeps the internal class value "UNKNOWN"; the page always shows it as "Gap".
const show = (s) => (s === "UNKNOWN" ? "Gap" : s);
const REGION_ORDER = ["North America", "Latin America", "Europe", "Middle East", "Africa", "APAC", "Unassigned"];
const BTR_KEY = "ctp_btr_file";
let rgOpen = false; // keeps the region multi-select panel open while ticking several regions
const TOTAL_NAMES = new Set(["company total", "total", "all", "all regions", "grand total", "company"]);

// Equipment Revenue only: EQ_USD = equipment lines + equipment-rolled-up container/kit lines + EQ discount lines
// (discounts keep their negative sign), summed per sales-order line in the pipeline. Software lines are never in AMT.
const SQL = `SELECT e.SLICE, e.HEADER_ID, e.ORDER_NUMBER, coalesce(e.CUSTOMER_NAME, '(Gap)') AS CUSTOMER_NAME,
  coalesce(e.OPERATING_UNIT, '') AS OPERATING_UNIT, coalesce(g.REGION, 'Unassigned') AS REGION, coalesce(e.ORDER_TYPE, '') AS ORDER_TYPE, coalesce(e.CUST_PO_NUMBER, '') AS CUST_PO_NUMBER,
  e.SO_TYPE, e.CLASS, coalesce(e.UNKNOWN_REASON, '') AS UNKNOWN_REASON, CAST(e.WEEK_ENDING AS VARCHAR) AS WEEK_ENDING, CAST(e.EVT_DT AS VARCHAR) AS EVT_DT,
  e.IN_QUARTER, coalesce(e.EQ_USD, 0) AS AMT,
  e.HW_LINES, e.MATERIAL_LINES, e.PO_RISK_LINES, CAST(e.WORST_SUPPLY_DT AS VARCHAR) AS WORST_SUPPLY_DT, CAST(e.ORDER_PROMISE_DT AS VARCHAR) AS ORDER_PROMISE_DT,
  CAST(e.QTR_START AS VARCHAR) AS QTR_START, CAST(e.QTR_END AS VARCHAR) AS QTR_END, CAST(e.TODAY AS VARCHAR) AS TODAY, CAST(od.ORDER_DATE AS VARCHAR) AS ORDER_DATE
  FROM eqdash e LEFT JOIN regions g ON g.HEADER_ID = e.HEADER_ID LEFT JOIN odates od ON od.HEADER_ID = e.HEADER_ID WHERE coalesce(e.EQ_USD, 0) <> 0`;

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

// ---- BTR file (CSV with Region and BTR Amount) -----------------------------------------
let btrFile; // undefined = not loaded yet, null = none uploaded, else { name, rows: [[region, amount], ...] }
let btrMsg = "";
function getBtrFile() {
  if (btrFile !== undefined) return btrFile;
  btrFile = null;
  try {
    const raw = window.localStorage.getItem(BTR_KEY);
    if (raw) { const o = JSON.parse(raw); if (o && Array.isArray(o.rows)) btrFile = o; }
  } catch (_) { /* storage blocked or unreadable */ }
  return btrFile;
}
function setBtrFile(v) {
  btrFile = v;
  try {
    if (v) window.localStorage.setItem(BTR_KEY, JSON.stringify(v)); else window.localStorage.removeItem(BTR_KEY);
  } catch (_) { /* storage blocked */ }
}
function parseCsv(text) {
  const s = String(text || "").replace(/^\uFEFF/, "");
  const out = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim() !== "")) out.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c.trim() !== "")) out.push(row);
  return out;
}
function parseAmt(v) {
  let s = String(v == null ? "" : v).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}
function parseBtr(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("the file is empty");
  const head = rows[0].map((h) => String(h).trim().toLowerCase());
  const ri = head.findIndex((h) => h === "region" || h.includes("region"));
  let ai = head.findIndex((h) => h === "btr amount");
  if (ai < 0) ai = head.findIndex((h, i) => i !== ri && (h.includes("btr") || h.includes("amount")));
  if (ri < 0 || ai < 0) throw new Error('the CSV needs a "Region" column and a "BTR Amount" column');
  const by = new Map();
  let skippedTotals = 0, invalid = 0;
  for (const r of rows.slice(1)) {
    const name = String(r[ri] == null ? "" : r[ri]).trim();
    if (!name) continue;
    if (TOTAL_NAMES.has(name.toLowerCase())) { skippedTotals++; continue; }
    const amt = parseAmt(r[ai]);
    if (amt == null) { invalid++; continue; }
    const key = name.toLowerCase();
    const prev = by.get(key);
    by.set(key, { name: prev ? prev.name : name, amt: (prev ? prev.amt : 0) + amt });
  }
  if (!by.size) throw new Error("no region rows with a valid BTR amount were found");
  return { rows: [...by.values()].map((x) => [x.name, x.amt]), skippedTotals, invalid };
}
function btrCompanyTotal(f) { return f ? f.rows.reduce((a, r) => a + r[1], 0) : 0; }
function btrFor(f, region) {
  if (!f) return 0;
  if (!region) return btrCompanyTotal(f);
  const k = region.toLowerCase();
  return f.rows.filter((r) => r[0].toLowerCase() === k).reduce((a, r) => a + r[1], 0);
}

export default async function render(ctx) {
  ctx.content.innerHTML = `${navHtml(ctx)}<main><p class="muted">Loading\u2026</p></main>`;
  const sp = params(ctx);
  const dt = sp.get("t") || "", dc = sp.get("c") || "", dw = sp.get("w") || "";
  const npOn = sp.get("np") === "1";
  const rgParam = (sp.get("rg") || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const file = getBtrFile();
  const upMsg = btrMsg;
  btrMsg = "";

  let allRows;
  try {
    allRows = await ctx.db.rows(SQL, [], ctx.signal);
  } catch (err) {
    if (ctx.signal.aborted) return;
    notice(ctx.content.querySelector("main"), err, ctx);
    return;
  }
  if (ctx.signal.aborted) return;

  // Region choices: regions seen in the data plus regions named in the BTR file.
  const regionSet = new Map();
  for (const r of allRows) regionSet.set(r.REGION.toLowerCase(), r.REGION);
  if (file) for (const r of file.rows) if (!regionSet.has(r[0].toLowerCase())) regionSet.set(r[0].toLowerCase(), r[0]);
  const regions = [...regionSet.values()].sort((a, b) => {
    const ia = REGION_ORDER.indexOf(a), ib = REGION_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const rgList = regions.filter((x) => rgParam.includes(x.toLowerCase()));
  const rgSel = rgList.join(","); // URL form (comma separated); empty = all regions
  const rgDisp = rgList.join(", ");
  const rgSet = new Set(rgList.map((x) => x.toLowerCase()));
  const rows = allRows.filter((r) => (!rgList.length || rgSet.has(r.REGION.toLowerCase())) && dateOk(r.ORDER_DATE));
  // BTR: the selected region's BTR, else Company Total BTR (sum of all regions); $0 when no file is uploaded.
  const btr = rgList.length ? rgList.reduce((a, x) => a + btrFor(file, x), 0) : btrFor(file, "");

  const today = rows.length ? rows[0].TODAY : (allRows.length ? allRows[0].TODAY : isoDate(new Date()));
  const qs = rows.length ? rows[0].QTR_START : (allRows.length ? allRows[0].QTR_START : today.slice(0, 8) + "01");
  const qe = rows.length ? rows[0].QTR_END : (allRows.length ? allRows[0].QTR_END : today);
  // Quarter scope: the sales order's promise date must fall in [qs, qe] (inclusive).
  for (const r of rows) {
    const p = r.ORDER_PROMISE_DT || "";
    r.INQ = !!p && p >= qs && p <= qe;
    r.OUT = !p ? "NONE" : (p < qs ? "BEFORE" : (p > qe ? "AFTER" : ""));
  }
  const curWe = friOnOrAfter(today);
  const weeks = [];
  for (let w = friOnOrAfter(qs); ; w = addDays(w, 7)) {
    weeks.push(w);
    if (w >= qe || weeks.length > 20) break;
  }
  const qLabel = `Q${Math.floor(((Number(qs.slice(5, 7)) + 5) % 12) / 3) + 1} ${qs.slice(0, 4)}`;

  // ---- aggregation -------------------------------------------------------
  const lastWe = weeks[weeks.length - 1];
  const cell = new Map();
  const add = (k, v) => cell.set(k, (cell.get(k) || 0) + v);
  const wkOf = (r) => (r.CLASS === NP || r.CLASS === "UNKNOWN" ? "-" : (r.WEEK_ENDING && r.WEEK_ENDING > lastWe ? "AFTER" : r.WEEK_ENDING));
  // matrix = quarter-scope orders only; NO PROMISE DATE orders are listed as their own separate total
  for (const r of rows) if (r.INQ || r.CLASS === NP) add(`${bucket(r)}|${r.CLASS}|${wkOf(r)}`, r.AMT);
  const has = (b, c, w) => cell.has(`${b}|${c}|${w}`);
  const val = (b, c, w) => cell.get(`${b}|${c}|${w}`) || 0;

  const beyondWk = (r) => r.CLASS !== NP && r.CLASS !== "UNKNOWN" && !!r.WEEK_ENDING && r.WEEK_ENDING > lastWe;
  const match = (r, t, c, w) => {
    if (t && t !== "ALL" && bucket(r) !== t) return false;
    if (c && c !== "ALL" && c !== "WEEK" && r.CLASS !== c) return false;
    if (w === "OUTB") return r.OUT === "BEFORE";
    if (w === "OUTA") return r.OUT === "AFTER";
    if (w === "OUTN") return r.OUT === "NONE";
    const incl = r.INQ || (r.CLASS === NP && (c === NP || (npOn && (!c || c === "ALL"))));
    if (!incl) return false;
    if (!w || w === "ALL" || w === "QTR") return true;
    if (w === "AFTER") return beyondWk(r);
    return r.INQ && !beyondWk(r) && r.WEEK_ENDING === w;
  };
  const sumWhere = (t, c, w) => rows.reduce((a, r) => (match(r, t, c, w) ? a + r.AMT : a), 0);

  const cur = { t: dt, c: dc, w: dw, np: npOn ? "1" : "", rg: rgSel };
  const link = (over) => href("dashboard", { ...cur, t: "", c: "", w: "", ...over });
  const drillLink = (t, c, w, text, extra = "") =>
    `<a href="${esc(link({ t, c, w }))}" title="Show the sales orders in this amount"${extra}>${text}</a>`;

  // ---- matrix ----------------------------------------------------------------
  const weekHead = weeks.map((w) => {
    const st = w < curWe ? "closed \u00b7 actual" : (w === curWe ? "current \u00b7 actual + plan" : "plan");
    return `<th class="n${w === curWe ? " cur" : ""}">${md(w)}<br><small class="muted">${st}</small></th>`;
  }).join("");

  const classRow = (b, c) => {
    const tds = weeks.map((w) => `<td class="n${w === curWe ? " cur" : ""}">${has(b, c, w) ? drillLink(b, c, w, usd(val(b, c, w))) : '<span class="muted">\u2013</span>'}</td>`).join("");
    const q = weeks.reduce((a, w) => a + val(b, c, w), 0) + val(b, c, "AFTER");
    const anyQ = weeks.some((w) => has(b, c, w)) || has(b, c, "AFTER");
    return `<tr><th>${esc(c)}</th>${tds}
      <td class="n strong">${anyQ ? drillLink(b, c, "QTR", usd(q)) : '<span class="muted">\u2013</span>'}</td>
      <td class="n muted">${has(b, c, "AFTER") ? drillLink(b, c, "AFTER", usd(val(b, c, "AFTER"))) : "\u2013"}</td></tr>`;
  };
  const weeklyTotalRow = (b, label) => {
    const tds = weeks.map((w) => {
      const v = CLASSES.reduce((a, c) => a + val(b, c, w), 0);
      const any = CLASSES.some((c) => has(b, c, w));
      return `<td class="n${w === curWe ? " cur" : ""}">${any ? drillLink(b, "WEEK", w, usd(v)) : "\u2013"}</td>`;
    }).join("");
    const q = CLASSES.reduce((a, c) => a + weeks.reduce((x, w) => x + val(b, c, w), 0) + val(b, c, "AFTER"), 0);
    const af = CLASSES.reduce((a, c) => a + val(b, c, "AFTER"), 0);
    return `<tr class="total"><th>${esc(label)}</th>${tds}<td class="n strong">${usd(q)}</td><td class="n muted">${usd(af)}</td></tr>`;
  };
  const npRow = (b) => `<tr><th>${NP} <small class="muted">(not placed in a week)</small></th>
    <td colspan="${weeks.length}" class="muted" style="text-align:center">${npOn ? "separate total \u2192 included in the quarter total (toggle is on)" : "separate total \u2192 excluded from the Quarter Revenue in Scope by default: with no promise date the order cannot be shown to fall in the quarter (use the toggle above to include it)"}</td>
    <td class="n strong">${has(b, NP, "-") ? drillLink(b, NP, "ALL", usd(val(b, NP, "-"))) : "\u2013"}</td><td class="n muted"></td></tr>`;
  const bucketTotal = (b) => sumWhere(b, "ALL", "QTR");

  const section = (b, title) => `<tbody><tr class="sect"><td colspan="${weeks.length + 3}">${esc(title)}</td></tr>
    ${CLASSES.map((c) => classRow(b, c)).join("")}
    ${weeklyTotalRow(b, "Weekly total (placed in a week)")}
    ${npRow(b)}
    <tr class="total"><th>Total ${esc(b)} \u2014 quarter</th><td colspan="${weeks.length}"></td>
      <td class="n strong">${drillLink(b, "ALL", "QTR", usd(bucketTotal(b)))}</td><td class="n muted"></td></tr></tbody>`;

  const vBack = bucketTotal("BACKLOG"), vAso = bucketTotal("ASO"), vGap = sumWhere("UNKNOWN", "ALL", "QTR");
  // Quarter Revenue in Scope = Backlog Equipment Revenue + ASO Equipment Revenue + BTR + Gap (no software).
  const calc = vBack + vAso + btr + vGap;
  const inQ = (slice) => rows.reduce((a, r) => (r.SLICE === slice && match(r, "ALL", "ALL", "QTR") ? a + r.AMT : a), 0);
  const beyond = sumWhere("ALL", "ALL", "AFTER");
  const npAll = rows.reduce((a, r) => (r.CLASS === NP ? a + r.AMT : a), 0);
  const btrLabel = rgSel ? `BTR \u2014 ${rgDisp}` : "BTR \u2014 Company Total";

  const kpi = (label, v, html) => `<div class="kpi"><span>${esc(label)}</span><b>${html || usd(v)}</b></div>`;
  const kpis = `<section class="kpis">
    ${kpi("Backlog Equipment Revenue (PO \u2260 PENDING)", vBack, drillLink("BACKLOG", "ALL", "QTR", usd(vBack)))}
    ${kpi("ASO Equipment Revenue (PO = PENDING)", vAso, drillLink("ASO", "ALL", "QTR", usd(vAso)))}
    ${kpi(btrLabel, btr)}
    ${kpi("Gap (exceptions)", vGap, drillLink("UNKNOWN", "ALL", "QTR", usd(vGap)))}
    ${kpi("Quarter Revenue in Scope", calc)}</section>`;

  // ---- drill-down ------------------------------------------------------------
  let drill = "";
  if (dt || dc || dw) {
    const isWeekTotal = dc === "WEEK";
    const sel = rows.filter((r) => (isWeekTotal ? (CLASSES.includes(r.CLASS) && match(r, dt, "ALL", dw) && r.CLASS !== NP) : match(r, dt, dc, dw)))
      .sort((a, b) => Math.abs(b.AMT) - Math.abs(a.AMT));
    const tot = sel.reduce((a, r) => a + r.AMT, 0);
    const nOrd = new Set(sel.map((r) => r.HEADER_ID)).size;
    // Per order / basis: how many order lines make up the amount (used for the expandable "Lines" column).
    const lineInfo = new Map();
    try {
      const ids = [...new Set(sel.slice(0, LIMIT).map((r) => Number(r.HEADER_ID)))].filter((x) => Number.isFinite(x));
      if (ids.length) {
        const li = await ctx.db.rows(`SELECT HEADER_ID, SLICE, count(*) AS N, sum(LINE_USD) AS USD, count(*) FILTER (WHERE LINE_KIND = 'EQ discount') AS ND, coalesce(sum(LINE_USD) FILTER (WHERE LINE_KIND = 'EQ discount'), 0) AS DUSD FROM eqlines WHERE HEADER_ID IN (${ids.join(",")}) GROUP BY HEADER_ID, SLICE`, [], ctx.signal);
        for (const x of li) lineInfo.set(`${Number(x.HEADER_ID)}|${x.SLICE}`, { n: Number(x.N), usd: Number(x.USD), nd: Number(x.ND), dusd: Number(x.DUSD) });
      }
    } catch (err) {
      if (ctx.signal.aborted) return;
    }
    const lineBtn = (r) => {
      const i = lineInfo.get(`${Number(r.HEADER_ID)}|${r.SLICE}`);
      if (!i) return '<span class="muted">\u2013</span>';
      const label = `\u25b8 ${int(i.n)} ${r.SLICE === "ACTUAL" ? "shipped " : "planned "}line${i.n === 1 ? "" : "s"}`;
      return `<button type="button" class="chip lines-btn" data-h="${Number(r.HEADER_ID)}" data-s="${esc(r.SLICE)}" data-amt="${Number(r.AMT)}" data-label="${esc(label)}" aria-expanded="false" title="Show the order lines that add up to this amount">${esc(label)}</button>${i.nd > 0 ? ` <span class="tag disc" title="${esc(int(i.nd) + " EQ discount line" + (i.nd === 1 ? "" : "s") + " in this amount, " + usd(i.dusd) + " in total")}">EQ discount ${esc(usd(i.dusd))}</span>` : ""}`;
    };
    const what = [dt && dt !== "ALL" ? show(dt) : "All types", isWeekTotal ? "all classifications" : (dc && dc !== "ALL" ? show(dc) : "all classifications"),
      dw === "QTR" ? `quarter ${qLabel}` : dw === "AFTER" ? `planned beyond week ending ${lastWe} (still in the quarter total)` : dw === "OUTB" ? "Outside Quarter: promise date before the quarter start (not in Quarter Revenue in Scope)" : dw === "OUTA" ? "Outside Quarter: promise date after the quarter end (not in Quarter Revenue in Scope)" : dw === "OUTN" ? "Outside Quarter: no promise date" : dw && dw !== "ALL" ? `week ending ${dw}` : "",
      rgList.length ? `${rgList.length > 1 ? "regions" : "region"} ${rgDisp}` : ""].filter(Boolean).join(" \u00b7 ");
    const body = sel.slice(0, LIMIT).map((r) => `<tr>
      <td>${r.SLICE === "ACTUAL" ? "Actual shipped" : "Planned"}</td><td>${esc(show(bucket(r)))}</td><td>${esc(show(r.CLASS))}${r.UNKNOWN_REASON ? ` <span class="tag">${esc(r.UNKNOWN_REASON)}</span>` : ""}</td>
      <td><a href="${esc(href("allocation", { order: r.ORDER_NUMBER }))}">${esc(r.ORDER_NUMBER)}</a></td>
      <td>${esc(r.CUSTOMER_NAME)}</td><td>${esc(r.OPERATING_UNIT)}</td><td>${esc(r.REGION)}</td><td>${esc(r.CUST_PO_NUMBER)}</td>
      <td>${esc(r.ORDER_PROMISE_DT || "")}</td><td>${esc(r.SLICE === "ACTUAL" ? "" : (r.WORST_SUPPLY_DT || ""))}</td>
      <td>${esc(r.EVT_DT || "")}</td><td>${esc(r.WEEK_ENDING || "")}</td>
      <td class="n strong" title="${esc((r.SLICE === "ACTUAL" ? "Shipped equipment value" : "Planned (still open) equipment value") + " for sales order " + r.ORDER_NUMBER + ": equipment + kit/container lines that roll up to equipment + EQ discount lines (negative), each line = qty \u00d7 unit price \u00d7 USD rate; software excluded. Exact value " + usd(r.AMT) + " (shown rounded to whole dollars). The column adds up to the total above.")}">${usd(r.AMT)}</td>
      <td class="n">${r.SLICE === "ACTUAL" ? "" : int(r.HW_LINES)}</td><td class="n">${r.SLICE === "ACTUAL" ? "" : int(r.MATERIAL_LINES)}</td><td class="n">${r.SLICE === "ACTUAL" ? "" : int(r.PO_RISK_LINES)}</td>
      <td>${lineBtn(r)}</td></tr>`).join("");
    drill = `<section class="card" id="drill"><h2>Underlying sales orders</h2>
      <p class="muted">${esc(what)} \u2014 <b>${usd(tot)}</b> equipment revenue from ${int(nOrd)} sales orders (${int(sel.length)} rows${sel.length > LIMIT ? `, showing the largest ${int(LIMIT)}` : ""}).
        <a href="${esc(href("dashboard", { np: cur.np, rg: cur.rg }))}">Close</a> \u00b7 <button type="button" id="dr-copy" class="chip">Copy rows (paste into Excel)</button> <span id="dr-status" class="muted"></span></p>
      <div class="tablewrap tall"><table class="grid"><thead><tr><th>Basis</th><th>Type</th><th>Classification</th><th>Sales order</th><th>Customer</th><th>Operating Unit</th><th>Region</th><th>Customer PO #</th>
        <th>Order promise date</th><th>Worst supply date</th><th>Ship / planned date</th><th>Week ending</th>
        <th class="n">Equipment USD (incl. kit lines, net of EQ discount)</th><th class="n">Hardware lines</th><th class="n">Lines short</th><th class="n">PO-risk lines</th><th>Lines in this amount<br><small class="muted">Actual = shipped lines</small></th></tr></thead>
        <tbody>${body || '<tr><td colspan="17" class="muted">No sales orders in this amount.</td></tr>'}</tbody></table></div></section>`;
    drill = drill + `<template id="dr-data">${esc(JSON.stringify(sel.map((r) => [r.SLICE === "ACTUAL" ? "Actual shipped" : "Planned", show(bucket(r)), show(r.CLASS), r.ORDER_NUMBER, r.CUSTOMER_NAME, r.OPERATING_UNIT, r.REGION, r.CUST_PO_NUMBER, r.ORDER_PROMISE_DT || "", r.WORST_SUPPLY_DT || "", r.EVT_DT || "", r.WEEK_ENDING || "", Math.round(r.AMT)])))}</template>`;
  }

  const reconcile = `<section class="card"><h2>Quarter Revenue in Scope ${esc(qLabel)}${rgSel ? ` \u2014 ${esc(rgDisp)}` : ""}</h2>
    <div class="tablewrap"><table class="grid summary"><tbody>
      <tr><th>Backlog Equipment Revenue</th><td class="n">${drillLink("BACKLOG", "ALL", "QTR", usd(vBack))}</td><td class="muted">equipment / hardware lines (incl. kit and EQ discount lines) of sales orders with a customer PO number other than PENDING</td></tr>
      <tr><th>+ ASO Equipment Revenue</th><td class="n">${drillLink("ASO", "ALL", "QTR", usd(vAso))}</td><td class="muted">equipment lines of sales orders with customer PO number = PENDING</td></tr>
      <tr><th>+ ${esc(btrLabel)}</th><td class="n">${usd(btr)}</td><td class="muted">${file ? (rgSel ? `the selected region${rgList.length > 1 ? "s' amounts" : "'s amount"} from ${esc(file.name)}` : `sum of all regions in ${esc(file.name)}`) : "no BTR file uploaded"} (expected bookings, not yet sales orders; no underlying orders)</td></tr>
      <tr><th>+ Gap</th><td class="n">${drillLink("UNKNOWN", "ALL", "QTR", usd(vGap))}</td><td class="muted">in-scope equipment revenue that cannot be placed (no PO number or no currency rate)</td></tr>
      <tr class="total"><th>= Quarter Revenue in Scope</th><td class="n strong">${usd(calc)}</td><td class="muted">software revenue is not included in any line above</td></tr></tbody></table></div>
    <p class="muted">Of the Backlog + ASO + Gap amount: actual shipped to date ${usd(inQ("ACTUAL"))}, planned ${usd(inQ("PLANNED"))}.
      Of the quarter total, ${usd(beyond)} is planned beyond the last week (${esc(md(lastWe))}) because supply or plan dates run past the quarter end although the order is promised inside it. ${usd(npAll)} has no promise date (${npOn ? "included above" : "excluded above"}). Sales orders promised outside ${esc(qs)} to ${esc(qe)} are not counted; see the Outside Quarter card.</p></section>`;

  const oc = (t, w) => {
    const v = sumWhere(t, "ALL", w);
    return rows.some((r) => match(r, t, "ALL", w)) ? drillLink(t, "ALL", w, usd(v)) : "\u2013";
  };
  const outRows = [[`Promise date before ${qs}`, "OUTB"], [`Promise date after ${qe}`, "OUTA"], ["No promise date", "OUTN"]];
  const outsideCard = `<section class="card"><h2>Outside Quarter (reconciliation only)</h2>
    <p class="muted">Sales orders whose promise date is not within ${esc(qs)} to ${esc(qe)}. They are <b>not</b> in Backlog, ASO, the weekly figures or the Quarter Revenue in Scope${npOn ? " (except NO PROMISE DATE orders, which are switched on above)" : ""}.</p>
    <div class="tablewrap"><table class="grid summary"><thead><tr><th>Reason</th><th class="n">Backlog</th><th class="n">ASO</th><th class="n">Gap</th><th class="n">Total</th></tr></thead><tbody>
    ${outRows.map(([lab, w]) => `<tr><th>${esc(lab)}</th><td class="n">${oc("BACKLOG", w)}</td><td class="n">${oc("ASO", w)}</td><td class="n">${oc("UNKNOWN", w)}</td><td class="n strong">${oc("ALL", w)}</td></tr>`).join("")}
    </tbody></table></div></section>`;
  const notes = `<section class="card"><h2>How this is calculated</h2>
    <ul class="steps" style="list-style:disc">
      <li><b>Quarter scope</b>: first, only sales orders whose promise date (earliest promise date of the order's open revenue lines) is from ${esc(qs)} to ${esc(qe)} inclusive are in the quarter. Everything below \u2014 Backlog / ASO, the CTP classification, the weekly figures and the Quarter Revenue in Scope \u2014 uses only those orders. Others are listed under Outside Quarter.</li>
      <li><b>Equipment Revenue</b> = open order value in USD (ordered \u2212 shipped qty \u00d7 unit price \u00d7 USD rate), worked out per sales-order line and then added up to the sales order and the dashboard totals. It covers equipment / hardware lines, model / kit lines that roll up to equipment, and EQ discount lines (discounts keep their negative sign). <b>All software lines are excluded</b>, as are services, freight and other lines.</li>
      <li><b>Backlog / ASO</b> from the order's customer PO number: PENDING = ASO, anything else = Backlog. An order with no PO number, or a missing currency rate, is a <b>Gap</b>.</li>
      <li><b>Hardware lines</b> are the order's open equipment lines from the allocation (each line split by supply). A line is <i>short</i> if any of it must still be bought (stage Buy / 7-PO to place). A line is <i>PO risk</i> if any of it rests on a PO with no promise date or a promise date after quarter end.</li>
      <li><b>Worst supply date</b> = the latest supply-available date across all supported hardware lines of the order (on-hand: today; PO: promise date). <b>Order promise date</b> = earliest promise date of the order's open revenue lines.</li>
      <li><b>SECURE - ON TIME</b>: all hardware supported and worst supply date \u2264 order promise date. <b>SECURE - LATE</b>: supported but later than promise (within the quarter). <b>PO RISK</b>: PO supply with no promise date or promised after quarter end. <b>MATERIAL RISK</b>: at least one hardware line has no stock or PO coverage (checked first). <b>NO PROMISE DATE</b>: no promise date on the order, shown as a separate total; as it cannot be shown to fall in the quarter it is left out of the Quarter Revenue in Scope unless you switch it on with the toggle.</li>
      <li><b>Week placement</b> (week ending Friday): SECURE orders by worst supply date; PO RISK and MATERIAL RISK by their order promise date (not earlier than today). Closed weeks show shipped revenue (actual ship date, classified by last ship date vs promise); the current week shows shipped to date plus remaining planned; future weeks show planned. Orders with no hardware lines count as supported.</li>
      <li><b>Region</b> is the sales order's ship-to country mapped to a BTR region (US / Canada = North America; Mexico, Central &amp; South America = Latin America; Europe; Middle East; Africa; Asia-Pacific incl. India and Oceania = APAC). Orders whose country is not mapped fall under "Unassigned" and appear only when no region is selected.</li>
      <li><b>BTR</b> comes only from the CSV you upload (columns <i>Region</i> and <i>BTR Amount</i>). Company Total BTR = the sum of all regions in the file (any "Company Total" row in the file is ignored so it is not counted twice). Selecting a region shows that region's BTR; otherwise Company Total BTR. With no file uploaded, BTR is $0. The file is kept in this browser.</li></ul></section>`;

  const rgSummary = !rgList.length ? "All regions (Company Total)" : (rgList.length === 1 ? rgList[0] : `${rgList.length} regions: ${rgDisp}`);
  const regionControl = `<div class="slicer"><span>Region (tick one or more)</span><details class="msel" id="rg-ms"${rgOpen ? " open" : ""}><summary>${esc(rgSummary)}</summary><div class="msel-panel">
    <label class="msel-opt"><input type="checkbox" id="rg-all"${rgList.length ? "" : " checked"}> All regions (Company Total)</label>
    ${regions.map((x) => `<label class="msel-opt"><input type="checkbox" class="rg-cb" value="${esc(x)}"${rgSet.has(x.toLowerCase()) ? " checked" : ""}> ${esc(x)}</label>`).join("")}</div></details></div>`;
  const btrStatus = file
    ? `BTR file: <b>${esc(file.name)}</b> \u00b7 ${int(file.rows.length)} regions \u00b7 Company Total BTR ${usd(btrCompanyTotal(file))}`
    : "No BTR file uploaded \u2014 BTR is shown as $0.";

  ctx.content.innerHTML = `${navHtml(ctx)}<main>
    <h1>Clear to Pick \u2014 equipment revenue dashboard</h1>
    <p class="muted">${esc(qLabel)} (promise date ${esc(qs)} to ${esc(qe)} inclusive) \u00b7 as of ${esc(today)} \u00b7 weeks end on Friday \u00b7 ${rgList.length ? `${rgList.length > 1 ? "regions" : "region"} ${esc(rgDisp)}` : "all regions"} \u00b7 equipment revenue only (software excluded) \u00b7 click any amount to see its sales orders.</p>
    <div id="ctl" class="slicers so-filter">
      ${regionControl}
      <label class="slicer"><span>BTR file (CSV with Region and BTR Amount)</span><input id="btr-file" type="file" accept=".csv,text/csv" style="min-width:14rem"></label>
      ${file ? '<button type="button" id="btr-clear" class="chip">Remove BTR file</button>' : ""}
      <a class="chip" href="${esc(href("dashboard", { np: npOn ? "" : "1", rg: cur.rg }))}">${npOn ? "Exclude NO PROMISE DATE from the quarter total" : "Include NO PROMISE DATE in the quarter total"}</a>
    </div>
    ${dateFilterHtml("Filters the orders in every figure below (BTR is not an order amount and is not filtered).")}
    <p class="muted" id="btr-status">${btrStatus}${upMsg ? ` \u00b7 <span>${esc(upMsg)}</span>` : ""}</p>
    ${kpis}
    <section class="card"><h2>Classified equipment revenue by week ending</h2>
      <p class="muted">Backlog and ASO are classified separately. Closed weeks = actual shipped; current week = shipped + remaining plan; future weeks = plan.</p>
      <div class="tablewrap"><table class="grid matrix">
        <thead><tr><th>Classification</th>${weekHead}<th class="n">Quarter total</th><th class="n">Of which beyond ${md(lastWe)}<br><small class="muted">in quarter total</small></th></tr></thead>
        ${section("BACKLOG", "BACKLOG \u2014 PO number \u2260 PENDING")}
        ${section("ASO", "ASO \u2014 PO number = PENDING")}
        <tbody><tr class="sect"><td colspan="${weeks.length + 3}">Gap \u2014 exception bucket</td></tr>
          <tr><th>Gap</th><td colspan="${weeks.length}" class="muted" style="text-align:center">equipment revenue that cannot be placed in a category</td>
            <td class="n strong">${drillLink("UNKNOWN", "ALL", "QTR", usd(vGap))}</td><td></td></tr>
          <tr class="sect"><td colspan="${weeks.length + 3}">${esc(btrLabel)} \u2014 expected bookings (not sales orders)</td></tr>
          <tr><th>${esc(btrLabel)}</th><td colspan="${weeks.length}" class="muted" style="text-align:center">single amount, not spread across weeks</td><td class="n strong">${usd(btr)}</td><td></td></tr>
          <tr class="total"><th>Quarter Revenue in Scope</th><td colspan="${weeks.length}"></td><td class="n strong">${usd(calc)}</td><td></td></tr></tbody>
      </table></div></section>
    ${drill}
    ${reconcile}
    ${outsideCard}
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
      ctx.navigate(href("dashboard", { np: cur.np, rg: vals.join(",") }));
    }, { signal: ctx.signal }));
    const all = ms.querySelector("#rg-all");
    if (all) all.addEventListener("change", () => {
      rgOpen = true;
      ctx.navigate(href("dashboard", { np: cur.np }));
    }, { signal: ctx.signal });
  }

  const fin = ctx.content.querySelector("#btr-file");
  if (fin) fin.addEventListener("change", async () => {
    const f = fin.files && fin.files[0];
    if (!f) return;
    const st = ctx.content.querySelector("#btr-status");
    if (st) st.textContent = "Reading BTR file\u2026";
    try {
      const parsed = parseBtr(await f.text());
      setBtrFile({ name: f.name, rows: parsed.rows });
      btrMsg = `Loaded ${parsed.rows.length} regions` + (parsed.skippedTotals ? ` (ignored ${parsed.skippedTotals} total row${parsed.skippedTotals > 1 ? "s" : ""}; the total is the sum of the regions)` : "") + (parsed.invalid ? `; skipped ${parsed.invalid} row(s) with no valid amount` : "") + ".";
    } catch (err) {
      btrMsg = `Could not read ${f.name}: ${err && err.message ? err.message : err}. The previous BTR (if any) is unchanged.`;
    }
    if (ctx.signal.aborted) return;
    await render(ctx);
  }, { signal: ctx.signal });

  const clr = ctx.content.querySelector("#btr-clear");
  if (clr) clr.addEventListener("click", async () => {
    setBtrFile(null);
    btrMsg = "BTR file removed.";
    await render(ctx);
  }, { signal: ctx.signal });

  const m2 = (v) => Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const d2 = (v) => (Number(v) < 0 ? "-" : "") + "$" + m2(Math.abs(Number(v)));
  const cmpLine = (a, b) => {
    const pa = String(a || "").split(".").map((x) => Number(x) || 0), pb = String(b || "").split(".").map((x) => Number(x) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
    return 0;
  };
  ctx.content.querySelectorAll(".lines-btn").forEach((btn) => btn.addEventListener("click", async () => {
    const tr = btn.closest("tr");
    const nx = tr && tr.nextElementSibling;
    if (nx && nx.classList.contains("linesrow")) {
      nx.remove();
      btn.setAttribute("aria-expanded", "false");
      btn.textContent = btn.getAttribute("data-label");
      return;
    }
    const h = Number(btn.getAttribute("data-h"));
    const isA = btn.getAttribute("data-s") === "ACTUAL";
    const amt = Number(btn.getAttribute("data-amt"));
    const row = document.createElement("tr");
    row.className = "linesrow";
    row.innerHTML = '<td colspan="17" class="muted">Loading lines\u2026</td>';
    tr.after(row);
    btn.setAttribute("aria-expanded", "true");
    btn.textContent = "\u25be Hide lines";
    try {
      const ls = await ctx.db.rows(`SELECT SO_LINE_NUMBER, ITEM_NUMBER, ITEM_DESCRIPTION, LINE_KIND, QTY, UNIT_PRICE, USD_RATE, CAST(SHIP_DT AS VARCHAR) AS SHIP_DT, LINE_USD FROM eqlines WHERE HEADER_ID = ${h} AND SLICE = '${isA ? "ACTUAL" : "PLANNED"}'`, [], ctx.signal);
      if (ctx.signal.aborted) return;
      ls.sort((a, b) => cmpLine(a.SO_LINE_NUMBER, b.SO_LINE_NUMBER));
      const total = ls.reduce((a, l) => a + Number(l.LINE_USD || 0), 0);
      const ties = Math.abs(total - amt) < 0.5;
      const isDisc = (l) => l.LINE_KIND === "EQ discount";
      const nDisc = ls.filter(isDisc).length;
      const discTotal = ls.filter(isDisc).reduce((a, l) => a + Number(l.LINE_USD || 0), 0);
      const trs = ls.map((l) => `<tr${isDisc(l) ? ' class="eqdisc"' : ""}><td>${esc(l.SO_LINE_NUMBER)}</td><td>${esc(l.ITEM_NUMBER)}</td><td class="desc">${esc(l.ITEM_DESCRIPTION || "")}</td><td>${isDisc(l) ? '<span class="tag disc">EQ discount</span>' : esc(l.LINE_KIND)}</td>
        <td class="n">${qty(l.QTY)}</td><td class="n">${m2(l.UNIT_PRICE)}</td><td class="n">${Number(l.USD_RATE).toFixed(4)}</td>${isA ? `<td>${esc(l.SHIP_DT || "")}</td>` : ""}
        <td class="n strong">${d2(l.LINE_USD)}</td></tr>`).join("");
      row.innerHTML = `<td colspan="17"><div class="linebox">
        <p><b>${isA ? "Shipped (actual) lines" : "Planned (still open) lines"}</b> that make up this amount \u2014 ${int(ls.length)} line${ls.length === 1 ? "" : "s"}.
          ${isA ? "Each line = shipped qty \u00d7 unit price \u00d7 USD rate, for lines shipped between the quarter start and today." : "Each line = open qty (ordered \u2212 shipped) \u00d7 unit price \u00d7 USD rate."}
          Equipment, kit / container lines that roll up to equipment, and EQ discount lines (negative) are included; software is not.
          ${nDisc ? `<span class="tag disc">${int(nDisc)} EQ discount line${nDisc === 1 ? "" : "s"} highlighted below: ${d2(discTotal)}</span>` : "No EQ discount lines on this order."}</p>
        <table class="grid linegrid"><thead><tr><th>SO line</th><th>Item</th><th>Description</th><th>Line type</th><th class="n">${isA ? "Qty shipped" : "Qty open"}</th><th class="n">Unit price (order currency)</th><th class="n">USD rate</th>${isA ? "<th>Ship date</th>" : ""}<th class="n">Line USD</th></tr></thead>
          <tbody>${trs || `<tr><td colspan="${isA ? 9 : 8}" class="muted">No lines found.</td></tr>`}</tbody>
          <tfoot><tr><th colspan="${isA ? 8 : 7}">Total of these lines</th><td class="n">${d2(total)}</td></tr></tfoot></table>
        <p class="${ties ? "ok" : "warn"}" style="margin-top:6px">${ties ? "\u2713 Ties to the order amount above (" + usd(amt) + ")." : "Does not tie to the order amount above (" + d2(amt) + "); difference " + d2(total - amt) + "."}</p></div></td>`;
    } catch (err) {
      if (ctx.signal.aborted) return;
      row.innerHTML = `<td colspan="17" class="muted err">Could not load the lines: ${esc(err && err.message ? err.message : String(err))}</td>`;
    }
  }, { signal: ctx.signal }));

  const cp = ctx.content.querySelector("#dr-copy");
  if (cp) cp.addEventListener("click", async () => {
    const st = ctx.content.querySelector("#dr-status");
    let data = [];
    try { data = JSON.parse(ctx.content.querySelector("#dr-data").innerHTML.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&amp;/g, "&")); } catch (_) { data = []; }
    const head = ["Basis", "Type", "Classification", "Sales order", "Customer", "Operating Unit", "Region", "Customer PO", "Order promise", "Worst supply", "Ship/planned date", "Week ending", "Equipment USD"];
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
