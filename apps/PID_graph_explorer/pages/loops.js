import { esc, renderChrome, loadModel, sheetLabel, confBadge, emptyNote, showLoadError } from "../lib/app.js";

const box = (label, tag, cls) =>
  tag ? `<div class="lp-node ${cls}"><small>${label}</small><b>${esc(tag)}</b></div>` : `<div class="lp-node none"><small>${label}</small><b>-</b></div>`;

export default async function render(ctx) {
  const main = renderChrome(ctx, ctx.route.path);
  main.innerHTML = `<div class="page-h"><h1>Control loops</h1><p>How measurements drive control actions, as drawn: sensor, controller, final element. Loops with no final element are monitoring-only (indication, recording, alarms).</p></div><div id="lbody"><div class="ph">Loading loops...</div></div>`;
  let model;
  try { model = await loadModel(ctx.db, ctx.signal); } catch (err) { showLoadError(ctx, main, err); return; }
  if (ctx.signal.aborted) return;
  const body = main.querySelector("#lbody");
  if (!model.loops.length) { body.innerHTML = emptyNote("No control loops found yet. They appear once your drawings have been read."); return; }

  const vars = [...new Set(model.loops.map((l) => l.variable || "other"))].sort();
  const controlled = model.loops.filter((l) => l.final_element_tag).length;
  body.innerHTML = `
  <div class="kpis small"><div class="kpi"><div class="kpi-v">${model.loops.length}</div><div class="kpi-l">Loops</div></div><div class="kpi"><div class="kpi-v">${controlled}</div><div class="kpi-l">Close the loop on a final element</div></div><div class="kpi"><div class="kpi-v">${model.loops.length - controlled}</div><div class="kpi-l">Monitoring only</div></div></div>
  <div class="toolbar"><div class="chipbar" id="lv"><button class="chip on" data-v="" type="button">All</button>${vars.map((v) => `<button class="chip" data-v="${esc(v)}" type="button">${esc(v)}</button>`).join("")}</div><input id="lq" type="search" placeholder="Search loops, tags" aria-label="Search loops" /></div>
  <div class="loop-grid" id="lgrid"></div>`;
  const $ = (s) => body.querySelector(s);
  let v = "";
  const apply = () => {
    const q = $("#lq").value.trim().toLowerCase();
    const rows = model.loops.filter((l) => (!v || (l.variable || "other") === v) && (!q || `${l.loop_id} ${l.sensor_tag} ${l.controller_tag} ${l.final_element_tag} ${l.description}`.toLowerCase().includes(q)));
    $("#lgrid").innerHTML = rows.slice(0, 200).map((l) => `
    <article class="loop">
      <div class="lp-h"><b>${esc(l.loop_id)}</b><span class="vtag v-${esc(l.variable)}">${esc(l.variable || "other")}</span>${l.final_element_tag ? '<span class="badge conf-high">closed loop</span>' : '<span class="badge conf-na">monitoring</span>'}${confBadge(l.confidence)}</div>
      <div class="lp-flow">${box("Sensor", l.sensor_tag, "s")}<span class="arr">&rarr;</span>${box("Controller", l.controller_tag, "c")}<span class="arr">&rarr;</span>${box("Final element", l.final_element_tag, "f")}</div>
      <p>${esc(l.description)}</p>
      <div class="lp-f">${esc(sheetLabel(l))}</div>
    </article>`).join("") || `<div class="empty-inline">No loops match.</div>`;
  };
  $("#lv").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-v]"); if (!b) return;
    v = b.dataset.v;
    body.querySelectorAll("#lv .chip").forEach((c) => c.classList.toggle("on", c === b));
    apply();
  }, { signal: ctx.signal });
  $("#lq").addEventListener("input", apply, { signal: ctx.signal });
  apply();
}
