// Usage: node scripts/publish-cn.mjs /tmp/dailylenkr/<date>.cn.json
// Encrypts one day of CXMT/YMTC news into data/cn-days/<date>.enc.json and lists it in
// data/manifest.json (cn_days). Plain input must live outside the repository.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importPublic, encryptJson } from './lib/crypto.mjs';
import { validateCnDay } from './lib/schema.mjs';
import { urlHash } from './lib/seen.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input || path.resolve(input).startsWith(root + path.sep)) {
  console.error('usage: node scripts/publish-cn.mjs <plain.json outside the repo>');
  process.exit(2);
}
const day = JSON.parse(await readFile(input, 'utf8'));
validateCnDay(day);

const seenPath = path.join(root, 'data/seen.json');
let seen = {};
try { seen = JSON.parse(await readFile(seenPath, 'utf8')); } catch {}
const key = (u) => 'cn:' + urlHash(u);
const before = day.items.length;
day.items = day.items.filter((it) => { const s = seen[key(it.url)]; return !(s && s !== day.date); });
if (before !== day.items.length) console.log(`Dropped ${before - day.items.length} China-memory item(s) already published earlier.`);
for (const it of day.items) seen[key(it.url)] = day.date;
await writeFile(seenPath, JSON.stringify(seen) + '\n');

const pub = await importPublic(JSON.parse(await readFile(path.join(root, 'data/keys/public.json'), 'utf8')));
await mkdir(path.join(root, 'data/cn-days'), { recursive: true });
await writeFile(path.join(root, 'data/cn-days', `${day.date}.enc.json`), JSON.stringify(await encryptJson(day, pub)) + '\n');

const mPath = path.join(root, 'data/manifest.json');
const manifest = JSON.parse(await readFile(mPath, 'utf8'));
manifest.cn_days = [...new Set([...(manifest.cn_days || []), day.date])].sort().reverse();
await writeFile(mPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Published China-memory ${day.date}: ${day.items.length} items`);
