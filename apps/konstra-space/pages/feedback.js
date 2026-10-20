import { renderChrome, showLoadError, kpi, section, dataTable, num } from "../lib/app.js";

export default async function render(ctx) {
  const main = renderChrome(ctx, "feedback");
  main.innerHTML = `<div class="load-note">Loading</div>`;
  try {
    const [rules, tags, tt, plans] = await Promise.all([
      ctx.db.rows(`SELECT rank, tag, action, times, plans, rule FROM rules ORDER BY rank LIMIT 10`, [], ctx.signal),
      ctx.db.rows(`SELECT tag, corrections, plans, moved, added, removed, scale_changes FROM fbtag ORDER BY corrections DESC LIMIT 50`, [], ctx.signal),
      ctx.db.rows(`SELECT template_key, source_key, plans, walls_read, moved, added, removed, thickness_changed, joins, scale_changes, avg_time_to_confirm_s FROM fbtt ORDER BY plans DESC LIMIT 100`, [], ctx.signal),
      ctx.db.rows(`SELECT request_id, walls_read, kept, moved, added, removed, thickness_changed, joins, scale_changes, time_to_confirm_s, template_id, plan_source FROM fbplan ORDER BY corrections DESC LIMIT 100`, [], ctx.signal)
    ]);
    if (ctx.signal.aborted) return;
    const total = tags.reduce((a, t) => a + Number(t.corrections || 0), 0);
    main.innerHTML = `
      <h1>Feedback and reader rules</h1>
      <p class="lede">Every correction a person made in Confirm, stored only where they agreed. Repeat mistakes become plain rules that feed the template checks.</p>
      <div class="grid g4">
        ${kpi("Corrections", num(total))}
        ${kpi("Plans corrected", num(plans.length))}
        ${kpi("Tags in use", num(tags.length))}
        ${kpi("Rules written", num(rules.length), "Top 10 repeat mistakes")}
      </div>
      <div style="height:14px"></div>
      ${section("Reader rules", dataTable([
        { h: "#", k: "rank", num: true }, { h: "Tag", k: "tag" }, { h: "Action", k: "action" }, { h: "Times", k: "times", num: true }, { h: "Plans", k: "plans", num: true }, { h: "Rule", k: "rule" }
      ], rules, "No corrections have arrived yet, so there are no rules. They appear after SPACE sends feedback with consent and the pipeline runs."), "The ten most repeated mistakes, one plain rule each.")}
      <div class="grid g2">
        ${section("By tag", dataTable([
          { h: "Tag", k: "tag" }, { h: "Corrections", k: "corrections", num: true }, { h: "Plans", k: "plans", num: true }, { h: "Moved", k: "moved", num: true }, { h: "Added", k: "added", num: true }, { h: "Removed", k: "removed", num: true }, { h: "Scale changes", k: "scale_changes", num: true }
        ], tags, "Nothing yet."), "Why the reader missed: image, style, symbol, scale, clutter, type or reader.")}
        ${section("By template and plan source", dataTable([
          { h: "Template", k: "template_key" }, { h: "Source", k: "source_key" }, { h: "Plans", k: "plans", num: true }, { h: "Walls read", k: "walls_read", num: true }, { h: "Moved", k: "moved", num: true }, { h: "Added", k: "added", num: true }, { h: "Removed", k: "removed", num: true }, { h: "Avg seconds to confirm", k: "avg_time_to_confirm_s", num: true }
        ], tt, "Nothing yet."))}
      </div>
      ${section("Per plan", dataTable([
        { h: "Request", k: "request_id" }, { h: "Template", k: "template_id" }, { h: "Source", k: "plan_source" }, { h: "Walls read", k: "walls_read", num: true }, { h: "Kept", k: "kept", num: true }, { h: "Moved", k: "moved", num: true }, { h: "Added", k: "added", num: true }, { h: "Removed", k: "removed", num: true }, { h: "Thickness", k: "thickness_changed", num: true }, { h: "Joins", k: "joins", num: true }, { h: "Scale changes", k: "scale_changes", num: true }, { h: "Seconds to confirm", k: "time_to_confirm_s", num: true }
      ], plans, "Nothing yet."))}`;
  } catch (err) {
    if (ctx.signal.aborted) return;
    showLoadError(main, err, ctx);
  }
}
