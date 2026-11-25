import { esc, renderChrome, cleanFile, emptyNote, showLoadError, resolveMode, writeErrorText } from "../lib/app.js";

export default async function render(ctx) {
  const main = renderChrome(ctx, ctx.route.path);
  main.innerHTML = `<div class="page-h"><h1>QA review</h1><p>The extracted graph needs engineering review, especially for poor scans. Every uncertain tag or connection is listed here. Compare it with the drawing and record your decision. Your decisions are private to you.</p></div><div id="qbody"><div class="ph">Loading review items...</div></div>`;
  let items, decided;
  try {
    const t = await resolveMode(ctx.db, ctx.signal);
    [items, decided] = await Promise.all([
      ctx.db.rows(`SELECT item_id, file, page, kind, item, issue FROM ${t.qa} ORDER BY file, page, kind LIMIT 1500`, [], ctx.signal),
      ctx.db.rows("SELECT item_id, decision, note FROM (SELECT item_id, decision, note, deleted, row_number() OVER (PARTITION BY item_id ORDER BY updated_at DESC) AS rn FROM qa_decisions) WHERE rn = 1 AND deleted IS NOT TRUE LIMIT 5000", [], ctx.signal),
    ]);
    // A deleted upload takes its review items with it.
    if (t.files) items = items.filter((i) => t.files.has(i.file));
  } catch (err) { showLoadError(ctx, main, err); return; }
  if (ctx.signal.aborted) return;
  const body = main.querySelector("#qbody");
  if (!items.length) { body.innerHTML = emptyNote("Nothing to review yet. Items appear after your drawings have been read."); return; }

  const dec = new Map(decided.map((d) => [d.item_id, d]));
  let filter = "open", kind = "";
  const kinds = [...new Set(items.map((i) => i.kind))];
  body.innerHTML = `
  <div class="kpis small" id="qk"></div>
  <div class="toolbar"><div class="chipbar" id="qf">${[["open", "To review"], ["confirmed", "Confirmed"], ["needs_fix", "Needs fixing"], ["dismissed", "Dismissed"], ["all", "All"]].map(([k, l]) => `<button class="chip${k === "open" ? " on" : ""}" data-f="${k}" type="button">${l}</button>`).join("")}</div><select id="qkind" aria-label="Kind"><option value="">All kinds</option>${kinds.map((k) => `<option value="${esc(k)}">${esc(k)}</option>`).join("")}</select><span class="msg" id="qmsg" role="status"></span></div>
  <div class="qa-list" id="qlist"></div>`;
  const $ = (s) => body.querySelector(s);

  const stat = (d) => (d ? d.decision : "open");
  const paint = () => {
    const c = { open: 0, confirmed: 0, needs_fix: 0, dismissed: 0 };
    for (const i of items) { const s = stat(dec.get(i.item_id)); c[s] = (c[s] || 0) + 1; }
    $("#qk").innerHTML = [[c.open, "To review", "warn"], [c.confirmed, "Confirmed", ""], [c.needs_fix, "Needs fixing", "bad"], [c.dismissed, "Dismissed", ""]].map(([v, l, cls]) => `<div class="kpi ${cls}"><div class="kpi-v">${v}</div><div class="kpi-l">${l}</div></div>`).join("");
    const rows = items.filter((i) => (filter === "all" || stat(dec.get(i.item_id)) === filter) && (!kind || i.kind === kind));
    $("#qlist").innerHTML = rows.slice(0, 150).map((i) => {
      const d = dec.get(i.item_id);
      const s = stat(d);
      return `<article class="qa s-${s}" data-id="${esc(i.item_id)}">
        <div class="qa-h"><span class="badge k-${i.kind.includes("connection") ? "conn" : i.kind.includes("tag") ? "tag" : "flag"}">${esc(i.kind)}</span><b>${esc(i.item)}</b><span class="qa-s">${esc(cleanFile(i.file))} &middot; p.${i.page}</span></div>
        <p>${esc(i.issue)}</p>
        <div class="qa-a"><input type="text" class="note" placeholder="Optional note" value="${esc(d?.note || "")}" aria-label="Note" />
          <button class="btn btn-sm ok${s === "confirmed" ? " sel" : ""}" data-d="confirmed" type="button">Confirm</button>
          <button class="btn btn-sm fix${s === "needs_fix" ? " sel" : ""}" data-d="needs_fix" type="button">Needs fixing</button>
          <button class="btn btn-sm dis${s === "dismissed" ? " sel" : ""}" data-d="dismissed" type="button">Dismiss</button>
          ${s !== "open" ? '<button class="btn btn-sm" data-d="reopen" type="button">Reopen</button>' : ""}</div>
      </article>`;
    }).join("") || `<div class="empty-inline">${filter === "open" ? "Everything here has a decision. Nice work." : "Nothing in this view."}</div>`;
    if (rows.length > 150) $("#qlist").insertAdjacentHTML("beforeend", `<p class="fine">Showing the first 150 of ${rows.length}. Decide some and the rest move up.</p>`);
  };

  $("#qf").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-f]"); if (!b) return;
    filter = b.dataset.f;
    body.querySelectorAll("#qf .chip").forEach((c) => c.classList.toggle("on", c === b));
    paint();
  }, { signal: ctx.signal });
  $("#qkind").addEventListener("change", (ev) => { kind = ev.target.value; paint(); }, { signal: ctx.signal });

  $("#qlist").addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-d]"); if (!btn) return;
    const card = btn.closest("[data-id]");
    const id = card.dataset.id, d = btn.dataset.d;
    const note = card.querySelector(".note").value.trim();
    const msg = $("#qmsg");
    btn.disabled = true; msg.textContent = "Saving...";
    try {
      await ctx.write.rows("qa_decisions", [{ item_id: id, decision: d === "reopen" ? "open" : d, note, updated_at: new Date().toISOString(), deleted: d === "reopen" }], { signal: ctx.signal });
      if (d === "reopen") dec.delete(id); else dec.set(id, { item_id: id, decision: d, note });
      msg.textContent = "Saved.";
      paint();
    } catch (err) {
      if (ctx.signal.aborted) return;
      btn.disabled = false;
      msg.textContent = writeErrorText(err, "save review decisions");
      ctx.reportError(err);
    }
  }, { signal: ctx.signal });
  paint();
}
