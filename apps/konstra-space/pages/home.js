import { renderChrome, showLoadError, kpi, section, dataTable, chip, statusLabel, statusClass, num } from "../lib/app.js";

export default async function render(ctx) {
  const main = renderChrome(ctx, "home");
  main.innerHTML = `<div class="load-note">Loading</div>`;
  try {
    const [r] = await ctx.db.rows(`SELECT COUNT(*) AS n,
      COUNT(*) FILTER (WHERE status = 'accepted') AS accepted,
      COUNT(*) FILTER (WHERE status = 'confirm_scale') AS confirm,
      COUNT(*) FILTER (WHERE status = 'reader_error' OR status = 'failed') AS failed,
      COALESCE(SUM(checks_failed), 0) AS flags,
      COUNT(*) FILTER (WHERE COALESCE(checks_failed, 0) > 0) AS flagged_reads
      FROM reads`, [], ctx.signal);
    if (ctx.signal.aborted) return;
    const [req] = await ctx.db.rows(`SELECT COUNT(*) AS n FROM requests`, [], ctx.signal);
    const [tpl] = await ctx.db.rows(`SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE lower(confidence) = 'unconfirmed') AS unconfirmed FROM templates`, [], ctx.signal);
    const [gt] = await ctx.db.rows(`SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE confirmed) AS confirmed FROM truth`, [], ctx.signal);
    const [fb] = await ctx.db.rows(`SELECT COALESCE(SUM(corrections), 0) AS n FROM fbtag`, [], ctx.signal);
    const [cy] = await ctx.db.rows(`SELECT COUNT(DISTINCT cycle_id) AS plans, COUNT(*) AS revisions FROM cycles`, [], ctx.signal);
    const checks = await ctx.db.rows(`SELECT template_id, COUNT(*) AS reads, COALESCE(SUM(checks_failed), 0) AS flags FROM reads WHERE template_id IS NOT NULL GROUP BY template_id ORDER BY flags DESC, reads DESC LIMIT 8`, [], ctx.signal);
    const recent = await ctx.db.rows(`SELECT request_id, file_name, property_type, unit_type, template_id, status, checks_failed FROM reads ORDER BY request_id LIMIT 8`, [], ctx.signal);
    const ver = await ctx.db.rows(`SELECT record_id, calibration_version, json_extract_string(record_json, '$.date') AS d, json_extract_string(record_json, '$.overall') AS overall FROM versions ORDER BY record_id DESC LIMIT 1`, [], ctx.signal);
    if (ctx.signal.aborted) return;

    const waiting = Math.max(0, (req?.n ?? 0) - (r?.n ?? 0));
    const readsEmpty = (r?.n ?? 0) === 0;

    main.innerHTML = `
      <h1>Overview</h1>
      <p class="lede">What the reader has done, what the checks found, and what people changed. Plans are read when the pipeline runs: use Run the pipeline above after new plans arrive.</p>
      <div class="grid g4">
        ${kpi("Plans read", num(r?.n), waiting > 0 ? `${num(waiting)} request(s) waiting for a run` : "")}
        ${kpi("Accepted by the checker", num(r?.accepted), `${num(r?.confirm)} need scale confirmation`)}
        ${kpi("Reader errors", num(r?.failed), "Shown with the reason, never guessed")}
        ${kpi("Flags raised", num(r?.flags), `${num(r?.flagged_reads)} read(s) with at least one`)}
      </div>
      <div class="grid g4" style="margin-top:14px">
        ${kpi("Templates", num(tpl?.n), `${num(tpl?.unconfirmed)} marked Unconfirmed`)}
        ${kpi("Ground truth plans", num(gt?.n), `${num(gt?.confirmed)} confirmed`)}
        ${kpi("Corrections received", num(fb?.n), "Only where the person agreed")}
        ${kpi("Signed off plans", num(cy?.plans), `${num(cy?.revisions)} revision(s) kept`)}
      </div>
      <div style="height:14px"></div>
      <div class="grid g2">
        ${section("Flags by template", dataTable([
          { h: "Template", k: "template_id" },
          { h: "Reads", k: "reads", num: true },
          { h: "Flags", k: "flags", num: true }
        ], checks, readsEmpty ? "No plans have been read yet. Upload a plan, then run the pipeline." : "No template was picked for any read yet."), "Which home types raise the most failed checks.")}
        ${section("Latest reads", dataTable([
          { h: "Plan", k: "file_name" },
          { h: "Home", f: (x) => [x.property_type, x.unit_type].filter(Boolean).join(" ") },
          { h: "Template", k: "template_id" },
          { h: "Status", f: (x) => chip(statusLabel(x.status), statusClass(x.status)), html: true },
          { h: "Flags", k: "checks_failed", num: true }
        ], recent, "No plans have been read yet."))}
      </div>
      ${section("Reader version", ver.length ? `<p style="margin:0"><strong>Calibration ${ver[0].calibration_version ? String(ver[0].calibration_version) : "n/a"}</strong> in record ${ver[0].record_id}, dated ${ver[0].d || "n/a"}, overall judged <strong>${ver[0].overall || "n/a"}</strong>.</p>` : `<div class="empty-note">No calibration record is loaded.</div>`, "The latest record loaded from the reader package.")}
    `;
  } catch (err) {
    if (ctx.signal.aborted) return;
    showLoadError(main, err, ctx);
  }
}
