# 데일리 레노버 (dailylenkr.github.io)

Encrypted static site + daily mail summarising Lenovo news by business group, with a memory-semiconductor angle.
The owner reads it from a corporate network, so the security rules below are hard requirements.

## Hard rules

1. **Public information only.** Use only published news, press releases, exchange filings, earnings materials and public research press releases. Never add, infer or ask for non-public information.
2. **Never commit plain text.** Write the day's plain JSON only under `/tmp/dailylenkr/` (outside the repo) and publish it with `scripts/publish-day.mjs`, which encrypts it. Before committing, `git status` must show only `data/days/*.enc.json`, `data/manifest.json`, `data/seen.json` (and code you deliberately changed). Never print decrypted content in GitHub Actions logs.
3. **The site makes zero external requests.** No CDNs, web fonts, analytics, images from other hosts, iframes or inline scripts. Keep the CSP in `index.html`. Links to sources open only on click, with `rel="noopener noreferrer"` and `referrerpolicy="no-referrer"`. No cookies, localStorage, sessionStorage, IndexedDB or service workers.
4. Do not change the key files (`data/keys/*`) except through the "Set up or change password" workflow.

## Daily procedure (run by the scheduled task, weekdays ~06:20 KST)

1. `cd` into the repo, `git pull --ff-only`. Today = current date in Asia/Seoul (`TZ=Asia/Seoul date +%F`).
2. **Collect** news with WebSearch / WebFetch from roughly the last 24–30 hours — **on Mondays, from Friday morning to now (about 72 hours) so the weekend is covered** in Monday's single briefing. Search in English, Chinese and Korean. Suggested queries (adapt as needed):
   - EN: `Lenovo`, `Lenovo Group earnings`, `Lenovo ISG AI server`, `Lenovo Infrastructure Solutions`, `Lenovo PC shipments`, `Motorola smartphone Lenovo`, `Lenovo memory prices`, `Yang Yuanqing`
   - ZH: `联想集团`, `联想 服务器`, `联想 AI服务器`, `联想 存储`, `联想 内存 涨价`, `杨元庆`, `摩托罗拉 联想`, `联想 PC 出货`
     (Do not search `联想` alone: it is also an ordinary word meaning "to associate".)
   - KO: `레노버`, `레노버 서버`, `레노버 메모리`
   - **Outlet-targeted searches (run every day, in addition to the general ones)** — use WebSearch `allowed_domains`:
     1. Global majors: `Lenovo` with `["bloomberg.com","cnbc.com","scmp.com","asia.nikkei.com","ft.com"]`
     2. Chinese business press: `联想集团` with `["stcn.com","21jingji.com","jiemian.com","yicai.com","caixin.com","36kr.com","cls.cn"]`
     3. Research firms: `Lenovo` with `["idc.com","gartner.com","counterpointresearch.com","trendforce.com","omdia.tech.informa.com","canalys.com"]`
     4. Korean/trade press: `레노버` with `["etnews.com","thelec.kr","digitimes.com","jiwei.com","yna.co.kr"]`
     5. Official: `Lenovo` with `["news.lenovo.com","investor.lenovo.com","motorola.com","businesswire.com","prnewswire.com"]`
     Known limits in this environment: **reuters.com cannot be searched or fetched** — include Reuters stories only via another outlet that cites them ("로이터에 따르면 …", url = the citing article). **cls.cn (财联社) pages do not render** — use 财联社 only if the same story is readable elsewhere (use that article as `url`; mention 财联社 in the summary if it broke the news). If a domain filter is rejected, retry that group without the failing domain.
   - Official pages to check directly: Lenovo StoryHub / news.lenovo.com, investor.lenovo.com (results and announcements list: `https://investor.lenovo.com/en/publications/announcements.php` and results `https://investor.lenovo.com/en/financial/results.php`), Motorola newsroom. HKEXnews (stock code 992) PDFs often fail to load here — check the same filing on investor.lenovo.com or the mirror `doc.irasia.com/listco/hk/lenovo/` and link whichever page actually opened.
