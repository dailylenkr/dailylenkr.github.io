// Usage: node scripts/check-seen.mjs <file with one URL per line>
// Prints only the URLs NOT yet published on earlier days, so they can be summarised.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { urlHash } from './lib/seen.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let seen = {};
try { seen = JSON.parse(await readFile(path.join(root, 'data/seen.json'), 'utf8')); } catch {}
const urls = (await readFile(process.argv[2], 'utf8')).split('\n').map((s) => s.trim()).filter(Boolean);
const fresh = urls.filter((u) => !seen[urlHash(u)]);
console.log(fresh.join('\n'));
console.error(`${urls.length - fresh.length} already published, ${fresh.length} new.`);
