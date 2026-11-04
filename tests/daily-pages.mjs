// Every static preview page must name the problem the game plays: d/<date>/ against dailyFor(date), p/<id>/ against the
// problem list. Run from the app folder: node tests/daily-pages.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const { dailyFor } = await import(pathToFileURL(path.join(root, 'compete/daily.js')).href);
const { problems } = JSON.parse(fs.readFileSync(path.join(root, 'content/data/lite.json'), 'utf8'));
const byId = new Map(problems.map((p) => [p.id, p]));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let bad = 0, n = 0;
const fail = (m) => { bad++; console.log('FAIL', m); };

const dDir = path.join(root, 'd');
for (const date of fs.readdirSync(dDir).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) {
  n++;
  const html = fs.readFileSync(path.join(dDir, date, 'index.html'), 'utf8');
  const want = byId.get(dailyFor(date, problems).problemId);
  if (!want) { fail(`${date}: no problem for this date`); continue; }
  if (!html.includes(`<title>${esc(want.title)}: daily challenge,`)) fail(`${date}: page does not name ${want.title}`);
  if (!fs.existsSync(path.join(dDir, date, 'preview.jpg'))) fail(`${date}: no preview.jpg`);
}
for (const p of problems) {
  n++;
  const f = path.join(root, 'p', p.id, 'index.html');
  if (!fs.existsSync(f)) { fail(`p/${p.id}: missing page`); continue; }
  if (!fs.readFileSync(f, 'utf8').includes(`<title>${esc(p.title)}: system design practice`)) fail(`p/${p.id}: page does not name ${p.title}`);
  if (!fs.existsSync(path.join(root, 'p', p.id, 'preview.jpg'))) fail(`p/${p.id}: no preview.jpg`);
}
console.log(bad ? `${bad} of ${n} preview pages wrong` : `all ${n} preview pages match the game`);
process.exit(bad ? 1 : 0);
