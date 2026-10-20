import { esc, renderChrome, showLoadError, section, dataTable, chip, num } from "../lib/app.js";

export default async function render(ctx) {
  const main = renderChrome(ctx, "templates");
  main.innerHTML = `<div class="load-note">Loading</div>`;
  try {
    const [tpl, consts, checks, qs, srcs] = await Promise.all([
      ctx.db.rows(`SELECT template_id, property_type, unit_type, era, area_min_m2, area_max_m2, typical_m2, bedrooms, shelter_expected, levels, plan_cues, confidence, source_key, min_plot_m2 FROM templates ORDER BY property_type, template_id LIMIT 200`, [], ctx.signal),
      ctx.db.rows(`SELECT "Group" AS grp, "Parameter" AS param, "Value" AS val, "Unit" AS unit, "Applies to" AS applies, "Confidence" AS conf, "Source key" AS src, "Use in reader" AS use_in FROM constants LIMIT 100`, [], ctx.signal),
      ctx.db.rows(`SELECT "#" AS n, "Check" AS chk, "Rule" AS rule, "When it fires" AS fires, "Action" AS act FROM checks ORDER BY "#" LIMIT 50`, [], ctx.signal),
      ctx.db.rows(`SELECT "#" AS n, "Question" AS q, "Must or optional" AS must, "Options" AS opts, "What it narrows" AS narrows FROM questions ORDER BY "#" LIMIT 50`, [], ctx.signal),
      ctx.db.rows(`SELECT "Key" AS k, "Source" AS s, "Link" AS l FROM sources ORDER BY "Key" LIMIT 100`, [], ctx.signal)
    ]);
    if (ctx.signal.aborted) return;
    const types = [...new Set(tpl.map((t) => t.property_type))];
    const unconfirmed = tpl.filter((t) => String(t.confidence || "").toLowerCase() === "unconfirmed").length;
    main.innerHTML = `
      <h1>Templates, constants and checks</h1>
      <p class="lede">The parameter tables the reader and the checks run against. ${num(tpl.length)} templates, ${num(consts.length)} constants, ${num(checks.length)} checks. ${num(unconfirmed)} template(s) are marked Unconfirmed: they give a note, not a flag. Re-uploading a CSV refreshes its table after the next run.</p>
      <div class="toolbar"><label class="small">Home type <select id="f-type"><option value="">All</option>${types.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join("")}</select></label>
      <label class="small">Constant group <select id="f-group"><option value="">All</option>${[...new Set(consts.map((c) => c.grp))].map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join("")}</select></label></div>
      <div id="tpl"></div><div id="const"></div>
      ${section("Reader checks", dataTable([
        { h: "#", k: "n", num: true }, { h: "Check", k: "chk" }, { h: "Rule", k: "rule" }, { h: "When it fires", k: "fires" }, { h: "Action", k: "act" }
      ], checks), "Each check produces a flag or a note for the person confirming. A check never changes the plan on its own.")}
      ${section("Upload questions", dataTable([
        { h: "#", k: "n", num: true }, { h: "Question", k: "q" }, { h: "Must or optional", k: "must" }, { h: "Options", k: "opts" }, { h: "What it narrows", k: "narrows" }
      ], qs), "Asked in this order before a plan is sent.")}
      ${section("Sources", dataTable([
        { h: "Key", k: "k" }, { h: "Source", k: "s" }, { h: "Link", k: "l" }
      ], srcs), "Source keys used in the templates and constants.")}`;
    const range = (t) => {
      if (t.area_min_m2 !== null && t.area_max_m2 !== null) return t.area_min_m2 === t.area_max_m2 ? num(t.area_min_m2, 1) : `${num(t.area_min_m2, 1)} to ${num(t.area_max_m2, 1)}`;
      if (t.area_max_m2 !== null) return `up to ${num(t.area_max_m2, 1)}`;
      if (t.min_plot_m2 !== null) return `plot from ${num(t.min_plot_m2, 0)}`;
      return "n/a";
    };
    const paint = () => {
      const ft = main.querySelector("#f-type").value;
      const fg = main.querySelector("#f-group").value;
      const t = tpl.filter((x) => !ft || x.property_type === ft);
      const c = consts.filter((x) => !fg || x.grp === fg);
      main.querySelector("#tpl").innerHTML = section("Home type templates", dataTable([
        { h: "Template", k: "template_id" }, { h: "Type", k: "property_type" }, { h: "Unit", k: "unit_type" }, { h: "Era", k: "era" },
        { h: "Area m2", f: range, num: true }, { h: "Bedrooms", k: "bedrooms" }, { h: "Shelter", k: "shelter_expected" }, { h: "Levels", k: "levels" },
        { h: "Plan cues", k: "plan_cues" },
        { h: "Confidence", f: (x) => chip(x.confidence || "n/a", String(x.confidence || "").toLowerCase() === "unconfirmed" ? "chip brick" : "chip"), html: true },
        { h: "Source", k: "source_key" }
      ], t), "Condo and EC areas are converted from sq ft by dividing by 10.764.");
      main.querySelector("#const").innerHTML = section("Constants", dataTable([
        { h: "Group", k: "grp" }, { h: "Parameter", k: "param" }, { h: "Value", k: "val" }, { h: "Unit", k: "unit" }, { h: "Applies to", k: "applies" },
        { h: "Confidence", k: "conf" }, { h: "Source", k: "src" }, { h: "Use in reader", k: "use_in" }
      ], c), "Official values come from HDB, SCDF, BCA and URA. Secondary values are from property media and should be replaced by values measured from confirmed plans.");
    };
    main.querySelector("#f-type").addEventListener("change", paint, { signal: ctx.signal });
    main.querySelector("#f-group").addEventListener("change", paint, { signal: ctx.signal });
    paint();
  } catch (err) {
    if (ctx.signal.aborted) return;
    showLoadError(main, err, ctx);
  }
}
