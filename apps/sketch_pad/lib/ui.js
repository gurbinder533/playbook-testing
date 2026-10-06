import { esc } from '@corvic/live';
import { icon } from './icons.js';
import { applyTheme, currentTheme, toggleTheme } from './theme.js';
import { lock, unlocked, unlockWith, newSalt, seal, open } from './vault.js';
import { getReader, readVault, writeVault, resetVault, explain } from './store.js';

const MAGIC = 'sketchpad-vault-ok';
let flash = '';
export const setFlash = (m) => { flash = m; };
export function takeFlash() { const m = flash; flash = ''; return m; }
export function fmtDate(v) {
  const d = new Date(v);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
export function loadError(main, err) {
  main.innerHTML = `<div class='note'>Could not load your data: ${esc(err && err.message ? err.message : String(err))}</div>`;
}

export function setCrumbs(ctx, crumbs) {
  const el = ctx.content.querySelector('#crumbs');
  if (!el) return;
  el.innerHTML = crumbs.map((c) => `<span class='sep'>/</span>` + (c.href ? `<a class='crumb' href='${esc(c.href)}'>${esc(c.label)}</a>` : `<span class='crumb cur'>${esc(c.label)}</span>`)).join('');
}

export function renderShell(ctx) {
  applyTheme();
  ctx.content.innerHTML = `<div class='shell'>
  <header class='topbar'>
    <a class='brand' href='home'>${icon('logo', 22)}<span>Sketchpad</span></a>
    <span id='crumbs' class='crumbs'></span>
    <span class='grow'></span>
    <span class='badge-enc' title='Everything you save is encrypted in your browser before it is stored'>${icon('lock', 14)}<span>End-to-end encrypted</span></span>
    <button class='iconbtn' id='themeBtn' type='button' aria-label='Toggle light or dark mode' title='Toggle light / dark mode'></button>
    <button class='btn ghost' id='lockBtn' type='button' title='Forget the key in this browser'>${icon('lock', 14)} Lock</button>
  </header>
  <main class='content' id='main'></main>
</div>`;
  const tb = ctx.content.querySelector('#themeBtn');
  const paint = () => { tb.innerHTML = icon(currentTheme() === 'dark' ? 'sun' : 'moon', 18); };
  paint();
  tb.addEventListener('click', () => { toggleTheme(); paint(); }, { signal: ctx.signal });
  ctx.content.querySelector('#lockBtn').addEventListener('click', () => { lock(); ctx.reload(); }, { signal: ctx.signal });
  return ctx.content.querySelector('#main');
}

export async function gate(ctx, main) {
  let rd;
  try { rd = await getReader(ctx); } catch (err) { loadError(main, err); ctx.reportError(err); return false; }
  if (ctx.signal.aborted) return false;
  if (!rd.signedIn) {
    main.innerHTML = `<div class='card narrow center'><div class='bigico'>${icon('lock', 34)}</div><h2>Sign in to open your sketchbook</h2><p class='muted'>Login to use the app. Create an account or sign in with the account controls around this page - your projects and diagrams belong to your account and nobody else can open them.</p></div>`;
    return false;
  }
  if (unlocked()) return true;
  let vault;
  try { vault = await readVault(ctx); } catch (err) { loadError(main, err); ctx.reportError(err); return false; }
  if (ctx.signal.aborted) return false;
  const first = !vault;
  main.innerHTML = `<div class='card narrow'>
  <div class='bigico'>${icon('lock', 34)}</div>
  <h2>${first ? 'Create your private vault' : 'Unlock your vault'}</h2>
  <p class='muted'>${first ? 'Your diagrams are encrypted in this browser with a key derived from a passphrase that only you know. Nobody - not even the person who built this app - can read them. <b>If you forget the passphrase your data cannot be recovered.</b>' : 'Enter your vault passphrase to decrypt your projects in this browser. It is never sent anywhere.'}</p>
  <form id='vf' class='stack' autocomplete='off'>
    <input class='inp' id='pp' type='password' placeholder='Vault passphrase' autocomplete='current-password' required>
    ${first ? `<input class='inp' id='pp2' type='password' placeholder='Confirm passphrase' autocomplete='new-password' required><label class='check'><input type='checkbox' id='ack'> I understand that a forgotten passphrase cannot be reset.</label>` : ''}
    <div class='err' id='verr' role='alert'></div>
    <button class='btn primary' id='vbtn' type='submit'>${first ? 'Create vault' : 'Unlock'}</button>
  </form>
  ${first ? '' : `<div class='reset' id='rbox'><button class='btn ghost small' id='rbtn' type='button'>Forgot your passphrase? Reset vault</button></div>`}
</div>`;
  const form = main.querySelector('#vf');
  const rbox = main.querySelector('#rbox');
  if (rbox) {
    rbox.addEventListener('click', async (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.id === 'rbtn') { rbox.innerHTML = `<p class='err' style='display:block'>This permanently deletes ALL your projects and drawings so you can start fresh with a new passphrase. It cannot be undone.</p><div class='row'><button class='btn small danger' id='ryes' type='button'>Delete everything and reset</button><button class='btn small' id='rno' type='button'>Cancel</button></div>`; }
      else if (b.id === 'rno') { rbox.innerHTML = `<button class='btn ghost small' id='rbtn' type='button'>Forgot your passphrase? Reset vault</button>`; }
      else if (b.id === 'ryes') {
        b.disabled = true; b.textContent = 'Resetting...';
        try { await resetVault(ctx); setFlash('Vault reset. Create a new passphrase.'); await ctx.reload(); }
        catch (e) { b.disabled = false; b.textContent = 'Delete everything and reset'; err.textContent = explain(e); ctx.reportError(e); }
      }
    }, { signal: ctx.signal });
  }
  const err = main.querySelector('#verr');
  const btn = main.querySelector('#vbtn');
  main.querySelector('#pp').focus();
  return new Promise((resolve) => {
    ctx.signal.addEventListener('abort', () => resolve(false), { once: true });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      err.textContent = '';
      const pass = main.querySelector('#pp').value;
      btn.disabled = true;
      const label = btn.textContent;
      btn.textContent = 'Deriving key...';
      try {
        if (first) {
          const pass2 = main.querySelector('#pp2').value;
          if (pass.length < 8) throw new Error('Use at least 8 characters.');
          if (pass !== pass2) throw new Error('The passphrases do not match.');
          if (!main.querySelector('#ack').checked) throw new Error('Please confirm you understand the passphrase cannot be reset.');
          const again = await readVault(ctx);
          if (again) { throw new Error('A vault already exists for your account. Reload and unlock it with your original passphrase.'); }
          const salt = newSalt();
          await unlockWith(pass, salt);
          const check = await seal(MAGIC);
          await writeVault(ctx, { salt, check });
        } else {
          await unlockWith(pass, vault.salt);
          let ok = false;
          try { ok = (await open(vault.check)) === MAGIC; } catch (e) { ok = false; }
          if (!ok) throw new Error('That passphrase is not correct.');
        }
        resolve(true);
      } catch (e) {
        lock();
        err.textContent = explain(e);
        btn.disabled = false;
        btn.textContent = label;
      }
    }, { signal: ctx.signal });
  });
}
