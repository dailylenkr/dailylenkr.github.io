import { unlock, lock, loadEncrypted, loadPlain } from './crypto.js';

/* ---------- constants ---------- */
const BG = {
  ISG: { name: 'ISG', sub: '인프라 솔루션 · 서버·스토리지·데이터센터', short: '인프라' },
  IDG: { name: 'IDG', sub: '인텔리전트 디바이스 · PC·스마트폰·태블릿', short: '디바이스' },
  SSG: { name: 'SSG', sub: '솔루션·서비스', short: '솔루션·서비스' },
  GROUP: { name: '그룹 전반', sub: '실적·경영진·전략', short: '' },
};
const BG_ORDER = ['ISG', 'IDG', 'SSG', 'GROUP'];
const PROD = { server_dram: '서버 DRAM', hbm: 'HBM', enterprise_ssd: '엔터프라이즈 SSD', pc_dram: 'PC DRAM', lpddr: 'LPDDR', client_ssd: '클라이언트 SSD', dram_general: 'DRAM 전반', nand_general: 'NAND 전반' };
const IMPACT = { demand_up: ['수요 ↑', 'up'], demand_down: ['수요 ↓', 'down'], cost_up: ['원가 ▲', 'cost'], cost_down: ['원가 ▼', 'up'], neutral: ['중립', 'flat'] };
const SIG = { up: ['↑ 확대', 'up'], down: ['↓ 둔화', 'down'], flat: ['→ 보합', 'flat'], cost_up: ['▲ 원가 부담', 'cost'], cost_down: ['▼ 원가 완화', 'up'], none: ['— 신호 없음', 'flat'] };
const SIG_LABEL = { server: '서버 메모리 수요 · DRAM·HBM', pc: 'PC 메모리 수요 · DRAM·SSD', cost: '메모리 원가·가격 전가' };
const LANG = { zh: '中', en: 'EN', ko: 'KR' };
const TIER = { 1: '공식', 2: '주요 매체', 3: '조사기관', 4: '전문지' };
const WD = '일월화수목금토';
const IDLE_LOCK_MS = 30 * 60 * 1000;

