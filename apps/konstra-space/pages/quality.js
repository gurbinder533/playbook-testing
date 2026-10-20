import { esc, renderChrome, showLoadError, kpi, section, dataTable, chip, statusLabel, statusClass, num, METRIC_LABELS } from "../lib/app.js";

function judge(j) {
  if (j === "in") return chip("In spec", "chip moss");
  if (j === "watch") return chip("Watch", "chip oak");
  if (j === "out") return chip("Out of spec", "chip brick");
  return chip(j || "n/a");
}

export default async function render(ctx) {
  const main = renderChrome(ctx, "quality");
  main.innerHTML = `<div class="load-note">Loading</div>`;
  try {
    const [truth, spec, plans, vers] = await Promise.all([
      ctx.db.rows(`SELECT plan, property_type, rooms, doors, area_m2, confirmed, wall_points, door_points FROM truth ORDER BY plan LIMIT 100`, [], ctx.signal),
      ctx.db.rows(`SELECT record_id, calibration_version, metric, value, judged, record_date, label FROM rspec ORDER BY record_id, metric LIMIT 200`, [], ctx.signal),
      ctx.db.rows(`SELECT record_id, plan, status, area_err_pct, doors_marked, doors_placed, doors_right, doors_unverified, rooms_found, scale_source, cost_usd, wall_clock_s FROM rplans ORDER BY record_id, plan LIMIT 200`, [], ctx.signal),
      ctx.db.rows(`SELECT record_id, calibration_version, bytes FROM versions ORDER BY record_id LIMIT 20`, [], ctx.signal)
    ]);
    if (ctx.signal.aborted) return;
    const records = [...new Set(spec.map((s) => s.record_id))];
    const byMetric = new Map();
    for (const s of spec) {
      if (!byMetric.has(s.metric)) byMetric.set(s.metric, {});
      byMetric.get(s.metric)[s.record_id] = s;
    }
    const metricRows = [...byMetric.entries()].filter(([m]) => METRIC_LABELS[m]).map(([m, v]) => ({ metric: m, label: METRIC_LABELS[m], v }));
    const cols = [{ h: "Measure", k: "label" }];
    for (const rec of records) {
      cols.push({ h: rec, f: (r) => r.v[rec] && r.v[rec].value !== null ? `${esc(num(r.v[rec].value, 2))} ${judge(r.v[rec].judged)}` : "n/a", html: true, num: true });
    }
    const confirmed = truth.filter((t) => t.confirmed).length;
    const hdb = truth.filter((t) => t.property_type === "hdb").length;
    const condo = truth.filter((t) => t.property_type === "condo").length;
    const traced = truth.filter((t) => Number(t.wall_points) > 0).length;
    const worst = [...plans].filter((p) => p.area_err_pct !== null).sort((a, b) => Math.abs(b.area_err_pct) - Math.abs(a.area_err_pct)).slice(0, 5);
    main.innerHTML = `
      <h1>Ground truth and reader versions</h1>
      <p class="lede">The reference plans a person has confirmed, and how each reader version measured against them. Counts and measures only. Re-reading every plan when the reader version changes is not wired yet: the stored records below are the results Konstra measured.</p>
      <div class="grid g4">
        ${kpi("Ground truth plans", num(truth.length), `${num(confirmed)} confirmed`)}
        ${kpi("HDB and condo", `${num(hdb)} and ${num(condo)}`, "By property type")}
        ${kpi("With traced walls", num(traced), `${num(truth.length - traced)} without wall points`)}
        ${kpi("Reader records", num(vers.length), vers.map((v) => v.calibration_version).filter(Boolean).join(", ") || "")}
      </div>
      <div style="height:14px"></div>
      ${section("Reader versions against the spec", dataTable(cols, metricRows, "No reader records are loaded."), "Each value is the measured result with its judgement against the signed-off spec.")}
      ${section("Largest area misses in the stored records", dataTable([
        { h: "Record", k: "record_id" }, { h: "Plan", k: "plan" }, { h: "Status", f: (p) => chip(statusLabel(p.status), statusClass(p.status)), html: true },
        { h: "Area error %", f: (p) => num(p.area_err_pct, 1), num: true }, { h: "Doors marked", k: "doors_marked", num: true }, { h: "Doors placed", k: "doors_placed", num: true }, { h: "Unverified doors", k: "doors_unverified", num: true }, { h: "Scale from", k: "scale_source" }
      ], worst, "No plan results are loaded."), "The five plans furthest from the printed area, signed in either direction.")}
      ${section("Ground truth plans", dataTable([
        { h: "Plan", k: "plan" }, { h: "Type", k: "property_type" }, { h: "Rooms", k: "rooms", num: true }, { h: "Doors", k: "doors", num: true }, { h: "Printed area m2", f: (t) => num(t.area_m2, 0), num: true },
        { h: "Wall points", k: "wall_points", num: true }, { h: "Door points", k: "door_points", num: true },
        { h: "Confirmed", f: (t) => chip(t.confirmed ? "Confirmed" : "Not confirmed", t.confirmed ? "chip moss" : "chip brick"), html: true }
      ], truth, "No ground truth is loaded."), "The 14 HDB plans still need to be traced and confirmed in SPACE before they count as ground truth.")}
      ${section("Every plan, every record", dataTable([
        { h: "Record", k: "record_id" }, { h: "Plan", k: "plan" }, { h: "Status", f: (p) => chip(statusLabel(p.status), statusClass(p.status)), html: true }, { h: "Area error %", f: (p) => num(p.area_err_pct, 1), num: true },
        { h: "Rooms found", f: (p) => num(p.rooms_found, 2), num: true }, { h: "Doors right", k: "doors_right", num: true }, { h: "Cost USD", f: (p) => num(p.cost_usd, 3), num: true }, { h: "Seconds", f: (p) => num(p.wall_clock_s, 0), num: true }
      ], plans))}`;
  } catch (err) {
    if (ctx.signal.aborted) return;
    showLoadError(main, err, ctx);
  }
}
