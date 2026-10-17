// Run by the "Set up or change password" GitHub Actions workflow (never locally with the real password).
//  - No keys yet: creates the key pair, writes data/keys/public.json and data/keys/private.json
//    (private key sealed with SITE_PASSWORD).
//  - Keys exist and SITE_PASSWORD_OLD is set: re-seals the existing private key with the new
//    SITE_PASSWORD (password change). Data files do not need re-encryption.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPair, exportPublic, sealPrivate, openPrivate } from './lib/crypto.mjs';
import { webcrypto as wc } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data/keys');
const pw = process.env.SITE_PASSWORD;
const oldPw = process.env.SITE_PASSWORD_OLD;
if (!pw || pw.length < 8) { console.error('SITE_PASSWORD secret missing or shorter than 8 characters.'); process.exit(1); }

const exists = await access(path.join(dir, 'private.json')).then(() => true, () => false);
await mkdir(dir, { recursive: true });

if (!exists) {
  const kp = await generateKeyPair();
  await writeFile(path.join(dir, 'public.json'), JSON.stringify(await exportPublic(kp.publicKey), null, 2) + '\n');
  await writeFile(path.join(dir, 'private.json'), JSON.stringify(await sealPrivate(kp.privateKey, pw), null, 2) + '\n');
  console.log('Created a new key pair.');
} else {
  if (!oldPw) { console.log('Keys already exist. To change the password, set SITE_PASSWORD_OLD too. Nothing changed.'); process.exit(0); }
  const sealed = JSON.parse(await readFile(path.join(dir, 'private.json'), 'utf8'));
  // Re-open with the old password as extractable so it can be re-sealed.
  const { unb64 } = await import('./lib/crypto.mjs');
  const base = await wc.subtle.importKey('raw', new TextEncoder().encode(oldPw), 'PBKDF2', false, ['deriveKey']);
  const k = await wc.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(sealed.salt), iterations: sealed.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const pkcs8 = await wc.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sealed.iv) }, k, unb64(sealed.ct));
  const priv = await wc.subtle.importKey('pkcs8', pkcs8, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['unwrapKey', 'decrypt']);
  await writeFile(path.join(dir, 'private.json'), JSON.stringify(await sealPrivate(priv, pw), null, 2) + '\n');
  await openPrivate(JSON.parse(await readFile(path.join(dir, 'private.json'), 'utf8')), pw);
  console.log('Password changed. Remove the SITE_PASSWORD_OLD secret now.');
}
