import { esc } from "@corvic/live";
export { esc };

export const handoff = { q: "" };
export const CREDIT = "PID2Graph (DLR), CC BY-SA 4.0. Drawings: OPEN100, Energy Impact Center.";
export const PIPELINE_URL = "/pipeline/28418";
export const TABS = [
  ["home", "Home"],
  ["graph", "Graph Explorer"],
  ["ask", "Ask the Plant"],
  ["qa", "QA review"],
  ["drawings", "My drawings"],
  ["tags", "Tag matching"],
];
export const SEV_RANK = { high: 0, medium: 1, low: 2, info: 3 };
export const KIND_COLOR = { equipment: "#f5b72b", pump: "#f5b72b", tank: "#f5b72b", instrument: "#a78bfa", valve: "#7dd3fc", "line label": "#4f7cf0", "off-page connector": "#2dd4bf", border: "#94a3b8" };
export const CATS = [["equipment", "Equipment", "#f5b72b"], ["valve", "Valve", "#7dd3fc"], ["instrument", "Instrument", "#a78bfa"], ["line", "Line / Fitting", "#4f7cf0"], ["stream", "Stream / Off-page", "#2dd4bf"]];
export const catOf = (k) => (k === "equipment" || k === "pump" || k === "tank" ? "equipment" : k === "valve" ? "valve" : k === "instrument" ? "instrument" : k === "line label" ? "line" : "stream");
export const thumbSvg = () => `<svg viewBox="0 0 300 84" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g fill="none" stroke="#8b6cf0" stroke-width="3" stroke-linecap="round"><path d="M0 30H300"/><path d="M0 62H300" opacity=".55"/><path d="M96 30V62"/><rect x="48" y="38" width="34" height="34" rx="9" fill="#14103a"/><path d="M118 22l14 8-14 8z M146 22l-14 8 14 8z" fill="#14103a"/><path d="M176 54l14 8-14 8z M204 54l-14 8 14 8z" fill="#14103a"/><circle cx="248" cy="40" r="13" stroke="#2dd4bf"/><path d="M248 53V62" stroke="#2dd4bf"/><circle cx="222" cy="14" r="10" stroke="#2dd4bf"/><path d="M222 24V30" stroke="#2dd4bf"/></g></svg>`;
export const KIND_LABEL = { equipment: "Equipment", instrument: "Instrument", valve: "Valve", pump: "Pump", tank: "Tank", "off-page connector": "Off-page", border: "Border", "line label": "Line" };
export const CLASSES = [["valve", "Valves"], ["instrumentation", "Instruments"], ["pump", "Pumps"], ["tank", "Tanks"]];

export const creditHtml = () => `<p class="credit">${esc(CREDIT)}</p>`;
export const sheetHref = (id) => "sheet/" + encodeURIComponent(id);
export const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
export const sevBadge = (s) => `<span class="sev sev-${esc(s)}">${esc(s)}</span>`;
export const trunc = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n) + "…" : s; };

export function shell(active, inner) {
  setTimeout(() => { const on = document.querySelector(".pill.on"); if (on) on.scrollIntoView({ inline: "center", block: "nearest" }); }, 0);
  const pills = TABS.map(([p, l]) => `<a class="pill${p === active ? " on" : ""}" href="${p}"${p === active ? ' aria-current="page"' : ""}>${esc(l)}</a>`).join("");
  return `<header class="topbar"><div class="topin"><a class="brand" href="home"><img class="evlogo" src="assets/evonik-logo.svg" alt="Evonik"><b>P&amp;ID Demo</b></a><nav class="pills" aria-label="Sections">${pills}</nav><span class="built">Built on Corvic</span></div></header><main class="page">${inner}</main>`;
}

