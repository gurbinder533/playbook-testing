import { esc } from '@corvic/live';
import { renderShell, gate, fmtDate, loadError, takeFlash, setFlash } from '../lib/ui.js';
import { listCurrent, putRecord, tryOpen, explain } from '../lib/store.js';
import { seal } from '../lib/vault.js';
import { uid } from '../lib/sketch.js';
import { icon } from '../lib/icons.js';

export default async function render(ctx) {
  const main = renderShell(ctx);
  main.innerHTML = `<div class='note'>Loading...</div>`;
  if (!(await gate(ctx, main))) return;
  let items;
  try { items = await listCurrent(ctx); } catch (err) { loadError(main, err); ctx.reportError(err); return; }
  if (ctx.signal.aborted) return;
  const counts = new Map();
  for (const r of items) if (r.kind === 'drawing') counts.set(r.project_id, (counts.get(r.project_id) || 0) + 1);
  const projects = await Promise.all(items.filter((r) => r.kind === 'project').map(async (r) => ({ id: r.id, name: await tryOpen(r.title, 'Untitled project'), updated: r.updated_at, count: counts.get(r.id) || 0 })));
  if (ctx.signal.aborted) return;
  projects.sort((a, b) => new Date(b.updated) - new Date(a.updated));
  const state = { rename: null, del: null, creating: projects.length === 0, busy: false, error: '' };
  const flash = takeFlash();

  function card(p) {
    if (state.rename === p.id) return `<article class='pcard'><form class='inline' data-form='rename' data-id='${esc(p.id)}'><input class='inp' name='name' value='${esc(p.name)}' maxlength='80' required aria-label='Project name'><button class='btn small primary' type='submit'>Save</button><button class='btn small' type='button' data-act='cancel'>Cancel</button></form></article>`;
    if (state.del === p.id) return `<article class='pcard'><div class='confirm'><p>Delete &ldquo;${esc(p.name)}&rdquo; and its ${p.count} drawing${p.count === 1 ? '' : 's'}? This cannot be undone.</p><div class='row'><button class='btn small danger' type='button' data-act='delete-yes' data-id='${esc(p.id)}'>${state.busy ? 'Deleting...' : 'Delete'}</button><button class='btn small' type='button' data-act='cancel'>Cancel</button></div></div></article>`;
    return `<article class='pcard'><a class='pcard-link' href='project/${encodeURIComponent(p.id)}'><span class='pcard-ico'>${icon('folder', 26)}</span><span class='pcard-name'>${esc(p.name)}</span><span class='muted'>${p.count} drawing${p.count === 1 ? '' : 's'} &middot; Updated ${esc(fmtDate(p.updated))}</span></a><div class='pcard-actions'><button class='iconbtn' type='button' data-act='rename' data-id='${esc(p.id)}' aria-label='Rename project' title='Rename'>${icon('edit', 16)}</button><button class='iconbtn' type='button' data-act='delete' data-id='${esc(p.id)}' aria-label='Delete project' title='Delete'>${icon('trash', 16)}</button></div></article>`;
  }
  function paint() {
    main.innerHTML = `<div class='page-head'><div><h1>Your projects</h1><p class='muted'>Everything here is encrypted before it leaves your browser - only you can open it.</p></div><button class='btn primary' type='button' data-act='new'>${icon('plus', 16)} New project</button></div>
${flash && !state.shown ? `<div class='flash' role='status'>${esc(flash)}</div>` : ''}
${state.creating ? `<form class='card inline-card' data-form='create'><label class='pl' for='pname'>Project name</label><div class='row'><input class='inp' id='pname' name='name' placeholder='e.g. Product roadmap' maxlength='80' required><button class='btn primary' type='submit'>${state.busy ? 'Creating...' : 'Create project'}</button>${projects.length ? `<button class='btn' type='button' data-act='cancel'>Cancel</button>` : ''}</div></form>` : ''}
${state.error ? `<div class='err' role='alert'>${esc(state.error)}</div>` : ''}
${projects.length ? `<div class='grid'>${projects.map(card).join('')}</div>` : `<div class='empty'><div class='bigico'>${icon('folder', 36)}</div><p>No projects yet. Create one to start sketching.</p></div>`}`;
    state.shown = true;
    const f = main.querySelector('input[name=name]');
    if (f) { f.focus(); f.select(); }
  }
  paint();

  main.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act, id = b.dataset.id;
    state.error = '';
    if (act === 'new') { state.creating = true; state.rename = null; state.del = null; paint(); }
    else if (act === 'cancel') { state.creating = projects.length === 0; state.rename = null; state.del = null; paint(); }
    else if (act === 'rename') { state.rename = id; state.del = null; paint(); }
    else if (act === 'delete') { state.del = id; state.rename = null; paint(); }
    else if (act === 'delete-yes') {
      if (state.busy) return;
      state.busy = true; paint();
      try {
        for (const r of items.filter((x) => x.id === id || (x.kind === 'drawing' && x.project_id === id))) await putRecord(ctx, { id: r.id, kind: r.kind, project_id: r.project_id, deleted: true });
        setFlash('Project deleted.');
        await ctx.reload();
      } catch (err) { state.busy = false; state.error = explain(err); ctx.reportError(err); paint(); }
    }
  }, { signal: ctx.signal });

  main.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (state.busy) return;
    const form = ev.target.closest('form');
    const name = (form.elements.name.value || '').trim();
    if (!name) return;
    state.busy = true; state.error = '';
    try {
      if (form.dataset.form === 'create') {
        await putRecord(ctx, { id: uid(), kind: 'project', title: await seal(name), payload: await seal(JSON.stringify({ v: 1 })) });
        setFlash('Project created.');
      } else {
        const id = form.dataset.id;
        await putRecord(ctx, { id, kind: 'project', title: await seal(name), payload: await seal(JSON.stringify({ v: 1 })) });
        setFlash('Project renamed.');
      }
      await ctx.reload();
    } catch (err) { state.busy = false; state.error = explain(err); ctx.reportError(err); paint(); }
  }, { signal: ctx.signal });
}
