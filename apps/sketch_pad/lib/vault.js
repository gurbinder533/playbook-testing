const te = new TextEncoder();
const td = new TextDecoder();
let key = null;
export const unlocked = () => key !== null;
export function lock() { key = null; }
function toB64(bytes) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(s);
}
function fromB64(str) {
  const s = atob(str);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export const newSalt = () => toB64(crypto.getRandomValues(new Uint8Array(16)));
async function pipe(bytes, stream) {
  const s = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function derive(pass, salt) {
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: fromB64(salt), iterations: 600000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function unlockWith(pass, salt) {
  key = await derive(pass, salt);
}
export async function seal(text) {
  if (!key) throw new Error('Vault is locked');
  let data = te.encode(text);
  let flag = 0;
  if (typeof CompressionStream === 'function') {
    try { data = await pipe(data, new CompressionStream('gzip')); flag = 1; } catch (e) { data = te.encode(text); flag = 0; }
  }
  const plain = new Uint8Array(data.length + 1);
  plain[0] = flag;
  plain.set(data, 1);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return 'v1.' + toB64(iv) + '.' + toB64(ct);
}
export async function open(sealed) {
  if (!key) throw new Error('Vault is locked');
  const parts = String(sealed).split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('Unknown format');
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(parts[1]) }, key, fromB64(parts[2])));
  let data = plain.subarray(1);
  if (plain[0] === 1) data = await pipe(data, new DecompressionStream('gzip'));
  return td.decode(data);
}
