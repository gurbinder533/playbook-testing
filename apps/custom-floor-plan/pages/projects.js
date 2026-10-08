import { esc, ICON, loadProjects, newId, saveRow, reader, setFlash, takeFlash } from "../lib/projects.js";

let armedDelete = "";

export default async function render(ctx) {
  const root = ctx.content;
  const flash = takeFlash();
  let loadError = "";
  const [me, projects] = await Promise.all([
    reader(ctx),
    loadProjects(ctx).catch((err) => { loadError = err && err.message ? err.message : String(err); ctx.reportError(err); return []; })
  ]);
  if (ctx.signal.aborted) return;
  const locked = me.known && !me.signedIn;
  const who = !me.known ? "Private to your account" : me.signedIn ? "Signed in · private to you" : "Login required to save";

  root.innerHTML = `<div class="studio projects-studio">
<header class="masthead"><div class="identity"><span class="brand-mark">${ICON}</span><div><span class="eyebrow">FLOOR PLANS / SPATIAL STUDY</span><h1>Projects<span class="title-dot">.</span></h1></div></div><div class="concept"><span></span>${esc(who)}</div></header>
${flash ? `<div class="notice" role="status"><span class="notice-icon">✓</span><p>${esc(flash)}</p></div>` : ""}
${locked ? '<div class="notice" role="status"><span class="notice-icon">i</span><p><strong>Login to use the app.</strong> Sign in to create projects and upload floor plans or photos. Everything you upload stays private to your account.</p></div>' : ""}
<main class="proj-main">
<section class="proj-panel"><span class="eyebrow">NEW PROJECT</span><h2>Start from a floor plan</h2>
<p class="proj-lead">Create a project, upload a plan image and photos, trace the plan, then explore it as a 3D model, furnished layout and walkable render.</p>
<form id="new-project" class="proj-form"><fieldset ${locked ? "disabled" : ""}>
<label>Project name<input name="name" required maxlength="80" placeholder="Second-floor office"></label>
<label>Overall width (m)<input name="width" type="number" min="2" max="200" step="0.5" value="10" required></label>
<label>Wall height (m)<input name="height" type="number" min="2" max="10" step="0.1" value="3" required></label>
<label class="wide">Notes<textarea name="notes" rows="2" maxlength="500" placeholder="Optional"></textarea></label>
<div class="form-actions"><button type="submit" class="btn primary">Create project</button><span class="form-error" role="alert"></span></div>
</fieldset></form></section>
<section class="proj-panel"><span class="eyebrow">YOUR PROJECTS</span><h2>${projects.length} project${projects.length === 1 ? "" : "s"}</h2>
${loadError ? `<p class="proj-note">Couldn't load your projects: ${esc(loadError)}</p>` : ""}
${!projects.length && !loadError ? `<p class="proj-note">${locked ? "Log in to see your projects." : "No projects yet. Create the first one above."}</p>` : ""}
<div class="proj-grid">${projects.map((p) => `<article class="proj-card"><h3>${esc(p.name)}</h3><p>${esc(p.notes || "No notes")}</p><p>${esc(p.width_m)} m wide · ${esc(p.height_m)} m walls · updated ${esc(new Date(p.updated_at).toLocaleDateString())}</p><div class="actions"><a class="btn primary" href="project/${encodeURIComponent(p.id)}">Open 3D model</a><a class="btn" href="project/${encodeURIComponent(p.id)}/setup">Setup</a><button type="button" class="btn danger" data-del="${esc(p.id)}">${armedDelete === p.id ? "Confirm delete" : "Delete"}</button></div></article>`).join("")}</div></section>
<section class="proj-panel"><span class="eyebrow">SAMPLE</span><h2>See what a finished project looks like</h2>
<div class="proj-grid"><article class="proj-card"><h3>Suite 530</h3><p>An open-plan office traced from Exhibit A, with a proposed ten-desk layout and a photo-guided walkable render. Anyone can view it.</p><div class="actions"><a class="btn primary" href="project/sample">Open sample</a></div></article></div></section>
</main>
<footer class="studio-footer"><span><span class="status-dot"></span>Your projects, images and traces are private to your account</span><span>Approximate geometry · Not for construction</span></footer>
</div>`;

  const form = root.querySelector("#new-project");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fields = new FormData(form);
    const name = String(fields.get("name") || "").trim();
    const button = form.querySelector("button");
    const error = form.querySelector(".form-error");
    if (!name) { error.textContent = "Give the project a name."; return; }
    button.disabled = true;
    error.textContent = "Creating…";
    const id = newId();
    const problem = await saveRow(ctx, "projects", {
      id, name, notes: String(fields.get("notes") || "").trim(),
      width_m: Number(fields.get("width")) || 10, height_m: Number(fields.get("height")) || 3, deleted: false
    });
    if (ctx.signal.aborted) return;
    if (problem) {
      error.textContent = problem;
      button.disabled = false;
      return;
    }
    setFlash(`Created “${name}”. Upload a floor plan and trace it below.`);
    ctx.navigate("project/" + id + "/setup");
  }, { signal: ctx.signal });

  root.querySelectorAll("[data-del]").forEach((button) => button.addEventListener("click", async () => {
    const id = button.dataset.del;
    if (armedDelete !== id) {
      armedDelete = id;
      await ctx.reload();
      return;
    }
    armedDelete = "";
    const p = projects.find((candidate) => candidate.id === id);
    button.disabled = true;
    const problem = await saveRow(ctx, "projects", { id, name: p.name, notes: p.notes || "", width_m: Number(p.width_m) || 10, height_m: Number(p.height_m) || 3, deleted: true });
    if (ctx.signal.aborted) return;
    if (problem) {
      button.disabled = false;
      button.textContent = problem;
      return;
    }
    setFlash(`Deleted “${p.name}”.`);
    await ctx.reload();
  }, { signal: ctx.signal }));
}
