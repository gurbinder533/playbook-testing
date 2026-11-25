import { esc, renderChrome, loadModel, sheetKey, sheetLabel, confBadge, emptyNote, showLoadError } from "../lib/app.js";

const PAGE = 300;

export default async function render(ctx) {
  const main = renderChrome(ctx, ctx.route.path);
  main.innerHTML = `<div class="page-h"><h1>Equipment &amp; instrument register</h1><p>Every tag read from your drawings, with line sizes and materials where printed. Search, filter and spot low-confidence reads.</p></div><div id="rbody"><div class="ph">Loading the register...</div></div>`;
  let model;
  try { model = await loadModel(ctx.db, ctx.signal); } catch (err) { showLoadError(ctx, main, err); return; }
  if (ctx.signal.aborted) return;
  const body = main.querySelector("#rbody");
  if (!model.nodes.length) { body.innerHTML = emptyNote("The register fills in once your drawings have been read."); return; }

  const types = [...new Set(model.nodes.map((n) => n.node_type).filter(Boolean))].sort();
  const sheets = [...new Map(model.nodes.map((n) => [sheetKey(n), sheetLabel(n)])).entries()];
  const counts = {};
  for (const n of model.nodes) counts[n.node_type] = (counts[n.node_type] || 0) + 1;

  body.innerHTML = `
  <div class="toolbar">
    <input id="rq" type="search" placeholder="Search tag, service, size, material" aria-label="Search" />
    <select id="rt" aria-label="Type"><option value="">All types</option>${types.map((t) => `<option value="${esc(t)}">${esc(t)} (${counts[t]})</option>`).join("")}</select>
    <select id="rc" aria-label="Confidence"><option value="">Any confidence</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select>
    <select id="rs" aria-label="Sheet"><option value="">All sheets</option>${sheets.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join("")}</select>
    <span class="count" id="rcount"></span>
  </div>
  <div class="card tight"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Tag</th><th>Type</th><th>Description</th><th>Service / name</th><th>Size, material, details</th><th>Sheet</th><th>Confidence</th></tr></thead><tbody id="rrows"></tbody></table></div></div>`;
  const $ = (s) => body.querySelector(s);

  const apply = () => {
    const q = $("#rq").value.trim().toLowerCase(), t = $("#rt").value, c = $("#rc").value, s = $("#rs").value;
    const rows = model.nodes.filter((n) =>
      (!t || n.node_type === t) && (!c || n.confidence === c) && (!s || sheetKey(n) === s) &&
      (!q || `${n.tag} ${n.name} ${n.subtype} ${n.attrs}`.toLowerCase().includes(q)));
    $("#rcount").textContent = `${rows.length} item${rows.length === 1 ? "" : "s"}${rows.length > PAGE ? ` (showing first ${PAGE})` : ""}`;
    $("#rrows").innerHTML = rows.slice(0, PAGE).map((n) =>
      `<tr><td class="tag">${esc(n.tag)}</td><td><span class="tp tp-${esc(n.node_type)}">${esc(n.node_type)}</span></td><td>${esc(n.subtype)}</td><td>${esc(n.name)}</td><td>${esc(n.attrs)}</td><td class="nw">${esc(sheetLabel(n))}</td><td>${confBadge(n.confidence)}</td></tr>`
    ).join("") || `<tr><td colspan="7" class="empty-inline">Nothing matches those filters.</td></tr>`;
  };
  for (const id of ["#rq", "#rt", "#rc", "#rs"]) body.querySelector(id).addEventListener("input", apply, { signal: ctx.signal });
  apply();
}
