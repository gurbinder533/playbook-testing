import { renderShell, gate } from '../lib/ui.js';
import { loadRecord, putRecord, tryOpen, explain } from '../lib/store.js';
import { seal, open } from '../lib/vault.js';
import { mountEditor } from '../lib/editor.js';

export default async function render(ctx) {
  const main = renderShell(ctx);
  main.innerHTML = `<div class='note'>Loading...</div>`;
  if (!(await gate(ctx, main))) return;
  const id = ctx.route.params.id;
  let rec;
  try { rec = await loadRecord(ctx, id); } catch (err) { main.innerHTML = `<div class='note'>Could not load this drawing: ${String(err && err.message ? err.message : err)}</div>`; ctx.reportError(err); return; }
  if (ctx.signal.aborted) return;
  if (!rec || rec.kind !== 'drawing') { main.innerHTML = `<div class='card narrow center'><h2>Drawing not found</h2><p class='muted'>It may have been deleted.</p><a class='btn primary' href='home'>Back to projects</a></div>`; return; }
  let scene = { elements: [], appState: {} };
  let name = await tryOpen(rec.title, 'Untitled');
  try { if (rec.payload) scene = JSON.parse(await open(rec.payload)); } catch (err) { main.innerHTML = `<div class='note'>This drawing could not be decrypted with your key.</div>`; ctx.reportError(err); return; }
  if (ctx.signal.aborted) return;

  let sealedTitle = rec.title;
  let latest = null, timer = 0, chain = Promise.resolve(), ed = null;
  const backHref = 'project/' + encodeURIComponent(rec.project_id);

  async function doSave() {
    const sc = latest;
    latest = null;
    if (!sc) return;
    ed.setStatus('Saving...');
    try {
      const payload = await seal(JSON.stringify(sc));
      await putRecord(ctx, { id, kind: 'drawing', project_id: rec.project_id, title: sealedTitle, payload });
      ed.setStatus(latest ? 'Saving...' : 'Saved - encrypted', 'ok');
    } catch (err) {
      latest = latest || sc;
      ed.setStatus('Not saved: ' + explain(err), 'error');
      ctx.reportError(err);
    }
  }
  function queue() { chain = chain.then(doSave); }
  function onChange(sc) {
    latest = sc;
    clearTimeout(timer);
    timer = setTimeout(queue, 700);
    ed.setStatus('Unsaved changes...');
  }
  async function onRename(newName) {
    name = newName;
    sealedTitle = await seal(newName);
    latest = ed.scene();
    clearTimeout(timer);
    queue();
  }

  main.innerHTML = '';
  ed = mountEditor(ctx, ctx.content, { name, scene, backHref, onChange, onRename });
  ed.setStatus('Saved - encrypted', 'ok');
  return () => {
    clearTimeout(timer);
    if (latest) queue();
    ed.destroy();
  };
}