3. **Source tiers** (`tier` field) — prefer higher tiers; when several outlets report the same story keep ONE item, use the best source as `url`/`source` and list the others in `also`:
   - 1 official: HKEX filings, Lenovo IR, Lenovo/Motorola newsroom, Business Wire/PR Newswire releases by Lenovo
   - 2 major media: Reuters, Bloomberg, Nikkei Asia, SCMP, CNBC, FT; 财联社, 第一财经, 21世纪经济报道, 界面新闻, 证券时报, 财新, 36氪; 연합뉴스
   - 3 research firms: IDC, Gartner, Counterpoint, Omdia/Canalys, TrendForce (press releases)
   - 4 trade press: DigiTimes, 集微网, 디일렉, 전자신문, StorageNewsletter, ServeTheHome, The Register
   Paywalled sources (Bloomberg, FT, 财新): use only the headline and the publicly visible lead.
4. **Filter out**: deal/coupon/discount posts, product reviews, buying guides, gaming accessory chatter, rumours without a named source, stock-price-move-only posts with no news. Consumer and gaming products are included **only for official new-product launches**. Keep items genuinely about Lenovo (or directly about Lenovo's market: PC/server/smartphone shipments, memory supply affecting Lenovo).
5. **Dedupe against earlier days**: put candidate URLs in `/tmp/dailylenkr/urls.txt` and run `node scripts/check-seen.mjs /tmp/dailylenkr/urls.txt`; only summarise the URLs it prints. (publish-day also drops repeats automatically.)
6. **Write** `/tmp/dailylenkr/<date>.json` following the schema below. All summaries in Korean, factual, 2–3 sentences, no speculation beyond what sources say.
   **Consistency rules (accuracy matters more than coverage):**
   - `url`, `source` and `title_orig` must all belong to the **same article**. `title_orig` = that article's headline copied exactly as published (open the page to confirm it; don't use a search-result or URL-slug title).
   - `title_ko` = a **faithful Korean translation of `title_orig`** — same facts, same numbers, no extra facts. Do not write a new headline that summarises several articles.
   - Facts from other outlets (`also`) may go into `summary_ko` only with attribution (e.g. "로이터에 따르면 …").
   - Every number in `title_ko`, `summary_ko`, `headline3`, `memory.note_ko` and `memory_signals` must appear in a source you opened. Keep units and periods exactly (분기/연간, YoY/QoQ, 달러/홍콩달러). If sources disagree, use the higher-tier source and say "…보도" rather than stating it as fact.
   - Chinese → Korean: translate company/product names consistently (联想集团 = 레노버그룹/레노버, 摩托罗拉 = 모토로라, 杨元庆 = 양위안칭). Don't translate an estimate or forecast (料, 预计, 有望, expected) as a confirmed fact.
6a. **Verify before publishing**: re-open each item's `url` and check, one by one, that `title_orig` matches the page headline, `title_ko` translates it faithfully, and each number in the item matches the page (or the attributed `also` page). Fix or drop any item that fails.
7. **Classify** each item's `bg`: `ISG` (servers, storage, data centre, liquid cooling, AI infrastructure, Infinidat), `IDG` (PCs, tablets, smartphones/Motorola, AI PCs, smart devices), `SSG` (services, solutions, managed services, TruScale, consulting), `GROUP` (group results, leadership, strategy, M&A at group level, ESG, listings, lawsuits).
8. **Importance**: 3 = filings/results, major M&A or contracts, leadership changes; 2 = strategy, partnerships, market share data, notable launches; 1 = other relevant news. Sort is done by the site.
9. **Memory angle** (`memory` field, else `null`): set it when the story bears on DRAM/HBM/NAND/SSD demand or cost — AI server orders or shipments, PC/phone shipment outlook, storage business, price increases blamed on memory, memory supply comments. `products` from: `server_dram, hbm, enterprise_ssd, pc_dram, lpddr, client_ssd, dram_general, nand_general`. `impact` from: `demand_up, demand_down, cost_up, cost_down, neutral`. `note_ko`: one sentence explaining the memory implication, reasoning only from the public story.
10. `memory_signals`: overall read of the day (and recent context in the sources) for `server` and `pc` demand (`up/down/flat/none`) and `cost` (`cost_up/cost_down/flat/none`), each with a one-line `note_ko` citing the concrete public fact (number, source). Use `none` with an empty-ish note when there is no signal.
11. `statements`: public remarks by Lenovo executives about memory cost/supply/pricing or memory content in AI servers/PCs (earnings calls, interviews), each with `period` (e.g. `FY26/27 1Q` or `2026-10`), `text_ko`, `source`, `url`.
12. `headline3`: the three most important one-line Korean takeaways of the day (fewer if the day is thin; empty array if nothing).
13. **Publish**: `node scripts/publish-day.mjs /tmp/dailylenkr/<date>.json`. Fix any validation errors it reports and re-run.
14. **Commit & push**: `git add data/days data/manifest.json data/seen.json && git commit -m "Briefing <date>" && git push`. The push triggers the mail workflow. If there was genuinely no news, still publish a day with `items: []` and signals `none` so the mail says so.
15. Delete `/tmp/dailylenkr/`.

