// Shared crypto for Daily Lenovo (Node 20+ WebCrypto).
// Scheme:
//  - One RSA-OAEP-3072 (SHA-256) key pair.
//  - Public key is committed in plain (data/keys/public.json) so writers need no secret.
//  - Private key (PKCS8) is committed only encrypted with AES-256-GCM under a key
//    derived from the site password (PBKDF2-SHA256, 600k iterations).
//  - Every data file is encrypted with a fresh AES-256-GCM key, which is wrapped with
//    the RSA public key. Plain text is never written to the repository.
import { webcrypto as wc } from 'node:crypto';

const subtle = wc.subtle;
export const PBKDF2_ITER = 600000;

export const b64 = (buf) => Buffer.from(buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf).toString('base64');
export const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
const enc = new TextEncoder();
const dec = new TextDecoder();

export async function generateKeyPair() {
  return subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['wrapKey', 'unwrapKey', 'encrypt', 'decrypt']
  );
}

async function passwordKey(password, salt, iter = PBKDF2_ITER) {
  const base = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function exportPublic(pub) {
  return { v: 1, alg: 'RSA-OAEP-256', jwk: await subtle.exportKey('jwk', pub) };
}

export async function sealPrivate(priv, password) {
  const salt = wc.getRandomValues(new Uint8Array(16));
  const iv = wc.getRandomValues(new Uint8Array(12));
  const key = await passwordKey(password, salt);
  const pkcs8 = await subtle.exportKey('pkcs8', priv);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, pkcs8);
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: PBKDF2_ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}

export async function openPrivate(sealed, password) {
  const key = await passwordKey(password, unb64(sealed.salt), sealed.iter);
  const pkcs8 = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv) }, key, unb64(sealed.ct));
  return subtle.importKey('pkcs8', pkcs8, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['unwrapKey', 'decrypt']);
}

export async function importPublic(pubFile) {
  return subtle.importKey('jwk', pubFile.jwk, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['wrapKey', 'encrypt']);
}

export async function encryptJson(obj, pub) {
  const key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = wc.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  const ek = await subtle.wrapKey('raw', key, pub, { name: 'RSA-OAEP' });
  return { v: 1, alg: 'RSA-OAEP-256+A256GCM', ek: b64(ek), iv: b64(iv), ct: b64(ct) };
}

export async function decryptJson(file, priv) {
  const key = await subtle.unwrapKey('raw', unb64(file.ek), priv, { name: 'RSA-OAEP' }, { name: 'AES-GCM' }, false, ['decrypt']);
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(file.iv) }, key, unb64(file.ct));
  return JSON.parse(dec.decode(pt));
}