/* ---------- tiny DOM helper (text only, never innerHTML) ---------- */
function h(tag, attrs, ...kids) {
  const svg = ['svg', 'g', 'rect', 'line', 'polyline', 'circle', 'text', 'title', 'path'].includes(tag);
  const el = svg ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.setAttribute('class', v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);
const ext = (href, text, cls) => {
  const u = safeUrl(href);
  return u ? h('a', { href: u, target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer', class: cls }, text) : h('span', { class: cls }, text);
};
const icon = (paths) => h('svg', { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'aria-hidden': 'true' }, paths.map((d) => h('path', { d })));

/* ---------- formatting ---------- */
const kst = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3);
function fmtDate(date, withWd = true) {
  const [y, m, d] = date.split('-').map(Number);
  const wd = WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')}${withWd ? ` (${wd})` : ''}`;
}
function fmtTime(iso) {
  if (!iso) return '';
  const t = kst(iso);
  if (isNaN(t)) return '';
  return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
}
function fmtPub(s) {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(5).replace('-', '.');
  const t = kst(s);
  if (isNaN(t)) return s;
  return `${String(t.getUTCMonth() + 1).padStart(2, '0')}.${String(t.getUTCDate()).padStart(2, '0')} ${fmtTime(s)}`;
}
// values are USD millions
function usd(m) {
  if (m == null || isNaN(m)) return '—';
  const eok = m / 100;
  return `${eok.toLocaleString('ko-KR', { maximumFractionDigits: Math.abs(eok) < 100 ? 1 : 0 })}억 달러`;
}
const pct = (v, digits = 1) => (v == null || !isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`);
const growth = (a, b) => (a == null || b == null || !b ? null : ((a - b) / Math.abs(b)) * 100);

/* ---------- state ---------- */
const S = {
  manifest: null, days: new Map(), company: undefined,
  view: 'today', date: null, bg: 'ALL', memOnly: false, tag: null,
  memPeriod: 7, segMode: 'rev', fy: null, query: '', searchAll: false,
};
const app = document.getElementById('app');

async function getDay(date) {
  if (!S.days.has(date)) S.days.set(date, loadEncrypted(`data/days/${date}.enc.json`).catch((e) => { S.days.delete(date); throw e; }));
  return S.days.get(date);
}
async function getDays(n) {
  const dates = (S.manifest.days || []).slice(0, n);
  const out = [];
  for (const d of dates) { try { out.push(await getDay(d)); } catch { /* skip broken file */ } }
  return out;
}
const loadedDay = (date) => {
  const p = S.days.get(date);
  return p && p.done ? p.value : null;
};

/* ---------- lock screen ---------- */
const pw = document.getElementById('pw');
const pwBox = document.getElementById('pwBox');
const pwErr = document.getElementById('pwError');
const btn = document.getElementById('unlock');
document.getElementById('pwToggle').addEventListener('click', (e) => {
  const show = pw.type === 'password';
  pw.type = show ? 'text' : 'password';
  e.currentTarget.setAttribute('aria-label', show ? '비밀번호 숨기기' : '비밀번호 보기');
});
pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
btn.addEventListener('click', tryUnlock);
pw.focus();

async function tryUnlock() {
  if (!pw.value) return;
  btn.disabled = true; btn.textContent = '확인 중…';
  pwErr.hidden = true; pwBox.classList.remove('bad');
  try {
    await unlock(pw.value);
    pw.value = '';
    S.manifest = await loadPlain('data/manifest.json').catch(() => ({ days: [] }));
    document.getElementById('lock').hidden = true;
    app.hidden = false;
    startIdleLock();
    window.addEventListener('hashchange', route);
    route();
  } catch (e) {
    pwBox.classList.add('bad');
    pwErr.hidden = false;
    pwErr.textContent = e.message === 'BAD_PASSWORD' ? '비밀번호가 맞지 않습니다. 다시 입력해 주세요.'
      : e.message === 'NOT_SET_UP' ? '아직 초기 설정(비밀번호 등록)이 끝나지 않았습니다.'
      : '불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
  } finally {
    btn.disabled = false; btn.textContent = '들어가기';
  }
}
function lockNow() { lock(); S.days.clear(); location.replace(location.pathname); }
function startIdleLock() {
  let t;
  const reset = () => { clearTimeout(t); t = setTimeout(lockNow, IDLE_LOCK_MS); };
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
  reset();
}

/* ---------- routing / shell ---------- */
const VIEWS = [
  ['today', '오늘 브리핑', ['M4 5h16v14H4z', 'M8 9h8M8 13h8M8 17h5']],
  ['memory', '메모리 영향', ['M6 6h12v12H6z', 'M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4']],
  ['company', '기업 현황', ['M4 20V10M10 20V4M16 20v-7M22 20H2']],
  ['archive', '아카이브', ['M4 6h16v14H4z', 'M4 10h16M9 3v4M15 3v4']],
];
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

function route() {
  const [v, arg] = location.hash.replace(/^#/, '').split('/');
  S.view = VIEWS.some(([k]) => k === v) ? v : 'today';
  if (S.view === 'today') S.date = arg && S.manifest.days.includes(arg) ? arg : S.manifest.days[0] || null;
  render();
  window.scrollTo(0, 0);
}

function shell(content) {
  const nav = (cls) => VIEWS.map(([k, label, paths]) => h('button', { type: 'button', 'aria-current': S.view === k ? 'page' : null, onclick: () => go(`#${k}`) }, cls ? [icon(paths), label] : label));
  app.replaceChildren(
    h('header', { class: 'top' }, h('div', { class: 'top-in' },
      h('a', { class: 'brand', href: '#today' }, h('span', { class: 'logo' }, 'DL'), h('span', { class: 'brand-name' }, '데일리 레노버')),
      h('nav', { class: 'nav', 'aria-label': '메뉴' }, nav(false)),
      h('div', { class: 'spacer' }),
      h('button', { type: 'button', class: 'btn-ghost', onclick: lockNow, title: '잠그고 화면 지우기' },
        h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'aria-hidden': 'true' }, h('rect', { x: 5, y: 11, width: 14, height: 10, rx: 2 }), h('path', { d: 'M8 11V7a4 4 0 0 1 8 0v4' })),
        '잠그기'),
    )),
    h('div', { class: 'wrap' }, content,
      h('div', { class: 'foot' }, '공개 뉴스·공시만으로 매일 자동 수집·요약한 개인 브리핑입니다. 레노버와 무관하며, 원문 저작권은 각 매체에 있습니다. 이 페이지는 외부 서버에 어떤 요청도 보내지 않고, 기기에 아무것도 저장하지 않습니다. 30분간 사용하지 않으면 자동으로 잠깁니다.')),
    h('nav', { class: 'bottom-nav', 'aria-label': '하단 메뉴' }, nav(true)),
  );
}
const loading = () => h('div', { class: 'loading' }, '불러오는 중…');

