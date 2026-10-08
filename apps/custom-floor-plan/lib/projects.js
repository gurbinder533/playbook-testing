import { esc, WriteRejectedError, WriteSessionExpiredError } from "@corvic/live";

export { esc };

export const SAMPLE_ID = "sample";
export const BLANK_IMG = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
export const ICON = '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true"><path d="M13 2 24 8v11l-11 6L2 19V8L13 2Z M2 8l11 6 11-6 M13 14v11 M7.5 5 19 11v7" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';

const SAMPLE_PHOTOS = [
  { file: "IMG_2206.jpg", title: "Work area & lounge", note: "Ceiling lights, white desks, rolling whiteboard and black lounge seating." },
  { file: "IMG_2207.jpg", title: "Kitchenette & circulation", note: "White cabinetry, dark counter, sink, coffee equipment and glass-framed openings." },
  { file: "IMG_2208.jpg", title: "Windows & workstations", note: "Tall windows with vertical blinds, multi-monitor desks and gray carpet." },
  { file: "IMG_2209.jpg", title: "Desk and glass details", note: "White desk frames, task chairs, black-framed glass and striped carpet." },
  { file: "IMG_2210.jpg", title: "Glass enclosure & lounge", note: "Full-height glass, white cabinetry, mobile whiteboards and dark seating." }
].map((p) => ({ name: p.file, src: "assets/photos/" + p.file, title: p.title, note: p.note }));

// Module state outlives ctx.reload(): rows this session wrote that a cached read may not show yet.
const written = { projects: new Map(), images: new Map(), traces: new Map() };
const ms = (value) => new Date(value).getTime();
let flash = "";
export const setFlash = (text) => { flash = text; };
export const takeFlash = () => { const text = flash; flash = ""; return text; };
export const newId = () => crypto.randomUUID();

/** The newest version of every record, minus deleted ones. `where` filters before versions are ranked. */
function latest(table, columns, where = "") {
  return `SELECT ${columns} FROM (SELECT *, row_number() OVER (PARTITION BY id ORDER BY updated_at DESC) AS rn FROM ${table}${where}) WHERE rn = 1 AND deleted IS NOT TRUE`;
}

function merge(table, rows, keep) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  for (const [id, row] of [...written[table]]) {
    const read = byId.get(id);
    if (read && ms(read.updated_at) >= ms(row.updated_at)) {
      written[table].delete(id);
    } else if (row.deleted) {
      byId.delete(id);
    } else if (keep(row)) {
      byId.set(id, row);
    }
  }
  return [...byId.values()];
}

function friendly(err) {
  if (err instanceof WriteSessionExpiredError) {
    return "Your session expired — reload and try again. Nothing was saved.";
  }
  const message = err && err.message ? err.message : String(err);
  if (err && (err.kind === "write-sign-in-required" || /sign.?in|sign.?up|log.?in/i.test(message))) {
    return "Login to use the app. Nothing was saved.";
  }
  return err instanceof WriteRejectedError ? message : `Nothing was saved: ${message}`;
}

/** Append one version of a record. Resolves to the text to show when it did not land, or "". */
export async function saveRow(ctx, table, row) {
  const full = { ...row, updated_at: new Date().toISOString() };
  try {
    await ctx.write.rows(table, [full], { signal: ctx.signal });
  } catch (err) {
    return friendly(err);
  }
  written[table].set(full.id, full);
  return "";
}

/** Whether the reader has an account. `known` is false on a runtime that cannot say. */
export async function reader(ctx) {
  if (typeof ctx.reader !== "function") {
    return { known: false, signedIn: null, userId: null };
  }
  try {
    const who = await ctx.reader(ctx.signal);
    return { known: true, signedIn: !!who.signedIn, userId: who.userId ?? null };
  } catch {
    return { known: false, signedIn: null, userId: null };
  }
}

export async function loadProjects(ctx) {
  const rows = await ctx.db.rows(latest("projects", "id, name, notes, width_m, height_m, updated_at"), [], ctx.signal);
  return merge("projects", rows, () => true).sort((a, b) => ms(b.updated_at) - ms(a.updated_at));
}

function parseElements(text) {
  try {
    const list = JSON.parse(text || "[]");
    if (!Array.isArray(list)) return [];
    return list.map((r, i) => ({
      id: Number(r.id) || i + 1,
      kind: String(r.kind),
      x1: Number(r.x1) || 0,
      y1: Number(r.y1) || 0,
      x2: Number(r.x2) || 0,
      y2: Number(r.y2) || 0,
      label: r.label == null ? "" : String(r.label)
    })).sort((a, b) => a.id - b.id);
  } catch {
    return [];
  }
}