## Day JSON schema

```json
{
  "date": "2026-10-17",
  "headline3": ["…", "…", "…"],
  "items": [
    {
      "id": "2026-10-17-01",
      "bg": "ISG",
      "title_ko": "한국어 제목",
      "title_orig": "原文标题 / original headline",
      "lang": "zh",
      "summary_ko": "2~3문장 한국어 요약",
      "source": "财联社",
      "tier": 2,
      "url": "https://…",
      "published": "2026-10-17T01:12:00Z",
      "importance": 3,
      "tags": ["AI 서버", "실적"],
      "also": [{ "source": "Reuters", "url": "https://…" }],
      "memory": { "products": ["server_dram", "hbm"], "impact": "demand_up", "note_ko": "…" }
    }
  ],
  "memory_signals": {
    "server": { "dir": "up", "note_ko": "…" },
    "pc": { "dir": "flat", "note_ko": "…" },
    "cost": { "dir": "cost_up", "note_ko": "…" }
  },
  "statements": [{ "period": "FY26/27 1Q", "text_ko": "…", "source": "Lenovo IR", "url": "https://…" }]
}
```
Tags: short Korean keywords, reuse common ones: `AI 서버`, `AI PC`, `스토리지`, `모토로라`, `실적`, `M&A`, `중국`, `가격`, `출하량`, `파트너십`, `경영진`, `신제품`, `데이터센터`, `액체냉각`, `서비스`.

## Company data (기업 현황)

Source of truth: `company/financials.json` (Lenovo's own published IR figures only — no analysis, nothing about the owner, so it is kept unencrypted to stay editable). The page loads only the encrypted copy `data/company.enc.json`, produced by `node scripts/publish-company.mjs` (no argument = reads `company/financials.json`).
Values in **USD millions**. Shape: `{ updated, latest_period, kpis:[{label,value,delta,note}], annual:[{fy, revenue, op}], annual_note, segments:[{period, type:"Q"|"FY", IDG:{rev,op}, ISG:{rev,op}, SSG:{rev,op}}], segment_note, sources:[{label,url}] }`. Business-group split exists from FY21/22 (three-group structure).
**When the daily run finds a new quarterly results announcement** (Lenovo FY is April–March; results ~late May, mid Aug, mid Nov, late Feb): add the quarter (and full year in May) to `company/financials.json` from the official results press release, update `kpis`/`latest_period`/`updated`, run `node scripts/publish-company.mjs`, and commit both files with the day's briefing.

## Layout

- `index.html`, `assets/` — the site (vanilla JS, no dependencies).
- `assets/crypto.js` — browser decryption; private key kept only in memory.
- `scripts/` — Node 20 scripts (WebCrypto). `lib/crypto.mjs` has the scheme.
- `.github/workflows/setup-keys.yml` — creates keys / changes password from the `SITE_PASSWORD` (+ `SITE_PASSWORD_OLD`) secrets.
- `.github/workflows/send-mail.yml` — on manifest change, decrypts newest day in memory and mails it (secrets `SITE_PASSWORD`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_TO`).