async function render() {
  shell(loading());
  try {
    const content = S.view === 'memory' ? await viewMemory()
      : S.view === 'company' ? await viewCompany()
      : S.view === 'archive' ? await viewArchive()
      : await viewToday();
    app.querySelector('.wrap').firstChild.replaceWith(content);
  } catch (e) {
    app.querySelector('.wrap').firstChild.replaceWith(h('div', { class: 'card empty' }, '데이터를 불러오지 못했습니다.'));
    console.error(e);
  }
}

/* ---------- item card ---------- */
function itemCard(it) {
  const mem = it.memory;
  return h('article', { class: 'item' },
    (mem || it.importance === 3) && h('div', { class: 'mem-line' },
      it.importance === 3 && h('span', { class: 'imp-dot' }, '● 주요'),
      mem && h('span', { class: 'badge-mem' }, '메모리'),
      mem && h('span', { class: 'mem-prod' }, mem.products.map((p) => PROD[p] || p).join(' · '))),
    h('h3', null, ext(it.url, it.title_ko, 'title-link')),
    it.lang !== 'ko' && it.title_orig && h('div', { class: 'orig', lang: it.lang === 'zh' ? 'zh' : 'en' }, it.title_orig),
    h('p', null, it.summary_ko),
    mem && h('div', { class: 'mem-note' }, `메모리 관점 · ${IMPACT[mem.impact]?.[0] || ''} — ${mem.note_ko}`),
    h('div', { class: 'meta' },
      h('span', { class: 'lang', title: TIER[it.tier] }, LANG[it.lang] || it.lang),
      it.published && h('span', null, fmtPub(it.published)),
      (it.tags || []).map((t) => h('span', { class: 'tag' }, t)),
      ext(it.url, `${it.source} 원문 ↗`, 'src')),
    it.also?.length && h('div', { class: 'also' }, '같은 소식: ', it.also.map((a, i) => [i ? ', ' : '', ext(a.url, a.source)])),
  );
}

