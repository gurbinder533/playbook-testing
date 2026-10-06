import { WriteRejectedError, WriteSessionExpiredError } from '@corvic/live';
import { open } from './vault.js';

const T = 'recs';
const written = new Map();
let reader = null;
const ms = (v) => new Date(v).getTime();

export async function getReader(ctx) {
  if (!reader) reader = await ctx.reader(ctx.signal);
  return reader;
}
async function owner(ctx) {
  const rd = await getReader(ctx);
  return rd.everyRow && rd.userId ? { sql: ' AND __corvic_app_row_owner_id = ?', params: [rd.userId] } : { sql: '', params: [] };
}
export function explain(err) {
  if (err instanceof WriteSessionExpiredError) return 'Your session expired - reload and try again. Nothing was saved.';
  if (err instanceof WriteRejectedError) return err.message;
  return err && err.message ? err.message : String(err);
}
export async function tryOpen(s, fallback) {
  if (!s) return fallback;
  try { return await open(s); } catch (e) { return 'Unreadable'; }
}

export async function listCurrent(ctx) {
  const o = await owner(ctx);
  const rows = await ctx.db.rows(`SELECT id, kind, project_id, title, updated_at, deleted FROM (SELECT id, kind, project_id, title, updated_at, deleted, row_number() OVER (PARTITION BY id ORDER BY updated_at DESC) AS rn FROM ${T} WHERE kind <> 'vault'${o.sql}) WHERE rn = 1`, o.params, ctx.signal);
  const by = new Map(rows.map((r) => [r.id, r]));
  for (const [id, row] of [...written]) {
    if (row.kind === 'vault') continue;
    const r = by.get(id);
    if (r && ms(r.updated_at) >= ms(row.updated_at)) written.delete(id);
    else by.set(id, row);
  }
  return [...by.values()].filter((r) => !r.deleted);
}

export async function loadRecord(ctx, id) {
  const o = await owner(ctx);
  const rows = await ctx.db.rows(`SELECT id, kind, project_id, title, payload, updated_at, deleted FROM ${T} WHERE id = ?${o.sql} ORDER BY updated_at DESC LIMIT 1`, [id, ...o.params], ctx.signal);
  let rec = rows[0] || null;
  const w = written.get(id);
  if (w && (!rec || ms(w.updated_at) > ms(rec.updated_at))) rec = w;
  return rec && !rec.deleted ? rec : null;
}

export async function putRecord(ctx, rec) {
  const row = {
    id: rec.id,
    kind: rec.kind,
    project_id: rec.project_id || '',
    title: rec.title || '',
    payload: rec.payload || '',
    updated_at: new Date().toISOString(),
    deleted: rec.deleted === true
  };
  await ctx.write.rows(T, [row]);
  written.set(row.id, row);
}

export async function readVault(ctx) {
  const o = await owner(ctx);
  const rows = await ctx.db.rows(`SELECT payload, updated_at, deleted FROM ${T} WHERE kind = 'vault'${o.sql} ORDER BY updated_at DESC LIMIT 1`, o.params, ctx.signal);
  let rec = rows[0] || null;
  const w = written.get('vault');
  if (w && (!rec || ms(w.updated_at) >= ms(rec.updated_at))) rec = w;
  if (!rec || rec.deleted || !rec.payload) return null;
  const raw = rec.payload;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
export async function resetVault(ctx) {
  const items = await listCurrent(ctx);
  for (const r of items) await putRecord(ctx, { id: r.id, kind: r.kind, project_id: r.project_id, deleted: true });
  await putRecord(ctx, { id: 'vault', kind: 'vault', payload: '', deleted: true });
}
export async function writeVault(ctx, vault) {
  await putRecord(ctx, { id: 'vault', kind: 'vault', payload: JSON.stringify(vault) });
}
