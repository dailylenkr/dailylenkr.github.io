// Usage: node scripts/publish-company.mjs [company/financials.json]
// Encrypts Lenovo's public financial figures into data/company.enc.json for the page.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importPublic, encryptJson } from './lib/crypto.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2] || path.join(root, 'company/financials.json');
const data = JSON.parse(await readFile(input, 'utf8'));
for (const k of ['updated', 'annual', 'segments']) if (!(k in data)) throw new Error(`financials missing ${k}`);
const pub = await importPublic(JSON.parse(await readFile(path.join(root, 'data/keys/public.json'), 'utf8')));
await writeFile(path.join(root, 'data/company.enc.json'), JSON.stringify(await encryptJson(data, pub)) + '\n');
console.log(`Published company data: ${data.annual.length} years, ${data.segments.length} segment periods`);