/* ---------- today ---------- */
async function viewToday() {
  if (!S.date) return h('div', { class: 'card empty' }, '아직 수집된 브리핑이 없습니다. 첫 수집은 다음 날 아침에 올라옵니다.');
  const day = await getDay(S.date);
  const recent = await getDays(7);
  const isLatest = S.date === S.manifest.days[0];

  const filtered = day.items.filter((it) =>
    (S.bg === 'ALL' || it.bg === S.bg) && (!S.memOnly || it.memory) && (!S.tag || (it.tags || []).includes(S.tag)));
  const sources = new Set(day.items.map((i) => i.source));

  const setBg = (bg) => { S.bg = bg; render(); };
  const count = (bg) => day.items.filter((i) => bg === 'ALL' || i.bg === bg).length;
  const tagCount = new Map();
  recent.forEach((d) => d.items.forEach((it) => (it.tags || []).forEach((t) => tagCount.set(t, (tagCount.get(t) || 0) + 1))));
  const topTags = [...tagCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t);

  const side = h('aside', { class: 'side' },
    h('div', null, h('div', { class: 'side-h' }, '사업부'),
      [['ALL', '전체'], ...BG_ORDER.map((b) => [b, BG[b].name])].map(([b, label]) =>
        h('button', { type: 'button', class: 'filter', 'aria-pressed': String(S.bg === b), onclick: () => setBg(b) },
          b !== 'ALL' && h('span', { class: `sq ${b}` }), label,
          b !== 'ALL' && BG[b].short && h('span', { class: 'muted' }, `· ${BG[b].short}`),
          h('span', { class: 'n' }, count(b)))),
      h('label', { class: 'mem-toggle' },
        h('input', { type: 'checkbox', checked: S.memOnly, onchange: (e) => { S.memOnly = e.target.checked; render(); } }),
        `메모리 관련만 보기 (${day.items.filter((i) => i.memory).length})`)),
    topTags.length > 0 && h('div', null, h('div', { class: 'side-h' }, '최근 7일 키워드'),
      h('div', { class: 'chips' }, topTags.map((t) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(S.tag === t), onclick: () => { S.tag = S.tag === t ? null : t; render(); } }, t)))),
    h('div', { class: 'daylist' }, h('div', { class: 'side-h' }, '지난 브리핑'),
      S.manifest.days.slice(0, 7).map((d) => {
        const ld = recent.find((x) => x.date === d);
        return h('button', { type: 'button', 'aria-current': String(d === S.date), onclick: () => go(`#today/${d}`) },
          h('span', null, fmtDate(d).slice(5)), h('span', { class: 'muted' }, ld ? `${ld.items.length}건` : ''));
      }),
      h('button', { type: 'button', class: 'link-btn', onclick: () => go('#archive') }, '전체 아카이브 보기 →')),
  );

  const mobileFilters = h('div', { class: 'mobile-filters' },
    h('button', { type: 'button', class: 'chip', 'aria-pressed': String(S.bg === 'ALL' && !S.memOnly), onclick: () => { S.bg = 'ALL'; S.memOnly = false; render(); } }, '전체'),
    h('button', { type: 'button', class: 'chip mem', 'aria-pressed': String(S.memOnly), onclick: () => { S.memOnly = !S.memOnly; render(); } }, '메모리'),
    BG_ORDER.map((b) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(S.bg === b), onclick: () => setBg(S.bg === b ? 'ALL' : b) }, BG[b].name)));

  const sections = BG_ORDER.filter((b) => S.bg === 'ALL' || S.bg === b).map((b) => {
    const items = filtered.filter((i) => i.bg === b).sort((x, y) => y.importance - x.importance);
    if (!items.length) return null;
    return h('section', { class: 'sec' },
      h('div', { class: 'sec-h' }, h('span', { class: `bar ${b}` }), h('h2', null, BG[b].name), h('span', { class: 'sub' }, BG[b].sub)),
      items.map(itemCard));
  }).filter(Boolean);

  const main = h('div', { class: 'main' },
    h('div', { class: 'page-head' },
      h('div', null,
        h('div', { class: 'kicker' }, `${fmtDate(S.date)} · ${fmtTime(day.generated_at)} 업데이트`),
        h('h1', { class: 'page-title' }, isLatest ? '오늘의 레노버 브리핑' : '레노버 브리핑')),
      h('div', { class: 'muted' }, `기사 ${day.items.length}건 · 출처 ${sources.size}곳`)),
    mobileFilters,
    day.headline3?.length > 0 && h('section', { class: 'core' }, h('div', { class: 'core-h' }, '오늘의 핵심'),
      h('ol', null, day.headline3.map((t) => h('li', null, t)))),
    S.tag && h('div', { class: 'note' }, `키워드 "${S.tag}" 기사만 보는 중 · `, h('button', { type: 'button', class: 'link-btn', onclick: () => { S.tag = null; render(); } }, '해제')),
    sections.length ? sections : h('div', { class: 'card empty' }, day.items.length ? '조건에 맞는 기사가 없습니다.' : '이 날은 새로 수집된 주요 소식이 없습니다.'),
  );
  return h('div', { class: 'cols' }, side, main);
}

