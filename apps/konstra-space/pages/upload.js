import { esc, renderChrome, showLoadError, section, dataTable } from "../lib/app.js";
import { WriteRejectedError, WriteSessionExpiredError } from "@corvic/live";

const MAX_BYTES = 1_500_000;
const PLAN_SOURCES = ["HDB BTO brochure", "HDB resale plan", "Developer brochure", "Architect or CAD drawing", "Photo of a printed plan", "Hand sketch"];
const PROPERTY_TYPES = ["HDB", "EC", "Condo", "Landed", "Commercial"];

// Module state outlives ctx.reload().
let flash = "";

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export default async function render(ctx) {
  const main = renderChrome(ctx, "upload");
  main.innerHTML = `<div class="load-note">Loading</div>`;
  try {
    const [tpl, recent] = await Promise.all([
      ctx.db.rows(`SELECT property_type, unit_type FROM templates GROUP BY property_type, unit_type ORDER BY property_type, unit_type LIMIT 200`, [], ctx.signal),
      ctx.db.rows(`SELECT request_id, created_at, file_name, property_type, unit_type, plan_source, build_year, floor_area, area_unit FROM requests ORDER BY created_at DESC LIMIT 20`, [], ctx.signal)
    ]);
    if (ctx.signal.aborted) return;
    const message = flash;
    flash = "";
    const opt = (list) => list.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    main.innerHTML = `
      <h1>Upload a plan</h1>
      <p class="lede">Send a plan to the reader with the answers that narrow it. A 3-room flat is read as a 3-room flat, with one template. The plan is read the next time the pipeline runs: use Run the pipeline above, then open Plan reads.</p>
      ${message ? `<div class="flash" role="status">${esc(message)}</div>` : ""}
      <section class="card"><form id="f" novalidate>
        <div class="form-grid">
          <label class="field"><span class="lab">Plan image</span><span class="hint">JPEG or PNG, up to 1.5 MB. Export a PDF page as an image first.</span><input type="file" id="file" accept="image/jpeg,image/png" required></label>
          <label class="field"><span class="lab">Property type</span><span class="hint">Required</span><select id="ptype" required><option value="">Choose</option>${opt(PROPERTY_TYPES)}</select></label>
          <label class="field"><span class="lab">Unit type</span><span class="hint">Required. Narrows the template and rooms.</span><select id="utype" required><option value="">Choose a property type first</option></select></label>
          <label class="field"><span class="lab">Where the plan came from</span><span class="hint">Required</span><select id="psource" required><option value="">Choose</option>${opt(PLAN_SOURCES)}</select></label>
          <label class="field"><span class="lab">Build or completion year</span><span class="hint">Optional, strongly suggested</span><input type="number" id="year" min="1950" max="2100" step="1" placeholder="For example 2015"></label>
          <label class="field"><span class="lab">Floor area</span><span class="hint">Optional. A second scale check.</span><input type="number" id="area" min="0" step="any"></label>
          <label class="field"><span class="lab">Area unit</span><span class="hint">Unit of the floor area</span><select id="unit"><option value="m2">m2</option><option value="sqft">sq ft</option></select></label>
          <label class="field"><span class="lab">One known dimension in mm</span><span class="hint">Optional. The main scale source.</span><input type="number" id="dim" min="1" step="1"></label>
          <label class="field"><span class="lab">Storeys</span><span class="hint">Optional</span><select id="storeys"><option value="">Not sure</option><option>1</option><option>2</option><option>3 or more</option></select></label>
          <label class="field"><span class="lab">Before or after keys</span><span class="hint">Optional. Brochure or site measured.</span><select id="keys"><option value="">Not sure</option><option value="before">Before keys (brochure)</option><option value="after">After keys (site measured)</option></select></label>
          <label class="field"><span class="lab">Which unit on the page</span><span class="hint">Unit label, or mirrored yes or no</span><input type="text" id="onpage" maxlength="80"></label>
          <label class="field"><span class="lab">Person or team</span><span class="hint">Optional label for this read</span><input type="text" id="person" maxlength="80"></label>
        </div>
        <p style="margin:14px 0 0"><label><input type="checkbox" id="consent"> The person agreed that this plan and their corrections may be stored to train the reader.</label></p>
        <div class="form-actions"><button type="submit" class="btn" id="send">Send to the reader</button><span id="msg" role="status"></span></div>
      </form></section>
      ${section("Recent requests", dataTable([
        { h: "Sent", k: "created_at" }, { h: "Plan", k: "file_name" }, { h: "Type", k: "property_type" }, { h: "Unit", k: "unit_type" }, { h: "Source", k: "plan_source" }, { h: "Year", k: "build_year" },
        { h: "Area", f: (r) => r.floor_area ? `${r.floor_area} ${r.area_unit || ""}` : "" }
      ], recent, "No plans have been sent yet."), "A request stays here until the pipeline reads it.")}`;

    const ptype = main.querySelector("#ptype");
    const utype = main.querySelector("#utype");
    ptype.addEventListener("change", () => {
      const list = [...new Set(tpl.filter((t) => t.property_type === ptype.value).map((t) => t.unit_type))];
      utype.innerHTML = `<option value="">${ptype.value ? "Choose" : "Choose a property type first"}</option>${opt(list)}<option value="Not sure">Not sure</option>`;
    }, { signal: ctx.signal });

    const form = main.querySelector("#f");
    const msg = main.querySelector("#msg");
    const send = main.querySelector("#send");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      msg.className = "";
      const file = main.querySelector("#file").files[0];
      if (!file) { msg.className = "err"; msg.textContent = "Choose a plan image first."; return; }
      if (file.size > MAX_BYTES) { msg.className = "err"; msg.textContent = "That image is over 1.5 MB. Export a smaller JPEG and try again."; return; }
      if (!ptype.value || !utype.value || !main.querySelector("#psource").value) { msg.className = "err"; msg.textContent = "Property type, unit type and where the plan came from are needed."; return; }
      send.disabled = true;
      msg.textContent = "Sending";
      try {
        const b64 = toBase64(await file.arrayBuffer());
        if (ctx.signal.aborted) return;
        const v = (id) => main.querySelector(id).value.trim();
        await ctx.write.rows("requests", [{
          request_id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          person_id: v("#person"),
          file_name: file.name,
          image_b64: b64,
          image_mime: file.type || "image/jpeg",
          property_type: ptype.value,
          unit_type: utype.value === "Not sure" ? "" : utype.value,
          plan_source: v("#psource"),
          build_year: v("#year"),
          floor_area: v("#area"),
          area_unit: v("#unit"),
          known_dimension_mm: v("#dim"),
          unit_on_page: v("#onpage"),
          storeys: v("#storeys"),
          before_after_keys: v("#keys"),
          consent: main.querySelector("#consent").checked ? "true" : "false"
        }], { signal: ctx.signal });
        flash = `Sent ${file.name}. Run the pipeline to read it.`;
        await ctx.reload();
      } catch (err) {
        if (ctx.signal.aborted) return;
        send.disabled = false;
        msg.className = "err";
        if (err instanceof WriteSessionExpiredError) msg.textContent = "Your session expired. Reload and try again. Nothing was saved.";
        else if (err instanceof WriteRejectedError) msg.textContent = err.message;
        else msg.textContent = `Nothing was saved: ${err && err.message ? err.message : err}`;
        ctx.reportError(err);
      }
    }, { signal: ctx.signal });
  } catch (err) {
    if (ctx.signal.aborted) return;
    showLoadError(main, err, ctx);
  }
}