export function table(cols, rows, empty = "Nothing here.") {
  if (!rows.length) return `<p class="muted">${esc(empty)}</p>`;
  const head = cols.map((c) => `<th>${esc(c[0])}</th>`).join("");
  const body = rows.map((r) => `<tr>${cols.map((c) => `<td>${c[1](r)}</td>`).join("")}</tr>`).join("");
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function loadScript(src) {
  const existing = document.head.querySelector(`script[src="${src}"]`);
  if (existing) return existing.corvicLoaded;
  const script = document.createElement("script");
  script.src = src;
  script.corvicLoaded = new Promise((resolve, reject) => {
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => reject(new Error(`could not load ${src}`)));
  });
  document.head.appendChild(script);
  return script.corvicLoaded;
}

/** Ids of the signed-in reader's own uploads (their rows only: the server filters this table). */
export async function myIds(ctx) {
  try {
    const rows = await ctx.db.rows(`SELECT upload_id, bool_or(action = 'deleted') AS del FROM uplog GROUP BY upload_id LIMIT 500`, [], ctx.signal);
    return rows.filter((r) => !r.del && /^[0-9A-Za-z-]{8,64}$/.test(r.upload_id)).map((r) => r.upload_id);
  } catch (e) {
    if (!ctx.signal.aborted) ctx.reportError(e);
    return [];
  }
}

/** SQL predicate for tables with `source` and `drawing_id`: the samples plus the reader's own uploads. */
export function vis(ids) {
  const list = ids.filter((i) => /^[0-9A-Za-z-]{8,64}$/.test(i)).map((i) => `'${i}'`);
  return list.length ? `(source = 'sample' OR split_part(drawing_id, ':', 2) IN (${list.join(",")}))` : `source = 'sample'`;
}

export function imgUrl(b64, mime) {
  try {
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([u], { type: mime }));
  } catch {
    return `data:${mime};base64,${b64}`;
  }
}

export function setImg(img, b64, mime) {
  img.src = imgUrl(b64, mime);
  img.addEventListener("error", () => {
    if (!img.dataset.fb) {
      img.dataset.fb = "1";
      img.src = `data:${mime};base64,${b64}`;
    }
  });
}

/** Drag-to-compare: original on the left of the handle, rebuilt on the right. */
export function mountCompare(root, orig, rebuilt, w, h, signal) {
  root.innerHTML = `<div class="cmp" style="aspect-ratio:${w || 4}/${h || 3}"><img class="cmp-a" alt="Original drawing"><div class="cmp-b"><img alt="Rebuilt drawing"></div><span class="cmp-l">Original</span><span class="cmp-r">Rebuilt ▸</span><div class="cmp-h" role="slider" tabindex="0" aria-label="Slide to compare" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50"><i></i></div></div><div class="jump">Jump to: <button type="button" data-p="100">Original only</button><button type="button" data-p="50">Half and half</button><button type="button" data-p="0">Rebuilt only</button></div>`;
  const box = root.querySelector(".cmp");
  const top = root.querySelector(".cmp-b");
  const handle = root.querySelector(".cmp-h");
  setImg(box.querySelector(".cmp-a"), orig, "image/jpeg");
  setImg(top.querySelector("img"), rebuilt, "image/png");
  const set = (p) => {
    p = Math.max(0, Math.min(100, p));
    top.style.clipPath = `inset(0 0 0 ${p}%)`;
    handle.style.left = p + "%";
    handle.setAttribute("aria-valuenow", String(Math.round(p)));
    handle.dataset.p = String(p);
  };
  set(50);
  let drag = false;
  const move = (e) => { const r = box.getBoundingClientRect(); set(((e.clientX - r.left) / r.width) * 100); };
  box.addEventListener("pointerdown", (e) => { drag = true; box.setPointerCapture(e.pointerId); move(e); }, { signal });
  box.addEventListener("pointermove", (e) => { if (drag) move(e); }, { signal });
  box.addEventListener("pointerup", () => { drag = false; }, { signal });
  handle.addEventListener("keydown", (e) => {
    const p = Number(handle.dataset.p || 50);
    if (e.key === "ArrowLeft") set(p - 5);
    if (e.key === "ArrowRight") set(p + 5);
  }, { signal });
  root.querySelectorAll(".jump button").forEach((b) => b.addEventListener("click", () => set(Number(b.dataset.p)), { signal }));
}