/* ---------- memory ---------- */
async function viewMemory() {
  const days = await getDays(S.memPeriod);
  if (!days.length) return h('div', { class: 'card empty' }, '아직 수집된 데이터가 없습니다.');
  const latest = days[0];
  const rows = [];
  days.forEach((d) => d.items.forEach((it) => { if (it.memory) rows.push({ ...it, date: d.date }); }));
  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.importance - a.importance));
  const [prodFilter, setProd] = [S.prod || 'ALL', (p) => { S.prod = p; render(); }];
  const shown = rows.filter((r) => prodFilter === 'ALL' || r.memory.products.includes(prodFilter));

  const pstats = Object.keys(PROD).map((p) => {
    const rs = rows.filter((r) => r.memory.products.includes(p));
    const tally = {};
    rs.forEach((r) => { tally[r.memory.impact] = (tally[r.memory.impact] || 0) + 1; });
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    return { p, n: rs.length, impact: top ? top[0] : 'neutral' };
  }).filter((s) => s.n > 0);

  const stmts = [];
  const seen = new Set();
  days.forEach((d) => (d.statements || []).forEach((s) => { if (!seen.has(s.text_ko)) { seen.add(s.text_ko); stmts.push(s); } }));

  const periods = [[7, '최근 7일'], [30, '30일'], [90, '90일']];
  const first = days[days.length - 1].date;
  return h('div', { class: 'main' },
    h('div', { class: 'page-head' },
      h('div', null,
        h('div', { class: 'kicker mem' }, `${fmtDate(first, false)} – ${fmtDate(latest.date, false)}`),
        h('h1', { class: 'page-title' }, '메모리 영향 분석'),
        h('p', { class: 'page-sub' }, '레노버 공개 뉴스·실적 발표를 메모리 수요와 원가 관점에서 해석합니다')),
      h('div', { class: 'seg', role: 'group', 'aria-label': '기간' }, periods.map(([n, l]) =>
        h('button', { type: 'button', 'aria-pressed': String(S.memPeriod === n), onclick: () => { S.memPeriod = n; render(); } }, l)))),
    h('div', { class: 'grid3' }, ['server', 'pc', 'cost'].map((k) => {
      const s = latest.memory_signals?.[k] || { dir: 'none', note_ko: '' };
      const [label, cls] = SIG[s.dir] || SIG.none;
      return h('div', { class: 'sig' }, h('div', { class: 'sig-h' }, SIG_LABEL[k]), h('div', { class: `sig-v ${cls}` }, label),
        s.note_ko && h('p', null, s.note_ko), h('div', { class: 'note' }, `${fmtDate(latest.date, false)} 기준`));
    })),
    h('section', { class: 'sec' },
      h('div', { class: 'sec-h' }, h('h2', null, '기사별 메모리 영향'), h('span', { class: 'sub' }, `${rows.length}건`),
        h('div', { class: 'spacer' }),
        h('div', { class: 'chips' }, [['ALL', '전체 제품'], ...pstats.map((s) => [s.p, PROD[s.p]])].map(([p, l]) =>
          h('button', { type: 'button', class: 'chip', 'aria-pressed': String(prodFilter === p), onclick: () => setProd(p) }, l)))),
      shown.length ? h('div', { class: 'tbl-wrap stack-sm' }, h('table', null,
        h('thead', null, h('tr', null, ['기사', '사업부', '관련 제품', '영향', '해석'].map((t) => h('th', null, t)))),
        h('tbody', null, shown.map((r) => h('tr', null,
          h('td', null, h('div', null, ext(r.url, r.title_ko)), h('div', { class: 'note' }, `${r.source} · ${fmtDate(r.date, false)}`)),
          h('td', { class: 'inl' }, h('span', { class: `pill ${r.bg}` }, BG[r.bg].name)),
          h('td', { class: 'inl mem-prod' }, r.memory.products.map((p) => PROD[p] || p).join(' · ')),
          h('td', { class: 'inl' }, h('span', { class: `dir ${IMPACT[r.memory.impact]?.[1]}` }, IMPACT[r.memory.impact]?.[0])),
          h('td', null, r.memory.note_ko))))))
        : h('div', { class: 'empty' }, '이 기간에 메모리 관련 기사가 없습니다.')),
    h('div', { class: 'grid2' },
      h('section', { class: 'card' }, h('h2', null, '제품별 영향 맵 ', h('span', { class: 'sub' }, periods.find(([n]) => n === S.memPeriod)[1])),
        pstats.length ? h('div', { class: 'pmap' }, pstats.map((s) => h('div', { class: 'pbox' },
          h('div', { class: 'l' }, PROD[s.p]), h('div', { class: `v dir ${IMPACT[s.impact][1]}` }, `${IMPACT[s.impact][0]} · ${s.n}건`))))
          : h('div', { class: 'note' }, '데이터가 쌓이면 표시됩니다.')),
      h('section', { class: 'card' }, h('h2', null, '레노버의 메모리 관련 공개 발언 ', h('span', { class: 'sub' }, '실적 발표·인터뷰')),
        stmts.length ? stmts.map((s) => h('div', { class: 'stmt' }, h('span', { class: 'p' }, s.period), h('span', null, s.text_ko, ' ', ext(s.url, `(${s.source})`, 'note'))))
          : h('div', { class: 'note' }, '이 기간에 수집된 발언이 없습니다.'))),
    h('p', { class: 'note' }, '공개 뉴스·공시를 바탕으로 한 해석이며 투자 판단의 근거가 아닙니다.'),
  );
}

/* ---------- company ---------- */
function svgEl(w, hgt, label) { return h('svg', { class: 'chart', viewBox: `0 0 ${w} ${hgt}`, role: 'img', 'aria-label': label }); }

