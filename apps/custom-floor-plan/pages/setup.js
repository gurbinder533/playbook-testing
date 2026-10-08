import { esc, ICON, navHtml, loadProject, saveRow, readImage, reader, newId, setFlash, takeFlash } from "../lib/projects.js";
import { createTracer } from "../lib/tracer.js";

// Unsaved trace edits survive ctx.reload() (module state outlives it).
const drafts = new Map();
let armedImage = "";

export default async function render(ctx) {
  const root = ctx.content;
  const id = ctx.route.params.id;
  let project;
  let me;
  try {
    [project, me] = await Promise.all([loadProject(ctx, id), reader(ctx)]);
  } catch (error) {
    if (ctx.signal.aborted) return;
    root.innerHTML = `<div class="studio"><p class="proj-note" role="alert">${esc(error.message)} <a href="home">Back to projects</a></p></div>`;
    ctx.reportError(error);
    return;
  }
  if (ctx.signal.aborted) return;
  if (project.sample) {
    ctx.navigate("project/sample");
    return;
  }
  const locked = me.known && !me.signedIn;
  const flash = takeFlash();
  const photos = project.images.filter((i) => i.kind === "photo");
  const base = "project/" + encodeURIComponent(project.id);

  root.innerHTML = `<div class="studio setup-studio">
<header class="masthead"><div class="identity"><span class="brand-mark">${ICON}</span><div><span class="eyebrow">PROJECT / SETUP</span><h1>${esc(project.name)}<span class="title-dot">.</span></h1></div></div>${navHtml(project, "setup")}<div class="concept"><span></span>Private to your account</div></header>
${flash ? `<div class="notice" role="status"><span class="notice-icon">✓</span><p>${esc(flash)}</p></div>` : ""}
${locked ? '<div class="notice" role="status"><span class="notice-icon">i</span><p><strong>Login to use the app.</strong> Uploading and saving need an account.</p></div>' : ""}
<main class="setup-grid">
<aside class="setup-side">
<section class="section"><span class="eyebrow">01 / PROJECT</span>
<form id="meta" class="proj-form single"><fieldset ${locked ? "disabled" : ""}>
<label>Name<input name="name" required maxlength="80" value="${esc(project.name)}"></label>
<label>Overall width (m)<input name="width" type="number" min="2" max="200" step="0.5" value="${esc(project.width)}" required></label>
<label>Wall height (m)<input name="height" type="number" min="2" max="10" step="0.1" value="${esc(project.height)}" required></label>
<label>Notes<textarea name="notes" rows="2" maxlength="500">${esc(project.notes)}</textarea></label>
<p class="help">Width is the real-world width of the traced outline's widest extent. It sets the scale; no dimensions are read from the image.</p>
<div class="form-actions"><button type="submit" class="btn primary">Save project</button><span class="form-error" role="alert"></span></div></fieldset></form></section>
<section class="section"><span class="eyebrow">02 / FLOOR PLAN IMAGE</span>
<p class="help">${project.plan ? `Current plan: ${esc(project.plan.name)} (${esc(project.plan.width)}×${esc(project.plan.height)} px). Uploading a new plan replaces it — re-check your trace afterwards.` : "Upload a PNG, JPG or WebP of the plan. Images are shrunk in your browser before saving."}</p>
<fieldset ${locked ? "disabled" : ""}><input id="plan-file" type="file" accept="image/*" aria-label="Upload floor plan image"></fieldset></section>
<section class="section"><span class="eyebrow">03 / REFERENCE PHOTOS</span>
<p class="help">Optional. Shown beside the realistic view for comparison; they are not applied to the render.</p>
<fieldset ${locked ? "disabled" : ""}><input id="photo-files" type="file" accept="image/*" multiple aria-label="Upload reference photos"></fieldset>
<ul class="thumb-list">${photos.map((p) => `<li><img src="${esc(p.data)}" alt="${esc(p.name)}"><span>${esc(p.name)}</span><button type="button" class="btn small danger" data-del="${esc(p.id)}">${armedImage === p.id ? "Confirm" : "Delete"}</button></li>`).join("")}</ul>
<p id="upload-status" class="help" role="status"></p></section>
</aside>
<section class="setup-trace"><span class="eyebrow">04 / TRACE</span><h2>Trace the plan</h2>
<p class="help">Click the outline corners in order, then add walls, doors and fixtures. The traced shapes drive every 3D view. Save when done.</p>
${project.plan ? '<div id="tracer"></div>' : '<p class="proj-note">Upload a floor plan image first, then trace it here.</p>'}
<div class="trace-actions"><button type="button" id="save-trace" class="btn primary" ${project.plan && !locked ? "" : "disabled"}>Save trace</button><span id="trace-status" class="help" role="status"></span><a class="btn" href="${base}">View 3D model</a><a class="btn" href="${base}/realistic">Realistic view</a></div></section>
</main>
<footer class="studio-footer"><span><span class="status-dot"></span>Traced by you · private to your account</span><span>Approximate geometry · Not for construction</span></footer>
</div>`;

  const q = (selector) => root.querySelector(selector);
  const on = (el, type, fn) => el.addEventListener(type, fn, { signal: ctx.signal });
  const uploadStatus = q("#upload-status");

  const meta = q("#meta");
  on(meta, "submit", async (event) => {
    event.preventDefault();
    const fields = new FormData(meta);
    const error = meta.querySelector(".form-error");
    const button = meta.querySelector("button");
    const name = String(fields.get("name") || "").trim();
    const width = Number(fields.get("width"));
    const height = Number(fields.get("height"));
    if (!name || !(width >= 2 && width <= 200) || !(height >= 2 && height <= 10)) {
      error.textContent = "Enter a name, a width of 2–200 m and a height of 2–10 m.";
      return;
    }
    button.disabled = true;
    error.textContent = "Saving…";
    const problem = await saveRow(ctx, "projects", { id: project.id, name, notes: String(fields.get("notes") || "").trim(), width_m: width, height_m: height, deleted: false });
    if (ctx.signal.aborted) return;
    if (problem) {
      error.textContent = problem;
      button.disabled = false;
      return;
    }
    setFlash("Project saved.");
    await ctx.reload();
  });

  async function addImages(files, kind) {
    const list = [...files].slice(0, 10);
    if (!list.length) return;
    const old = kind === "plan" ? project.plan : null;
    let saved = 0;
    const problems = [];
    for (const file of list) {
      uploadStatus.textContent = `Uploading ${file.name}…`;
      try {
        const image = kind === "plan" ? await readImage(file, 1600, 0.8) : await readImage(file, 1000, 0.72);
        if (ctx.signal.aborted) return;
        const problem = await saveRow(ctx, "images", { id: newId(), project_id: project.id, kind, name: file.name.slice(0, 120), width: image.width, height: image.height, data: image.data, deleted: false });
        if (problem) { problems.push(`${file.name}: ${problem}`); continue; }
        saved += 1;
      } catch (err) {
        problems.push(`${file.name}: ${err.message}`);
      }
    }
    if (ctx.signal.aborted) return;
    if (old && saved) {
      await saveRow(ctx, "images", { id: old.id, project_id: project.id, kind: "plan", name: old.name, width: old.width, height: old.height, data: "", deleted: true });
    }
    if (problems.length) uploadStatus.textContent = problems.join(" ");
    if (saved) {
      setFlash(kind === "plan" ? "Floor plan uploaded." : `${saved} photo${saved === 1 ? "" : "s"} uploaded.`);
      await ctx.reload();
    }
  }
  on(q("#plan-file"), "change", (e) => { const input = e.target; input.disabled = true; addImages(input.files, "plan").finally(() => { if (!ctx.signal.aborted) input.disabled = false; }); });
  on(q("#photo-files"), "change", (e) => { const input = e.target; input.disabled = true; addImages(input.files, "photo").finally(() => { if (!ctx.signal.aborted) input.disabled = false; }); });

  root.querySelectorAll("[data-del]").forEach((button) => on(button, "click", async () => {
    const imageId = button.dataset.del;
    if (armedImage !== imageId) {
      armedImage = imageId;
      button.textContent = "Confirm";
      return;
    }
    armedImage = "";
    const image = project.images.find((i) => i.id === imageId);
    button.disabled = true;
    const problem = await saveRow(ctx, "images", { id: imageId, project_id: project.id, kind: image.kind, name: image.name, width: image.width, height: image.height, data: "", deleted: true });
    if (ctx.signal.aborted) return;
    if (problem) {
      uploadStatus.textContent = problem;
      button.disabled = false;
      return;
    }
    setFlash("Photo deleted.");
    await ctx.reload();
  }));

  if (project.plan) {
    const status = q("#trace-status");
    const draft = drafts.get(project.id);
    const tracer = createTracer(q("#tracer"), {
      planUrl: project.plan.data, width: Number(project.plan.width), height: Number(project.plan.height),
      rows: draft || project.rows, signal: ctx.signal,
      onChange: (rows) => { drafts.set(project.id, rows); status.textContent = "Unsaved changes"; }
    });
    if (draft) status.textContent = "Unsaved changes (restored)";
    const save = q("#save-trace");
    on(save, "click", async () => {
      const rows = tracer.getRows();
      if (rows.filter((r) => r.kind === "outline").length < 3) {
        status.textContent = "Add at least three outline points first.";
        return;
      }
      save.disabled = true;
      status.textContent = "Saving…";
      const problem = await saveRow(ctx, "traces", { id: project.id, elements: JSON.stringify(rows), deleted: false });
      if (ctx.signal.aborted) return;
      save.disabled = false;
      if (problem) {
        status.textContent = problem;
        return;
      }
      drafts.delete(project.id);
      status.textContent = `Saved · ${rows.length} element${rows.length === 1 ? "" : "s"}.`;
    });
  }
}
