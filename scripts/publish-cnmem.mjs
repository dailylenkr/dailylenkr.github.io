// Usage: node scripts/publish-cnmem.mjs   (reads company/cnmem.json)
// Encrypts the CXMT/YMTC overview, roadmap, metrics and timeline into data/cnmem.enc.json.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importPublic, encryptJson } from './lib/crypto.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(await readFile(process.argv[2] || path.join(root, 'company/cnmem.json'), 'utf8'));
for (const c of ['CXMT', 'YMTC']) {
  const x = data.companies?.[c];
  if (!x) throw new Error(`cnmem.json missing ${c}`);
  for (const k of ['overview', 'roadmap', 'metrics', 'timeline']) if (!Array.isArray(x[k])) throw new Error(`${c}.${k} must be an array`);
  for (const r of [...x.roadmap, ...x.metrics, ...x.timeline]) if (r.url && !/^https?:\/\//.test(r.url)) throw new Error(`${c}: bad url ${r.url}`);
}
const pub = await importPublic(JSON.parse(await readFile(path.join(root, 'data/keys/public.json'), 'utf8')));
await writeFile(path.join(root, 'data/cnmem.enc.json'), JSON.stringify(await encryptJson(data, pub)) + '\n');
console.log('Published China-memory profiles (CXMT, YMTC)');