function annualChart(rows) {
  const W = 1200, H = 300, L = 56, R = 16, T = 20, B = 40;
  const max = Math.max(...rows.map((r) => r.revenue || 0)) * 1.1 || 1;
  const opVals = rows.map((r) => r.op).filter((v) => v != null);
  const opMax = Math.max(...opVals, 1) * 1.25;
  const opMin = Math.min(0, ...opVals);
  const svg = svgEl(W, H, '연도별 매출과 영업이익');
  const bw = (W - L - R) / rows.length;
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const yo = (v) => T + (H - T - B) * (1 - (v - opMin) / (opMax - opMin));
  [0, 0.25, 0.5, 0.75, 1].forEach((f) => {
    svg.append(h('line', { x1: L, x2: W - R, y1: y(max * f / 1.1), y2: y(max * f / 1.1), stroke: '#EEF0F2' }));
    svg.append(h('text', { x: L - 6, y: y(max * f / 1.1) + 4, 'text-anchor': 'end' }, Math.round(max * f / 1.1 / 100).toLocaleString('ko-KR')));
  });
  const step = Math.ceil(rows.length / 12);
  const pts = [];
  rows.forEach((r, i) => {
    const x = L + i * bw;
    const g = h('g', null, h('title', null, `${r.fy}  매출 ${usd(r.revenue)} · 영업이익 ${usd(r.op)}${r.revenue && r.op != null ? ` · 이익률 ${(r.op / r.revenue * 100).toFixed(1)}%` : ''}`));
    g.append(h('rect', { x: x + bw * 0.18, y: y(r.revenue || 0), width: bw * 0.64, height: Math.max(0, H - B - y(r.revenue || 0)), fill: i >= rows.length - 2 ? '#8A93A3' : '#C9CFD8', rx: 2 }));
    svg.append(g);
    if (r.op != null) pts.push(`${x + bw / 2},${yo(r.op)}`);
    if (i % step === 0 || i === rows.length - 1) svg.append(h('text', { x: x + bw / 2, y: H - 16, 'text-anchor': 'middle' }, r.fy.replace('FY', '')));
  });
  if (pts.length > 1) svg.append(h('polyline', { points: pts.join(' '), fill: 'none', stroke: '#B3122B', 'stroke-width': 2.5 }));
  rows.forEach((r, i) => { if (r.op != null) svg.append(h('circle', { cx: L + i * bw + bw / 2, cy: yo(r.op), r: 3, fill: '#B3122B' }, h('title', null, `${r.fy} 영업이익 ${usd(r.op)}`))); });
  svg.append(h('text', { x: L - 6, y: 12, 'text-anchor': 'end' }, '억$'));
  return svg;
}

