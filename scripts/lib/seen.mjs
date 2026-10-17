import { createHash } from 'node:crypto';

// Normalise a URL (drop tracking params, fragments, trailing slash) and hash it.
export function normUrl(u) {
  try {
    const x = new URL(u);
    x.hash = '';
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|spm|from|share|fbclid|gclid)/i.test(k)) x.searchParams.delete(k);
    return (x.host.replace(/^www\./, '') + x.pathname.replace(/\/$/, '') + (x.search || '')).toLowerCase();
  } catch { return String(u).trim().toLowerCase(); }
}
export const urlHash = (u) => createHash('sha256').update(normUrl(u)).digest('hex').slice(0, 24);
