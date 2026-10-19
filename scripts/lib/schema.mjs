// Validation for one day's briefing. Throws with a readable list of problems.
export const BGS = ['ISG', 'IDG', 'SSG', 'GROUP'];
export const LANGS = ['ko', 'en', 'zh'];
export const IMPACTS = ['demand_up', 'demand_down', 'cost_up', 'cost_down', 'neutral'];
export const PRODUCTS = ['server_dram', 'hbm', 'enterprise_ssd', 'pc_dram', 'lpddr', 'client_ssd', 'dram_general', 'nand_general'];
export const SIGNAL_DIRS = ['up', 'down', 'flat', 'cost_up', 'cost_down', 'none'];

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isUrl = (v) => typeof v === 'string' && /^https?:\/\//.test(v);

export function validateDay(d) {
  const errs = [];
  const need = (cond, msg) => { if (!cond) errs.push(msg); };
  need(/^\d{4}-\d{2}-\d{2}$/.test(d.date || ''), 'date must be YYYY-MM-DD');
  need(Array.isArray(d.headline3), 'headline3 must be an array');
  need(Array.isArray(d.items), 'items must be an array');
  (d.items || []).forEach((it, i) => {
    const p = `items[${i}]`;
    need(isStr(it.id), `${p}.id`);
    need(BGS.includes(it.bg), `${p}.bg must be one of ${BGS}`);
    need(isStr(it.title_ko), `${p}.title_ko`);
    need(isStr(it.title_orig), `${p}.title_orig`);
    need(LANGS.includes(it.lang), `${p}.lang must be one of ${LANGS}`);
    need(isStr(it.summary_ko), `${p}.summary_ko`);
    need(isStr(it.source), `${p}.source`);
    need([1, 2, 3, 4].includes(it.tier), `${p}.tier must be 1-4`);
    need(isUrl(it.url), `${p}.url must be http(s)`);
    need([1, 2, 3].includes(it.importance), `${p}.importance must be 1-3`);
    need(Array.isArray(it.tags), `${p}.tags must be an array`);
    if (it.also) need(Array.isArray(it.also) && it.also.every((a) => isStr(a.source) && isUrl(a.url)), `${p}.also entries need source and url`);
    if (it.memory != null) {
      need(Array.isArray(it.memory.products) && it.memory.products.every((x) => PRODUCTS.includes(x)), `${p}.memory.products must use ${PRODUCTS}`);
      need(IMPACTS.includes(it.memory.impact), `${p}.memory.impact must be one of ${IMPACTS}`);
      need(isStr(it.memory.note_ko), `${p}.memory.note_ko`);
    }
  });
  const s = d.memory_signals;
  need(s && typeof s === 'object', 'memory_signals required');
  if (s) for (const k of ['server', 'pc', 'cost']) {
    need(s[k] && SIGNAL_DIRS.includes(s[k].dir), `memory_signals.${k}.dir must be one of ${SIGNAL_DIRS}`);
    need(s[k] && typeof s[k].note_ko === 'string', `memory_signals.${k}.note_ko`);
  }
  if (d.statements) (d.statements).forEach((st, i) => {
    need(isStr(st.period) && isStr(st.text_ko) && isStr(st.source) && isUrl(st.url), `statements[${i}] needs period, text_ko, source, url`);
  });
  if (errs.length) throw new Error('Day file invalid:\n - ' + errs.join('\n - '));
  return true;
}

// China memory (CXMT / YMTC) news for one day.
export const CN_COMPANIES = ['CXMT', 'YMTC'];
export const CN_CATEGORIES = ['tech', 'capacity', 'customer', 'regulation', 'finance', 'litigation'];
export function validateCnDay(d) {
  const errs = [];
  const need = (c, m) => { if (!c) errs.push(m); };
  need(/^\d{4}-\d{2}-\d{2}$/.test(d.date || ''), 'date must be YYYY-MM-DD');
  need(Array.isArray(d.items), 'items must be an array');
  (d.items || []).forEach((it, i) => {
    const p = `items[${i}]`;
    need(isStr(it.id), `${p}.id`);
    need(CN_COMPANIES.includes(it.company), `${p}.company must be one of ${CN_COMPANIES}`);
    need(CN_CATEGORIES.includes(it.category), `${p}.category must be one of ${CN_CATEGORIES}`);
    need(isStr(it.title_ko) && isStr(it.title_orig), `${p}.title_ko / title_orig`);
    need(LANGS.includes(it.lang), `${p}.lang`);
    need(isStr(it.summary_ko), `${p}.summary_ko`);
    need(isStr(it.source) && isUrl(it.url), `${p}.source / url`);
    need([1, 2, 3, 4].includes(it.tier), `${p}.tier 1-4`);
    need(/^\d{4}-\d{2}-\d{2}/.test(it.published || ''), `${p}.published must start with YYYY-MM-DD`);
    need(typeof it.lenovo === 'boolean', `${p}.lenovo must be true/false`);
    if (it.also) need(Array.isArray(it.also) && it.also.every((a) => isStr(a.source) && isUrl(a.url)), `${p}.also entries need source and url`);
  });
  if (errs.length) throw new Error('China-memory day file invalid:\n - ' + errs.join('\n - '));
  return true;
}