/** One project with its traced geometry, floor plan image and reference photos. */
export async function loadProject(ctx, id) {
  if (id === SAMPLE_ID) {
    const rows = await ctx.db.rows("SELECT id, kind, x1, y1, x2, y2, label FROM geometry ORDER BY id LIMIT 200");
    return {
      id, sample: true, name: "Suite 530", notes: "", eyebrow: "EXHIBIT A / SPATIAL STUDY",
      sourceName: "Exhibit A suite 530.pdf", footer: "Reconstructed from Exhibit A suite 530.pdf",
      width: 10, height: 3, rows, traced: rows.length > 0, planUrl: "assets/source-plan.png", plan: null,
      images: [], photos: SAMPLE_PHOTOS
    };
  }
  const [pRows, tRows, iRows] = await Promise.all([
    ctx.db.rows(latest("projects", "id, name, notes, width_m, height_m, updated_at") + " AND id = ?", [id], ctx.signal),
    ctx.db.rows(latest("traces", "id, elements, updated_at") + " AND id = ?", [id], ctx.signal),
    ctx.db.rows(latest("images", "id, project_id, kind, name, width, height, data, updated_at", " WHERE project_id = ?") + " ORDER BY updated_at LIMIT 60", [id], ctx.signal)
  ]);
  const project = merge("projects", pRows, (r) => r.id === id).find((r) => r.id === id);
  if (!project) {
    throw new Error("This project was not found. It may have been deleted, or you may need to log in.");
  }
  const trace = merge("traces", tRows, (r) => r.id === id).find((r) => r.id === id);
  const images = merge("images", iRows, (r) => r.project_id === id).sort((a, b) => ms(a.updated_at) - ms(b.updated_at));
  const plans = images.filter((i) => i.kind === "plan");
  const plan = plans.length ? plans[plans.length - 1] : null;
  const photos = images.filter((i) => i.kind === "photo").map((i) => ({
    name: i.name, src: i.data, title: i.name, note: "Uploaded reference photograph."
  }));
  const traced = trace ? parseElements(trace.elements) : [];
  // The outline polygon is also built as walls, so a plan with only an outline still has a shell.
  const outline = traced.filter((r) => r.kind === "outline");
  const shell = outline.length >= 3 ? outline.map((r, i) => {
    const next = outline[(i + 1) % outline.length];
    return { id: 100000 + i, kind: "wall", x1: r.x1, y1: r.y1, x2: next.x1, y2: next.y1, label: "Outer wall" };
  }) : [];
  const rows = [...traced, ...shell];
  return {
    id, sample: false, name: project.name, notes: project.notes || "", eyebrow: "PROJECT / SPATIAL STUDY",
    sourceName: plan ? plan.name : "Uploaded floor plan",
    footer: plan ? `Traced from ${plan.name}` : "Traced from your floor plan",
    width: Number(project.width_m) || 10, height: Number(project.height_m) || 3,
    rows, traced: outline.length >= 3, planUrl: plan ? plan.data : "", plan, images, photos
  };
}

/** The shared navigation for every view of one project. */
export function navHtml(project, current) {
  const base = "project/" + encodeURIComponent(project.id);
  const link = (href, key, label) => `<a href="${href}" ${current === key ? 'aria-current="page"' : ""}>${label}</a>`;
  return `<nav aria-label="Model views">${link("home", "projects", "← Projects")}${link(base, "home", "3D model")}${link(base + "/plan", "plan", "Floor plan")}${link(base + "/furnishing", "furnishing", "Furnishing")}${link(base + "/realistic", "realistic", "Realistic view")}${project.sample ? "" : link(base + "/setup", "setup", "Setup")}</nav>`;
}

/** Shrink an image file to a JPEG data URL small enough to store as one record. */
export async function readImage(file, maxDim, quality) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file (PNG, JPG or WebP).");
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That file could not be read as an image. Use PNG, JPG or WebP."));
      el.src = url;
    });
    const draw = (dim, q) => {
      const k = Math.min(1, dim / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * k));
      const height = Math.max(1, Math.round(img.naturalHeight * k));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const g = canvas.getContext("2d");
      g.fillStyle = "#fff";
      g.fillRect(0, 0, width, height);
      g.drawImage(img, 0, 0, width, height);
      return { data: canvas.toDataURL("image/jpeg", q), width, height };
    };
    let dim = maxDim;
    let q = quality;
    let out = draw(dim, q);
    for (let i = 0; i < 4 && out.data.length > 900000; i++) {
      dim = Math.round(dim * 0.8);
      q = Math.max(0.55, q - 0.08);
      out = draw(dim, q);
    }
    if (out.data.length > 1500000) {
      throw new Error("That image is too large even after shrinking. Try a smaller file.");
    }
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}
