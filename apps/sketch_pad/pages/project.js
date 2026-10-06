import { esc } from '@corvic/live';
import { renderShell, gate, setCrumbs, fmtDate, loadError, takeFlash, setFlash } from '../lib/ui.js';
import { listCurrent, loadRecord, putRecord, tryOpen, explain } from '../lib/store.js';
import { seal } from '../lib/vault.js';
import { uid } from '../lib/sketch.js';
import { icon } from '../lib/icons.js';

export default async function render(ctx) {
  const main = renderShell(ctx);
  main.innerHTML = `<div class='note'>Loading...</div>`;
  if (!(await gate(ctx, main))) return;
  const pid = ctx.route.params.id;
  let items;
  try { items = await listCurrent(ctx); } catch (err) { loadError(main, err); ctx.reportError(err); return; }
  if (ctx.signal.aborted) return;
  const proj = items.find((r) => r.id === pid && r.kind === 'project');
  if (!proj) { main.innerHTML = `<div class='card narrow center'><h2>Project not found</h2><p class='muted'>It may have been deleted.</p><a class='btn primary' href='home'>Back to projects</a></div>`; return; }
  const pname = await tryOpen(proj.title, 'Untitled project');
  const drawings = await Promise.all(items.filter((r) => r.kind === 'drawing' && r.project_id === pid).map(async (r) => ({ id: r.id, name: await tryOpen(r.title, 'Untitled'), updated: r.updated_at })));
  if (ctx.signal.aborted) return;
  drawings.sort((a, b) => new Date(b.updated) - new Date(a.updated));
  setCrumbs(ctx, [{ label: 'Projects', href: 'home' }, { label: pname }]);
  const state = { rename: null, del: null, creating: drawings.length === 0, busy: false, error: '' };
  const flash = takeFlash();
  let shown = false;

  function card(d) {
    if (state.rename === d.id) return `<article class='pcard'><form class='inline' data-form='rename' data-id='${esc(d.id)}'><input class='inp' name='name' value='${esc(d.name)}' maxlength='80' required aria-label='Drawing name'><button class='btn small primary' type='submit'>Save</button><button class='btn small' type='button' data-act='cancel'>Cancel</button></form></article>`;
    if (state.del === d.id) return `<article class='pcard'><div class='confirm'><p>Delete &ldquo;${esc(d.name)}&rdquo;? This cannot be undone.</p><div class='row'><button class='btn small danger' type='button' data-act='delete-yes' data-id='${esc(d.id)}'>${state.busy ? 'Deleting...' : 'Delete'}</button><button class='btn small' type='button' data-act='cancel'>Cancel</button></div></div></article>`;
    return `<article class='pcard'><a class='pcard-link' href='draw/${encodeURIComponent(d.id)}'><span class='pcard-ico'>${icon('file', 26)}</span><span class='pcard-name'>${esc(d.name)}</span><span class='muted'>Updated ${esc(fmtDate(d.updated))}</span></a><div class='pcard-actions'><button class='iconbtn' type='button' data-act='rename' data-id='${esc(d.id)}' aria-label='Rename drawing' title='Rename'>${icon('edit', 16)}</button><button class='iconbtn' type='button' data-act='delete' data-id='${esc(d.id)}' aria-label='Delete drawing' title='Delete'>${icon('trash', 16)}</button></div></article>`;
  }
  function paint() {
    main.innerHTML = `<div class='page-head'><div><h1>${esc(pname)}</h1><p class='muted'>${drawings.length} drawing${drawings.length === 1 ? '' : 's'} &middot; private to your account</p></div><button class='btn primary' type='button' data-act='new'>${icon('plus', 16)} New drawing</button></div>
${flash && !shown ? `<div class='flash' role='status'>${esc(flash)}</div>` : ''}
${state.creating ? `<form class='card inline-card' data-form='create'><label class='pl' for='dname'>Drawing name</label><div class='row'><input class='inp' id='dname' name='name' value='Untitled' maxlength='80' required><button class='btn primary' type='submit'>${state.busy ? 'Creating...' : 'Create and open'}</button>${drawings.length ? `<button class='btn' type='button' data-act='cancel'>Cancel</button>` : ''}</div></form>` : ''}
${state.error ? `<div class='err' role='alert'>${esc(state.error)}</div>` : ''}
${drawings.length ? `<div class='grid'>${drawings.map(card).join('')}</div>` : `<div class='empty'><div class='bigico'>${icon('file', 36)}</div><p>This project has no drawings yet.</p></div>`}`;
    shown = true;
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
    else if (act === 'cancel') { state.creating = drawings.length === 0; state.rename = null; state.del = null; paint(); }
    else if (act === 'rename') { state.rename = id; state.del = null; paint(); }
    else if (act === 'delete') { state.del = id; state.rename = null; paint(); }
    else if (act === 'delete-yes') {
      if (state.busy) return;
      state.busy = true; paint();
      try {
        await putRecord(ctx, { id, kind: 'drawing', project_id: pid, deleted: true });
        setFlash('Drawing deleted.');
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
        const id = uid();
        await putRecord(ctx, { id, kind: 'drawing', project_id: pid, title: await seal(name), payload: await seal(JSON.stringify({ v: 1, elements: [], appState: {} })) });
        ctx.navigate('draw/' + id);
        return;
      }
      const id = form.dataset.id;
      const rec = await loadRecord(ctx, id);
      if (!rec) throw new Error('That drawing could not be found.');
      await putRecord(ctx, { id, kind: 'drawing', project_id: pid, title: await seal(name), payload: rec.payload });
      setFlash('Drawing renamed.');
      await ctx.reload();
    } catch (err) { state.busy = false; state.error = explain(err); ctx.reportError(err); paint(); }
  }, { signal: ctx.signal });
}
