import { esc } from "@corvic/live";

export { esc };

/** The stored pipeline target app.yaml declares under pipelines[]. */
const RUN_URL = "/pipeline/20451";

const TABS = [
  { href: "home", path: "home", label: "Overview" },
  { href: "reads", path: "reads", label: "Plan reads" },
  { href: "review", path: "review", label: "Review" },
  { href: "templates", path: "templates", label: "Templates" },
  { href: "feedback", path: "feedback", label: "Feedback" },
  { href: "quality", path: "quality", label: "Ground truth" },
  { href: "cycles", path: "cycles", label: "Sign-offs" },
  { href: "upload", path: "upload", label: "Upload a plan" }
];

export const METRIC_LABELS = {
  S1_bias_pct: "Bias, median signed area error (%)",
  S2_median_err_pct: "Median area error (%)",
  S3_accepted_within30: "Accepted plans within 30% (share, 0 to 1)",
  S4_worst_accepted_pct: "Worst accepted plan, area error (%)",
  S5_confirm_rate: "Sent to Confirm (share, 0 to 1)",
  S6_door_err: "Door error per plan",
  S7_rooms_found: "Rooms found (share, 0 to 1)",
  S8_no_reading: "Plans with no reading",
  S9_cost_usd: "Cost per plan (USD)",
  S10_wall_clock_s: "Wall clock per plan (s)",
  S12_slab_area_err_pct: "3D slab area error, median (%)",
  S13_doors_found: "Real doors found (share, 0 to 1)",
  S14_doors_right: "Confirmed doors on the right spot (share, 0 to 1)",
  S15_door_call_failures: "Door check calls that failed",
  S16_unverified_doors: "Unverified doors per plan",
  S17_anchor_door_pct: "Door ruler against entered area (%)"
};

export function num(value, digits = 0) {
  if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) return "n/a";
  return Number(value).toLocaleString("en-SG", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function statusLabel(status) {
  switch (status) {
    case "accepted": return "Accepted by the checker";
    case "confirm_scale": return "Needs scale confirmation";
    case "reader_error": return "Reader error";
    case "failed": return "No reading";
    default: return status ? String(status) : "n/a";
  }
}

export function statusClass(status) {
  if (status === "accepted") return "chip moss";
  if (status === "confirm_scale") return "chip oak";
  if (status === "reader_error" || status === "failed") return "chip brick";
  return "chip";
}

export function chip(text, cls = "chip") {
  return `<span class="${cls}">${esc(text)}</span>`;
}

export function kpi(label, value, sub = "") {
  return `<div class="kpi"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div>${sub ? `<div class="kpi-sub">${esc(sub)}</div>` : ""}</div>`;
}

/** columns: { h, k | f, num, html, cls } ; with html true, f must return escaped markup. */
export function dataTable(columns, rows, emptyText = "Nothing here yet.") {
  if (!rows.length) return `<div class="empty-note">${esc(emptyText)}</div>`;
  const head = columns.map((c) => `<th class="${c.num ? "num" : ""}">${esc(c.h)}</th>`).join("");
  const body = rows.map((r) => `<tr>${columns.map((c) => {
    const v = c.f ? c.f(r) : r[c.k];
    const cell = c.html ? (v ?? "") : esc(v === null || v === undefined || v === "" ? "n/a" : v);
    return `<td class="${c.num ? "num" : ""}">${cell}</td>`;
  }).join("")}</tr>`).join("");
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function section(title, bodyHtml, note = "") {
  return `<section class="card"><div class="card-head"><h2>${esc(title)}</h2>${note ? `<p class="note">${esc(note)}</p>` : ""}</div>${bodyHtml}</section>`;
}

export function showLoadError(main, err, ctx) {
  const msg = err && err.message ? err.message : String(err);
  main.innerHTML = `<div class="load-note">Couldn't load this view: ${esc(msg)}</div>`;
  if (ctx) ctx.reportError(err);
}

// Module state outlives ctx.reload(): the module is imported once.
let runMessage = "";
let runStarted = false;

function wireRun(ctx, root) {
  const slot = root.querySelector("#run-slot");
  const status = root.querySelector("#run-status");
  const btn = root.querySelector("#run-btn");
  status.textContent = runMessage;
  if (runStarted) btn.disabled = true;

  btn.addEventListener("click", () => {
    status.innerHTML = `Run every step now? A full run reads new requests and may call the models. <button type="button" class="btn small" id="run-yes">Run</button> <button type="button" class="btn small ghost" id="run-no">Cancel</button>`;
    const yes = slot.querySelector("#run-yes");
    const no = slot.querySelector("#run-no");
    no.addEventListener("click", () => { status.textContent = runMessage; }, { signal: ctx.signal });
    yes.addEventListener("click", async () => {
      btn.disabled = true;
      status.textContent = "Starting";
      try {
        const response = await fetch(RUN_URL, { method: "POST", signal: ctx.signal });
        if (response.headers.get("x-corvic-error-reason") === "SIGN_IN_REQUIRED") {
          btn.disabled = false;
          runMessage = "Login to use the app.";
          status.textContent = runMessage;
          return;
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error("You can't start this run. Reload the page; if it still fails, ask the app's owner to let you run pipelines.");
        }
        if (response.status === 429) throw new Error("This has been run a lot recently. Try again later.");
        if (!response.ok) throw new Error(`Couldn't start the run (${response.status}). Try again in a minute.`);
        runStarted = true;
        runMessage = response.status === 202
          ? "A run started moments ago is still going. New data appears when it finishes, then press Reload."
          : "Run started. New data appears when it finishes, then press Reload.";
        status.textContent = runMessage;
      } catch (err) {
        if (ctx.signal.aborted) return;
        btn.disabled = false;
        runMessage = err instanceof Error ? err.message : String(err);
        status.textContent = runMessage;
        ctx.reportError(err);
      }
    }, { signal: ctx.signal });
  }, { signal: ctx.signal });
}

/** Draws the header, tabs and run control; returns the element the page paints into. */
export function renderChrome(ctx, current) {
  ctx.content.innerHTML = `
<div id="app">
  <header id="top">
    <div class="brand"><span class="mark">S</span><div><div class="brand-name">SPACE</div><div class="brand-sub">Plan reading console</div></div></div>
    <div class="run" id="run-slot"><button type="button" class="btn" id="run-btn">Run the pipeline</button><span id="run-status" role="status"></span></div>
  </header>
  <nav id="tabs">${TABS.map((t) => `<a class="tab" href="${t.href}"${t.path === current ? ' aria-current="page"' : ""}>${esc(t.label)}</a>`).join("")}</nav>
  <main id="main"></main>
</div>`;
  wireRun(ctx, ctx.content);
  return ctx.content.querySelector("#main");
}
