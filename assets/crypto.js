// Browser side of the encryption scheme (see scripts/lib/crypto.mjs).
// The private key lives only in this module's memory; nothing is persisted.
const subtle = crypto.subtle;
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const dec = new TextDecoder();
let privateKey = null;

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!r.ok) { const e = new Error(`HTTP ${r.status} ${url}`); e.status = r.status; throw e; }
  return r.json();
}

export async function unlock(password) {
  let sealed;
  try { sealed = await getJson('data/keys/private.json'); }
  catch (e) { if (e.status === 404) throw new Error('NOT_SET_UP'); throw e; }
  const base = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  const k = await subtle.deriveKey(
    { name: 'PBKDF2', salt: unb64(sealed.salt), iterations: sealed.iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
  let pkcs8;
  try { pkcs8 = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv) }, k, unb64(sealed.ct)); }
  catch { throw new Error('BAD_PASSWORD'); }
  privateKey = await subtle.importKey('pkcs8', pkcs8, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['unwrapKey']);
}

export function lock() { privateKey = null; }

export async function loadEncrypted(url) {
  if (!privateKey) throw new Error('LOCKED');
  const f = await getJson(url);
  const key = await subtle.unwrapKey('raw', unb64(f.ek), privateKey, { name: 'RSA-OAEP' }, { name: 'AES-GCM' }, false, ['decrypt']);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv) }, key, unb64(f.ct));
  return JSON.parse(dec.decode(pt));
}

export async function loadPlain(url) { return getJson(url); }
