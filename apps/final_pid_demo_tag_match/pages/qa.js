import { shell, esc, creditHtml, table, sevBadge, SEV_RANK, KIND_LABEL, trunc } from "../lib/app.js";

let sheetSel = "all";
let sevSel = "all";

export default async function render(ctx) {
  ctx.content.innerHTML = shell("qa", `<h1>QA review</h1><p class="muted">Items the reader flagged: not connected to anything, low confidence, or marked unsure. Check these against the drawing first.</p><div class="card"><div class="row"><label class="small muted">Sheet <select id="sheet" class="in" style="width:auto"></select></label><label class="small muted">Severity <select id="sev" class="in" style="width:auto"><option value="all">All</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option><option value="info">Info</option></select></label><span class="muted small" id="n"></span></div><div id="list" style="margin-top:10px"><p class="muted">Loading…</p></div></div>${creditHtml()}`);
  const $ = (s) => ctx.content.querySelector(s);
  try {
    const [sheets, items] = await Promise.all([
      ctx.db.rows(`SELECT drawing_id, title FROM sheets WHERE ok ORDER BY drawing_id LIMIT 20`, [], ctx.signal),
      ctx.db.rows(`SELECT drawing_id, item_id, tag, kind, reason, severity, conf FROM qa LIMIT 3000`, [], ctx.signal),
    ]);
    if (ctx.signal.aborted) return;
    const title = new Map(sheets.map((s) => [s.drawing_id, s.title]));
    const sel = $("#sheet");
    sel.innerHTML = `<option value="all">All sheets</option>` + sheets.map((s) => {
      const c = items.filter((i) => i.drawing_id === s.drawing_id && i.severity !== "info").length;
      return `<option value="${esc(s.drawing_id)}">Sheet ${Number(s.drawing_id.slice(-2))} · ${esc(s.title)} (${c})</option>`;
    }).join("");
    sel.value = sheetSel; $("#sev").value = sevSel;
    const draw = () => {
      const rows = items.filter((i) => (sheetSel === "all" || i.drawing_id === sheetSel) && (sevSel === "all" || i.severity === sevSel))
        .sort((a, b) => (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9) || a.drawing_id.localeCompare(b.drawing_id));
      $("#n").textContent = `${rows.length} item${rows.length === 1 ? "" : "s"}`;
      $("#list").innerHTML = table([["Severity", (r) => sevBadge(r.severity)], ["Sheet", (r) => `<a href="sheet/${encodeURIComponent(r.drawing_id)}">${Number(r.drawing_id.slice(-2))} · ${esc(trunc(title.get(r.drawing_id) || "", 28))}</a>`], ["Tag", (r) => esc(r.tag || "—")], ["Kind", (r) => esc(KIND_LABEL[r.kind] || r.kind)], ["Why", (r) => esc(r.reason)], ["Confidence", (r) => Math.round(r.conf * 100) + "%"]], rows, "Nothing flagged for this selection.");
    };
    draw();
    sel.addEventListener("change", () => { sheetSel = sel.value; draw(); }, { signal: ctx.signal });
    $("#sev").addEventListener("change", (e) => { sevSel = e.target.value; draw(); }, { signal: ctx.signal });
  } catch (e) { if (ctx.signal.aborted) return; ctx.reportError(e); $("#list").innerHTML = `<p class="muted">QA items could not be loaded yet.</p>`; }
}
