// Run by the "Send daily mail" workflow. Decrypts the newest day in memory only and
// mails a summary. Never prints decrypted content to the log (the repo is public).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { openPrivate, decryptJson } from './lib/crypto.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { SITE_PASSWORD, GMAIL_USER, GMAIL_APP_PASSWORD, MAIL_TO } = process.env;
for (const [k, v] of Object.entries({ SITE_PASSWORD, GMAIL_USER, GMAIL_APP_PASSWORD, MAIL_TO })) {
  if (!v) { console.log(`Secret ${k} is not set; skipping mail.`); process.exit(0); }
}

const manifest = JSON.parse(await readFile(path.join(root, 'data/manifest.json'), 'utf8'));
const date = process.env.MAIL_DATE || manifest.days[0];
const priv = await openPrivate(JSON.parse(await readFile(path.join(root, 'data/keys/private.json'), 'utf8')), SITE_PASSWORD);
const day = await decryptJson(JSON.parse(await readFile(path.join(root, `data/days/${date}.enc.json`), 'utf8')), priv);

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = (u) => (/^https?:\/\//.test(u) ? u : '#');
const BG = { ISG: ['ISG', '인프라 솔루션', '#E07A1F'], IDG: ['IDG', '인텔리전트 디바이스', '#1F4FD1'], SSG: ['SSG', '솔루션·서비스', '#0E7C6B'], GROUP: ['그룹 전반', '실적·경영·전략', '#6B7180'] };
const LANG = { zh: '中', en: 'EN', ko: 'KR' };
const site = 'https://dailylenkr.github.io/';

const sections = Object.keys(BG).map((bg) => {
  const items = day.items.filter((i) => i.bg === bg).sort((a, b) => b.importance - a.importance);
  if (!items.length) return '';
  const [name, sub, color] = BG[bg];
  return `<h2 style="font-size:16px;margin:28px 0 8px;border-left:4px solid ${color};padding-left:8px">${name} <span style="font-weight:400;color:#5A606B;font-size:13px">${sub}</span></h2>` +
    items.map((it) => `
<div style="padding:12px 0;border-bottom:1px solid #EEF0F2">
  ${it.memory ? `<span style="font-size:11px;font-weight:700;color:#4A1F8C;background:#F1EBFA;padding:1px 6px;border-radius:3px">메모리</span> ` : ''}
  <a href="${esc(safeUrl(it.url))}" style="font-size:15px;font-weight:600;color:#15171A;text-decoration:none">${esc(it.title_ko)}</a>
  ${it.lang !== 'ko' ? `<div style="font-size:12px;color:#6B7180;margin-top:2px">${esc(it.title_orig)}</div>` : ''}
  <div style="font-size:14px;line-height:1.6;color:#3A3F48;margin-top:4px">${esc(it.summary_ko)}</div>
  ${it.memory ? `<div style="font-size:13px;color:#4A1F8C;margin-top:4px">메모리 관점: ${esc(it.memory.note_ko)}</div>` : ''}
  <div style="font-size:12px;color:#6B7180;margin-top:4px">${esc(it.source)} · ${LANG[it.lang] || ''}</div>
</div>`).join('');
}).join('');

const html = `<div style="font-family:-apple-system,'Segoe UI','Malgun Gothic','Apple SD Gothic Neo',sans-serif;max-width:640px;margin:0 auto;color:#15171A">
<div style="font-size:12px;color:#B3122B;font-family:Consolas,monospace">${esc(date)}</div>
<h1 style="font-size:22px;margin:4px 0 16px">데일리 레노버</h1>
${day.headline3?.length ? `<div style="background:#15171A;color:#fff;border-radius:8px;padding:16px 18px"><div style="font-size:11px;color:#F2A0AC;font-weight:700;margin-bottom:6px">오늘의 핵심</div><ol style="margin:0;padding-left:18px;line-height:1.6;font-size:14px">${day.headline3.map((h) => `<li>${esc(h)}</li>`).join('')}</ol></div>` : ''}
${day.items.length ? sections : '<p style="color:#5A606B">오늘은 새로 수집된 주요 소식이 없습니다.</p>'}
<p style="margin-top:28px;font-size:13px"><a href="${site}" style="color:#B3122B">사이트에서 보기 →</a></p>
<p style="font-size:11px;color:#8A909A">공개 뉴스·공시 기반 개인 요약 · 레노버와 무관합니다</p>
</div>`;

const transport = nodemailer.createTransport({ service: 'gmail', auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD } });
await transport.sendMail({
  from: `"데일리 레노버" <${GMAIL_USER}>`,
  to: MAIL_TO,
  subject: `[데일리 레노버] ${date} · ${day.items.length}건`,
  html,
});
console.log('Mail sent.');