function segmentChart(rows, mode) {
  const W = 600, H = 260, L = 44, R = 8, T = 16, B = 40;
  const bgs = ['IDG', 'ISG', 'SSG'];
  const col = { IDG: '#1F4FD1', ISG: '#E07A1F', SSG: '#0E7C6B' };
  const val = (r, b) => (mode === 'op' ? r[b]?.op : r[b]?.rev) ?? 0;
  const tot = (r) => bgs.reduce((s, b) => s + Math.max(0, val(r, b)), 0);
  const max = mode === 'share' ? 100 : Math.max(...rows.map(tot), 1) * 1.08;
  const min = mode === 'op' ? Math.min(0, ...rows.flatMap((r) => bgs.map((b) => val(r, b)))) : 0;
  const svg = svgEl(W, H, '분기별 사업부 구성');
  const bw = (W - L - R) / rows.length;
  const y = (v) => T + (H - T - B) * (1 - (v - min) / (max - min));
  [0, 0.5, 1].forEach((f) => {
    const v = min + (max - min) * f;
    svg.append(h('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: '#EEF0F2' }));
    svg.append(h('text', { x: L - 4, y: y(v) + 4, 'text-anchor': 'end' }, mode === 'share' ? `${Math.round(v)}%` : Math.round(v / 100).toLocaleString('ko-KR')));
  });
  const step = Math.ceil(rows.length / 6);
  rows.forEach((r, i) => {
    const x = L + i * bw + bw * 0.15, w = bw * 0.7;
    let acc = 0;
    const total = tot(r);
    const g = h('g', null, h('title', null, `${r.period}  ` + bgs.map((b) => `${b} ${mode === 'share' ? (total ? (Math.max(0, val(r, b)) / total * 100).toFixed(1) + '%' : '—') : usd(r[b]?.[mode === 'op' ? 'op' : 'rev'])}`).join(' · ')));
    bgs.forEach((b) => {
      let v = val(r, b);
      if (mode === 'share') v = total ? Math.max(0, v) / total * 100 : 0;
      if (v >= 0) { g.append(h('rect', { x, y: y(acc + v), width: w, height: Math.max(0, y(acc) - y(acc + v)), fill: col[b] })); acc += v; }
      else g.append(h('rect', { x, y: y(0), width: w, height: Math.max(0, y(v) - y(0)), fill: col[b], opacity: 0.5 }));
    });
    svg.append(g);
    if (i % step === 0 || i === rows.length - 1) svg.append(h('text', { x: x + w / 2, y: H - 16, 'text-anchor': 'middle' }, r.period.replace('FY', '')));
  });
  return svg;
}

async function viewCompany() {
  if (S.company === undefined) S.company = await loadEncrypted('data/company.enc.json').catch(() => null);
  const c = S.company;
  if (!c) return h('div', { class: 'card empty' }, '기업 실적 데이터를 준비 중입니다.');
  const annual = c.annual || [];
  const qsegs = (c.segments || []).filter((s) => s.type === 'Q');
  const fsegs = (c.segments || []).filter((s) => s.type === 'FY');
  const segRows = qsegs.length >= 6 ? qsegs : fsegs; // quarterly view once enough quarters accumulate
  if (!S.fy && fsegs.length) S.fy = fsegs[fsegs.length - 1].period;
  const fyRow = fsegs.find((s) => s.period === S.fy);
  const prevRow = fsegs[fsegs.indexOf(fyRow) - 1];

  return h('div', { class: 'main' },
    h('div', { class: 'page-head' },
      h('div', null,
        h('div', { class: 'kicker' }, 'HKEX 992 · 회계연도 4월–3월'),
        h('h1', { class: 'page-title' }, '레노버 기업 현황'),
        h('p', { class: 'page-sub' }, `레노버 IR 실적 공시 기준 · 최근 반영 ${c.latest_period || ''} · 갱신 ${c.updated || ''}`))),
    c.kpis?.length > 0 && h('div', { class: 'grid4' }, c.kpis.map((k) => h('div', { class: 'card kpi' },
      h('div', { class: 'l' }, k.label), h('div', { class: 'v' }, k.value),
      h('div', { class: 'd' }, k.delta && h('span', { class: k.delta.startsWith('-') ? 'neg' : 'pos' }, k.delta), k.note && ` · ${k.note}`)))),
    annual.length > 0 && h('section', { class: 'card' },
      h('h2', null, '연도별 매출·영업이익 ', h('span', { class: 'sub' }, `${annual[0].fy} – ${annual[annual.length - 1].fy}`)),
      h('div', { class: 'legend' }, h('span', null, h('i', { class: 'lg-bar' }), '매출 (억 달러)'), h('span', null, h('i', { class: 'lg-line' }), '영업이익')),
      annualChart(annual),
      h('div', { class: 'tip' }, '막대·점에 마우스를 올리면 수치가 보입니다. ', c.annual_note || ''),
      h('div', { class: 'tbl-wrap annual-tbl' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, '연도'), ['매출', '매출 YoY', '영업이익'].map((t) => h('th', { class: 'num' }, t)))),
        h('tbody', null, annual.map((r, i) => {
          const g = growth(r.revenue, annual[i - 1]?.revenue);
          return h('tr', null,
            h('td', { class: 'mono' }, r.fy),
            h('td', { class: 'num' }, usd(r.revenue)),
            h('td', { class: 'num' }, h('span', { class: g == null ? 'muted' : g >= 0 ? 'dir up' : 'dir down' }, pct(g))),
            h('td', { class: 'num' }, h('span', { class: r.op < 0 ? 'dir down' : '' }, usd(r.op))));
        }).reverse())))),
    h('div', { class: 'grid2' },
      segRows.length > 0 && h('section', { class: 'card' },
        h('h2', null, `${segRows === qsegs ? '분기별' : '연도별'} 사업부 구성 `, h('span', { class: 'sub' }, `${segRows[0].period} 부터`)),
        h('div', { class: 'legend' }, ['IDG', 'ISG', 'SSG'].map((b) => h('span', null, h('i', { class: `sq ${b}` }), b)),
          h('div', { class: 'spacer' }),
          h('div', { class: 'seg' }, [['rev', '매출'], ['op', '영업이익'], ['share', '매출 비중']].map(([m, l]) =>
            h('button', { type: 'button', 'aria-pressed': String(S.segMode === m), onclick: () => { S.segMode = m; render(); } }, l)))),
        segmentChart(segRows, S.segMode),
        h('div', { class: 'tip' }, '단위: 억 달러')),
      fyRow && h('section', { class: 'sec' },
        h('div', { class: 'sec-h' }, h('h2', null, '사업부별 실적'),
          h('div', { class: 'spacer' }),
          h('select', { 'aria-label': '회계연도', onchange: (e) => { S.fy = e.target.value; render(); } },
            fsegs.map((s) => h('option', { value: s.period, selected: s.period === S.fy }, s.period)))),
        h('div', { class: 'tbl-wrap' }, h('table', null,
          h('thead', null, h('tr', null, h('th', null, '사업부'), ['매출', 'YoY', '영업이익', '이익률'].map((t) => h('th', { class: 'num' }, t)))),
          h('tbody', null, ['IDG', 'ISG', 'SSG'].map((b) => {
            const r = fyRow[b] || {};
            const g = growth(r.rev, prevRow?.[b]?.rev);
            return h('tr', null, h('td', null, h('span', { class: `sq ${b}` }), ' ', b),
              h('td', { class: 'num' }, usd(r.rev)),
              h('td', { class: 'num' }, h('span', { class: g == null ? '' : g >= 0 ? 'dir up' : 'dir down' }, pct(g))),
              h('td', { class: 'num' }, usd(r.op)),
              h('td', { class: 'num' }, r.rev && r.op != null ? `${(r.op / r.rev * 100).toFixed(1)}%` : '—'));
          })))),
        h('div', { class: 'tip', style: null }, ' ', c.segment_note || '사업부 영업이익은 레노버가 공시한 사업부 영업이익 기준입니다.'))),
    c.sources?.length > 0 && h('p', { class: 'note' }, '출처: ', c.sources.map((s, i) => [i ? ' · ' : '', ext(s.url, s.label)])),
  );
}

