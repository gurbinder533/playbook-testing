import { esc, renderChrome, showLoadError, section, dataTable, chip, statusLabel, statusClass, num } from "../lib/app.js";

function parseList(text) {
  try { const v = JSON.parse(text || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

function issuesCell(r) {
  const issues = parseList(r.issues_json);
  const notes = parseList(r.notes_json);
  if (!issues.length && !notes.length && !r.error) return `<span class="small">None</span>`;
  const items = issues.map((i) => `<li><strong>${esc(i.check || "check")}</strong>: expected ${esc(i.expected || "n/a")}, found ${esc(i.found || "n/a")}. ${esc(i.action || "")}</li>`).join("")
    + notes.map((n) => `<li class="small">Note: ${esc(typeof n === "string" ? n : JSON.stringify(n))}</li>`).join("")
    + (r.error ? `<li class="err">Reader error: ${esc(r.error)}</li>` : "");
  return `<details class="issue"><summary>${issues.length} failed check(s), ${notes.length} note(s)</summary><ul class="issue-list">${items}</ul></details>`;
}

export default async function render(ctx) {
  const main = renderChrome(ctx, "reads");
  main.innerHTML = `<div class="load-note">Loading</div>`;
  try {
    const rows = await ctx.db.rows(`SELECT request_id, file_name, property_type, unit_type, plan_source, build_year, template_id, status, checks_failed, open_wall_ends, wall_count, scale_source, floor_area_m2, issues_json, notes_json, error, cost_usd, wall_clock_s FROM reads ORDER BY request_id LIMIT 300`, [], ctx.signal);
    if (ctx.signal.aborted) return;
    main.innerHTML = `
      <h1>Plan reads and failed checks</h1>
      <p class="lede">Every plan the reader has read, the template it was compared with, and each check that failed as expected against found. Checks raise flags for a person in Confirm. They never change a plan. Open a row to see its checks.</p>
      <div class="toolbar">
        <label class="small">Show <select id="f-status"><option value="">All reads</option><option value="flagged">Reads with flags</option><option value="accepted">Accepted by the checker</option><option value="confirm_scale">Needs scale confirmation</option><option value="reader_error">Reader errors</option></select></label>
        <span class="small" id="count"></span>
      </div>
      <div id="table"></div>`;
    const paint = () => {
      const f = main.querySelector("#f-status").value;
      const shown = rows.filter((r) => !f || (f === "flagged" ? (r.checks_failed || 0) > 0 : r.status === f));
      main.querySelector("#count").textContent = `${num(shown.length)} of ${num(rows.length)} read(s)`;
      main.querySelector("#table").innerHTML = section("Reads", dataTable([
        { h: "Plan", k: "file_name" },
        { h: "Home", f: (r) => [r.property_type, r.unit_type].filter(Boolean).join(" ") },
        { h: "Build year", k: "build_year" },
        { h: "Template", k: "template_id" },
        { h: "Status", f: (r) => chip(statusLabel(r.status), statusClass(r.status)), html: true },
        { h: "Walls", k: "wall_count", num: true },
        { h: "Open wall ends", k: "open_wall_ends", num: true },
        { h: "Area m2", f: (r) => num(r.floor_area_m2, 1), num: true },
        { h: "Scale from", k: "scale_source" },
        { h: "Failed checks", k: "checks_failed", num: true },
        { h: "Detail", f: issuesCell, html: true }
      ], shown, "No plans have been read yet. Upload a plan, then run the pipeline from the top of the page."));
    };
    main.querySelector("#f-status").addEventListener("change", paint, { signal: ctx.signal });
    paint();
  } catch (err) {
    if (ctx.signal.aborted) return;
    showLoadError(main, err, ctx);
  }
}
