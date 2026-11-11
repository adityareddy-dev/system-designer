// Owner-only reports from local SQLite totals, feedback and filtered Caddy logs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';
import { dayOf } from './observation-store.js';

const args = process.argv.slice(2), mode = ['feedback', 'quotes', 'web'].includes(args[0]) ? args.shift() : 'counts';
const days = Number(args.shift() ?? 7);
const print = s => process.stdout.write(String(s).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ') + '\n');
const section = title => { print(''); print(title); };
const start = new Date(); start.setUTCHours(0, 0, 0, 0); start.setUTCDate(start.getUTCDate() - days + 1);
const since = dayOf(Number.isFinite(start.getTime()) ? start.getTime() : Date.now());
const until = dayOf(Date.now());
const ranked = (title, rows) => { section(title); if (!rows.length) print('None'); for (const r of rows) print(`${r.n}  ${r.label}`); };

async function web() {
  const file = process.env.WEB_LOG_PATH || '/var/log/caddy/systemdesigner-web.log';
  const dir = path.dirname(file), stem = path.basename(file, '.log'), base = path.basename(file);
  const files = fs.readdirSync(dir).filter(f => f === base || f.startsWith(base + '.') || f.startsWith(stem + '-') && /\.log(?:\.gz)?$/.test(f));
  const counts = new Map(), pages = new Map(), refs = new Map(); let broken = 0;
  const add = (map, key) => map.set(key, (map.get(key) || 0) + 1);
  for (const name of files) {
    const stream = fs.createReadStream(path.join(dir, name));
    const input = name.endsWith('.gz') ? stream.pipe(createGunzip()) : stream;
    const lines = createInterface({ input, crlfDelay: Infinity });
    for await (const line of lines) {
      if (!line.trim()) continue;
      let r; try { r = JSON.parse(line); } catch { broken++; continue; }
      if (!Number.isFinite(r.ts)) continue;
      const day = dayOf(r.ts * 1000);
      if (day < since || day > until || r.request?.method !== 'GET') continue;
      let uri; try { uri = new URL(r.request.uri, 'https://systemdesigner.io').pathname; } catch { continue; }
      if (!uri.endsWith('/') && !uri.endsWith('.html') && path.extname(uri)) continue;
      add(counts, day); add(pages, uri);
      const ref = String(r.referrer || '');
      if (/^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/.test(ref)) add(refs, ref); else add(refs, '(direct)');
    }
  }
  const rows = map => [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([label, n]) => ({ label, n }));
  print(`Page requests, ${since} to ${until} (includes bots and reloads)`);
  ranked('Requests per day', rows(counts).sort((a,b) => a.label.localeCompare(b.label)));
  ranked('Top pages', rows(pages).slice(0, 20)); ranked('Top referrers', rows(refs).slice(0, 20));
  if (broken) print(`Skipped ${broken} incomplete log lines.`);
}

function database() {
  const file = process.env.DB_PATH || fileURLToPath(new URL('./data/systemdesigner.db', import.meta.url));
  if (!fs.existsSync(file)) throw new Error('Database not found. Set DB_PATH to the service database.');
  const db = new DatabaseSync(file, { readOnly: true });
  const query = sql => db.prepare(sql).all(since, until);
  try {
    if (mode === 'quotes') {
      const rows = query('SELECT id,day,rating,page,version,comment,helped,"use",country,role,name,title,email,consent_version,consent_text FROM quotes WHERE day BETWEEN ? AND ? ORDER BY day,id');
      for (const row of rows) process.stdout.write(JSON.stringify(row) + '\n');
      return;
    }
    if (mode === 'feedback') {
      section(`Feedback, ${since} to ${until}`);
      const rows = query('SELECT * FROM feedback WHERE day BETWEEN ? AND ? ORDER BY day DESC, rowid DESC');
      if (!rows.length) print('None');
      for (const r of rows) print(`${r.day}  ${r.rating}/5  ${r.page}  v${r.version}  ${r.comment}  helped=${r.helped} use=${r.use} country=${r.country} role=${r.role}`);
      return;
    }
    print(`Anonymous counts, ${since} to ${until} (UTC)`);
    const visitors = new Map(query('SELECT * FROM visitor_counts WHERE day BETWEEN ? AND ?').map(r => [r.day, r.count]));
    section('Visitors per day (estimated)');
    for (let i = 0; i < days; i++) { const d = dayOf(start.getTime() + i * 86400000); print(`${d}  ${visitors.get(d) || 0}`); }
    section('Events per day');
    const events = query('SELECT day,name,sum(count) AS n FROM event_counts WHERE day BETWEEN ? AND ? GROUP BY day,name ORDER BY day,name');
    if (!events.length) print('None');
    for (const r of events) print(`${r.day}  ${r.name}  ${r.n}`);
    const totals = Object.create(null); for (const r of events) totals[r.name] = (totals[r.name] || 0) + r.n;
    section('Funnel (page-view milestones, not linked people)');
    for (const name of ['app_opened', 'intro_finished', 'first_problem_started', 'first_problem_passed']) print(`${name}  ${totals[name] || 0}`);
    const top = where => query(`SELECT id AS label,sum(count) AS n FROM event_counts WHERE day BETWEEN ? AND ? AND ${where} GROUP BY id ORDER BY n DESC,id LIMIT 20`);
    ranked('Top problems (passed days)', top("name='problem_passed'"));
    ranked('Top lessons (finished)', top("name='lesson_finished'"));
    ranked('Top referrers', query("SELECT CASE WHEN referrer='' THEN '(direct)' ELSE referrer END AS label,sum(count) AS n FROM event_counts WHERE day BETWEEN ? AND ? AND name='app_opened' GROUP BY referrer ORDER BY n DESC LIMIT 20"));
    ranked('Errors', query("SELECT error_name || ': ' || message || ' (' || file || ')' AS label,sum(count) AS n FROM event_counts WHERE day BETWEEN ? AND ? AND name='error' GROUP BY error_name,message,file ORDER BY n DESC LIMIT 30"));
  } finally { db.close(); }
}

try {
  if (args.length || !Number.isInteger(days) || days < 1 || days > 731) throw new Error('Usage: node api/stats.js [feedback|quotes|web] [days from 1 to 731]');
  if (mode === 'web') await web(); else database();
} catch (e) { process.stderr.write(`stats: ${e.message}\n`); process.exitCode = 1; }
