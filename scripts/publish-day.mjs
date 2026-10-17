// Usage: node scripts/publish-day.mjs /path/outside/repo/2026-10-17.json
// Validates a day's plain JSON, encrypts it with the public key into data/days/<date>.enc.json
// and updates data/manifest.json. The plain input must live OUTSIDE the repository.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importPublic, encryptJson } from './lib/crypto.mjs';
import { validateDay } from './lib/schema.mjs';
import { urlHash } from './lib/seen.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input) { console.error('usage: node scripts/publish-day.mjs <plain.json>'); process.exit(2); }
if (path.resolve(input).startsWith(root + path.sep)) {
  console.error('Refusing: the plain input file must be outside the repository.');
  process.exit(2);
}

const day = JSON.parse(await readFile(input, 'utf8'));
validateDay(day);
day.generated_at = day.generated_at || new Date().toISOString();

// Drop stories already published on earlier days. Only SHA-256 hashes of URLs are kept
// in the repo (data/seen.json), so nothing readable leaks.
const seenPath = path.join(root, 'data/seen.json');
let seen = {};
try { seen = JSON.parse(await readFile(seenPath, 'utf8')); } catch {}
const before = day.items.length;
day.items = day.items.filter((it) => {
  const urls = [it.url, ...(it.also || []).map((a) => a.url)];
  return !urls.some((u) => { const s = seen[urlHash(u)]; return s && s !== day.date; });
});
if (before !== day.items.length) console.log(`Dropped ${before - day.items.length} item(s) already published on earlier days.`);
for (const it of day.items) for (const u of [it.url, ...(it.also || []).map((a) => a.url)]) seen[urlHash(u)] = day.date;
await mkdir(path.join(root, 'data'), { recursive: true });
await writeFile(seenPath, JSON.stringify(seen) + '\n');

const pub = await importPublic(JSON.parse(await readFile(path.join(root, 'data/keys/public.json'), 'utf8')));
await mkdir(path.join(root, 'data/days'), { recursive: true });
const out = path.join(root, 'data/days', `${day.date}.enc.json`);
await writeFile(out, JSON.stringify(await encryptJson(day, pub)) + '\n');

const mPath = path.join(root, 'data/manifest.json');
let manifest = { days: [] };
try { manifest = JSON.parse(await readFile(mPath, 'utf8')); } catch {}
const days = new Set(manifest.days || []);
days.add(day.date);
manifest.days = [...days].sort().reverse();
manifest.updated = new Date().toISOString();
await writeFile(mPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(`Published ${day.date}: ${day.items.length} items -> ${path.relative(root, out)}`);