/* ---------- archive ---------- */
async function viewArchive() {
  const dates = S.manifest.days || [];
  const box = h('div', { class: 'main' });
  const results = h('div');
  const input = h('input', { type: 'search', placeholder: '전체 기간 검색 (예: AI 서버, 摩托罗拉, Infinidat)', 'aria-label': '아카이브 검색', value: S.query });
  let timer;
  const runSearch = async () => {
    S.query = input.value.trim();
    if (!S.query) { results.replaceChildren(); return; }
    results.replaceChildren(h('div', { class: 'loading' }, `검색 중… (${dates.length}일치)`));
    const all = await getDays(dates.length);
    const q = S.query.toLowerCase();
    const hits = [];
    all.forEach((d) => d.items.forEach((it) => {
      const hay = [it.title_ko, it.title_orig, it.summary_ko, it.source, ...(it.tags || []), it.memory?.note_ko].join(' ').toLowerCase();
      if (hay.includes(q)) hits.push({ ...it, date: d.date });
    }));
    results.replaceChildren(h('section', { class: 'card' }, h('h2', null, `검색 결과 ${hits.length}건`),
      hits.length ? hits.slice(0, 200).map((it) => h('div', { class: 'hit' },
        h('div', null, h('button', { type: 'button', class: 'link-btn', onclick: () => go(`#today/${it.date}`) }, fmtDate(it.date)), ' ', h('span', { class: `pill ${it.bg}` }, BG[it.bg].name), it.memory && [' ', h('span', { class: 'badge-mem' }, '메모리')]),
        h('h3', null, ext(it.url, it.title_ko)),
        h('p', null, it.summary_ko)))
        : h('div', { class: 'note' }, '일치하는 기사가 없습니다.')));
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(runSearch, 350); });

  const months = new Map();
  dates.forEach((d) => { const m = d.slice(0, 7); if (!months.has(m)) months.set(m, []); months.get(m).push(d); });
  box.append(
    h('div', { class: 'page-head' }, h('div', null, h('div', { class: 'kicker' }, `총 ${dates.length}일`), h('h1', { class: 'page-title' }, '아카이브'))),
    h('label', { class: 'search' },
      h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: '#5A606B', 'stroke-width': 2, 'aria-hidden': 'true' }, h('circle', { cx: 11, cy: 11, r: 7 }), h('path', { d: 'M20 20l-4-4' })),
      input),
    results,
    dates.length ? [...months.entries()].map(([m, ds]) => h('div', { class: 'month' },
      h('h3', null, `${m.slice(0, 4)}년 ${Number(m.slice(5))}월`),
      h('div', { class: 'daygrid' }, ds.map((d) => {
        const ld = loadedDay(d);
        return h('button', { type: 'button', class: 'daycell', onclick: () => go(`#today/${d}`) },
          h('div', null, fmtDate(d).slice(5)), h('div', { class: 'c' }, ld ? `${ld.items.length}건` : ''));
      }))))
      : h('div', { class: 'card empty' }, '아직 쌓인 브리핑이 없습니다.'),
  );
  if (S.query) runSearch();
  return box;
}

// Track resolved promises so the archive grid can show counts for already-decrypted days.
const _set = S.days.set.bind(S.days);
S.days.set = (k, p) => { p.then((v) => { p.done = true; p.value = v; }, () => {}); return _set(k, p); };
