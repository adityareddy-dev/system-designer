// Also writes p/<problem>/ for each Practice problem. Writes a small static page for each date of the daily challenge into d/<date>/index.html, with its own preview tags and
// a preview image, so a pasted link shows that day's scenario. The design of a "beat my design" link stays in the
// fragment (d/<date>/#/beat/<payload>); the page's script forwards it to the app.
// Run from the app folder: node tools/gen-daily-pages.mjs [--from YYYY-MM-DD] [--days 120] [--no-images]
// Images need puppeteer-core and Chrome (CHROME=/usr/bin/google-chrome by default).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] ?? true); };
const SITE = process.env.SITE || 'https://systemdesigner.io';
const root = process.cwd();
const imp = (f) => import(pathToFileURL(path.resolve(root, f)).href);
// The same list the app loads: the generated lite list when it exists (run tools/gen-content.mjs first), else the modules.
let problems;
try { problems = JSON.parse(fs.readFileSync(path.resolve(root, 'content/data/lite.json'), 'utf8')).problems; } catch { problems = null; }
if (!problems) ({ problems } = await imp('content/problems/index.js'));
const { dailyFor, addDays, todayLocal } = await imp('compete/daily.js');

const from = arg('from', addDays(todayLocal(), -3));
const days = Number(arg('days', 120));
const images = !process.argv.includes('--no-images');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pretty = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }); };

const rows = [];
for (let i = 0; i < days; i++) {
  const date = addDays(from, i);
  const d = dailyFor(date, problems);
  const p = problems.find((x) => x.id === d.problemId);
  if (p) rows.push({ kind: 'daily', date, title: p.title, like: p.like || '', difficulty: p.difficulty || '' });
}
// One preview page per Practice problem, so a shared Practice design shows that problem and not the generic site card.
const practiceRows = problems.map((p) => ({ kind: 'practice', id: p.id, title: p.title, like: p.like || '', difficulty: p.difficulty || '' }));

function page(r) {
  const pr = r.kind === 'practice';
  const url = pr ? `${SITE}/p/${r.id}/` : `${SITE}/d/${r.date}/`;
  const short = pr ? `${r.title}: system design practice` : `${r.title}: daily challenge, ${pretty(r.date)}`;
  const desc = pr
    ? `Practice ${r.title} as a system design problem: build it, survive a fast-forward traffic day, and see if you can beat a friend's score. Free, no sign-up.`
    : `Everyone gets the same system design scenario on ${pretty(r.date)}: ${r.title}. Build it, survive the traffic day, and see if you can beat a friend's score. Free, no sign-up.`;
  const goHash = pr ? `#/practice/${r.id}` : `#/challenge/${r.date}`;
  const img = `${url}preview.jpg`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(short)} | System Designer</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<link rel="icon" href="../../assets/favicon.svg" type="image/svg+xml">
<meta property="og:title" content="${esc(short)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="System Designer">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${img}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(pr ? `System Designer practice problem: ${r.title}` : `System Designer daily challenge for ${pretty(r.date)}: ${r.title}`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(short)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${img}">
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-content: center; gap: 12px; padding: 24px; text-align: center; font: 500 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; background: #f3f5fa; color: #1b2433; }
  a { color: #3a5bd9; font-weight: 600; }
  @media (prefers-color-scheme: dark) { body { background: #0e1422; color: #e6ebf5; } a { color: #8fa8ff; } }
</style>
</head>
<body>
<h1>${esc(r.title)}</h1>
<p>${pr ? 'Practice problem.' : `Daily challenge, ${esc(pretty(r.date))}.`}</p>
<p><a id="go" href="../../${goHash}">${pr ? 'Open the problem' : 'Open the challenge'}</a></p>
<noscript><p>This page needs JavaScript to open the game.</p></noscript>
<script>
// A "beat my design" link keeps the design in the fragment: forward it to the app as it is.
(function () {
  var h = location.hash || '';
  var app = new URL('../../', location.href).href;
  var to = h.indexOf('#/beat/') === 0 ? h : '${goHash}';
  document.getElementById('go').href = app + to;
  location.replace(app + to);
})();
</script>
</body>
</html>
`;
}

function previewHtml(r) {
  const pr = r.kind === 'practice';
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;font-family:"Inter","Segoe UI","DejaVu Sans",system-ui,sans-serif;color:#eef2fb;background:radial-gradient(900px 500px at 85% 0%,#34469c 0%,rgba(52,70,156,0) 60%),linear-gradient(160deg,#10172b,#0b1020);position:relative}
.mark{position:absolute;left:72px;top:64px;display:flex;align-items:center;gap:14px;font-weight:700;font-size:26px;letter-spacing:.2px}
.mark i{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#6f8cff,#41d1c0)}
.kick{position:absolute;left:72px;top:190px;font-size:24px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#9db0ff}
h1{position:absolute;left:72px;top:236px;width:1056px;font-size:80px;line-height:1.06;font-weight:800;letter-spacing:-1.5px}
.meta{position:absolute;left:72px;bottom:140px;font-size:30px;color:#b8c3de}
.foot{position:absolute;left:72px;right:72px;bottom:52px;display:flex;justify-content:space-between;align-items:center;font-size:28px;font-weight:600}
.pill{padding:12px 26px;border-radius:999px;background:#6f8cff;color:#0b1020;font-weight:700}
.dots{position:absolute;right:72px;top:70px;display:flex;gap:10px}.dots b{width:14px;height:14px;border-radius:50%;background:#41d1c0}.dots b:nth-child(2){background:#6f8cff}.dots b:nth-child(3){background:#f3b94d}
</style></head><body>
<div class="mark"><i></i>System Designer</div><div class="dots"><b></b><b></b><b></b></div>
<div class="kick">${pr ? 'Practice problem' : `Daily challenge · ${esc(pretty(r.date))}`}</div>
<h1>${esc(r.title)}</h1>
<div class="meta">${esc([r.difficulty, r.like].filter(Boolean).join('  ·  '))}</div>
<div class="foot"><span>Build it. Survive the day. Beat my design.</span><span class="pill">Free, no sign-up</span></div>
</body></html>`;
}

const dirOf = (r) => path.join(root, r.kind === 'practice' ? 'p' : 'd', r.kind === 'practice' ? r.id : r.date);
// A preview image is drawn again only when its page changed or it is missing, so a changed title never keeps an old picture.
const redraw = [];
for (const r of [...rows, ...practiceRows]) {
  const dir = dirOf(r);
  fs.mkdirSync(dir, { recursive: true });
  const html = page(r);
  let old = null; try { old = fs.readFileSync(path.join(dir, 'index.html'), 'utf8'); } catch { /* new page */ }
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  if (old !== html || !fs.existsSync(path.join(dir, 'preview.jpg'))) redraw.push(r);
}

if (images) {
  const pp = (await import(process.env.PUPPETEER_CORE ? pathToFileURL(process.env.PUPPETEER_CORE).href : 'puppeteer-core')).default;
  const browser = await pp.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  try {
    const pg = await browser.newPage();
    await pg.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
    for (const r of redraw) {
      await pg.setContent(previewHtml(r), { waitUntil: 'load' });
      await pg.screenshot({ path: path.join(dirOf(r), 'preview.jpg'), type: 'jpeg', quality: 84 });
    }
  } finally { await browser.close(); }
}
console.log(`${rows.length} daily pages from ${rows[0]?.date} to ${rows.at(-1)?.date} and ${practiceRows.length} practice pages; ${images ? redraw.length + ' preview images drawn' : 'no images'}`);
