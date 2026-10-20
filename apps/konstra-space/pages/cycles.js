import { renderChrome, showLoadError, kpi, section, dataTable, chip, num } from "../lib/app.js";

export default async function render(ctx) {
  const main = renderChrome(ctx, "cycles");
  main.innerHTML = `<div class="load-note">Loading</div>`;
  try {
    const rows = await ctx.db.rows(`SELECT cycle_id, request_id, revision, signed_at, signer_name, signer_role, confirm_seconds, edit_count, is_latest FROM cycles ORDER BY cycle_id, revision DESC LIMIT 300`, [], ctx.signal);
    if (ctx.signal.aborted) return;
    const plans = new Set(rows.map((r) => r.cycle_id)).size;
    const latest = rows.filter((r) => r.is_latest);
    const secs = latest.map((r) => Number(r.confirm_seconds)).filter((v) => Number.isFinite(v));
    const avg = secs.length ? secs.reduce((a, b) => a + b, 0) / secs.length : null;
    main.innerHTML = `
      <h1>Sign-offs and revisions</h1>
      <p class="lede">A plan is signed off by a named person with a role and a date. An edit after sign-off creates revision 1, 2 and so on. Earlier revisions are kept.</p>
      <div class="grid g4">
        ${kpi("Signed off plans", num(plans))}
        ${kpi("Revisions kept", num(rows.length))}
        ${kpi("Revised after sign-off", num(latest.filter((r) => Number(r.revision) > 0).length))}
        ${kpi("Average seconds to confirm", num(avg, 0))}
      </div>
      <div style="height:14px"></div>
      ${section("Every revision", dataTable([
        { h: "Plan cycle", k: "cycle_id" }, { h: "Request", k: "request_id" }, { h: "Revision", k: "revision", num: true },
        { h: "Signed by", f: (r) => [r.signer_name, r.signer_role].filter(Boolean).join(", ") }, { h: "Signed at", k: "signed_at" },
        { h: "Edits since the reading", k: "edit_count", num: true }, { h: "Seconds to confirm", f: (r) => num(r.confirm_seconds, 0), num: true },
        { h: "", f: (r) => r.is_latest ? chip("Latest", "chip moss") : chip("Earlier"), html: true }
      ], rows, "Nothing has been signed off yet. SPACE sends a cycle package when a person signs off a plan in Confirm."))}`;
  } catch (err) {
    if (ctx.signal.aborted) return;
    showLoadError(main, err, ctx);
  }
}
