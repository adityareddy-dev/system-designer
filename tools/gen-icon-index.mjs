// Writes assets/icons/index.json and checks coverage. Run from the app folder: node tools/gen-icon-index.mjs
import fs from 'node:fs';
const J = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const el = J('catalog/elements.json'), rq = J('catalog/requests.json'), ev = J('catalog/events.json');
const sets = [
  ['el', 'element', 'assets/icons', el.elements],
  ['cat', 'category', 'assets/categories', el.categories],
  ['ev', 'event', 'assets/events', ev.events],
  ['req', 'request-shape', 'assets/requests', rq.types],
];
const icons = [], problems = [];
const check = (file, id) => {
  if (!fs.existsSync(file)) { problems.push('missing ' + file); return false; }
  const s = fs.readFileSync(file, 'utf8');
  if (!/viewBox="0 0 24 24"/.test(s)) problems.push('viewBox ' + file);
  if (/#[0-9a-fA-F]{3,6}\b/.test(s)) problems.push('hardcoded colour ' + file);
  if (/<text/.test(s)) problems.push('text in ' + file);
  return true;
};
for (const [ns, group, dir, list] of sets) {
  const ids = new Set(list.map(x => x.id));
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4));
  for (const f of files) if (!ids.has(f)) problems.push(`orphan ${dir}/${f}.svg`);
  for (const x of list) { const file = `${dir}/${x.id}.svg`; if (check(file, x.id)) icons.push({ id: `${ns}.${x.id}`, group, file, name: x.name }); }
}
const contract = fs.readFileSync('CONTRACT.md', 'utf8').match(/Fixed `ui.` names: ([^\n]+)/)[1].replace(/\.\s*$/, '').split(', ').map(s => s.trim().replace(/\.$/, ''));
for (const n of contract) { const file = `assets/ui/${n}.svg`; if (check(file, n)) icons.push({ id: `ui.${n}`, group: 'ui', file, name: n.replace(/-/g, ' ') }); }
const counts = {}; for (const i of icons) counts[i.group] = (counts[i.group] || 0) + 1;
fs.writeFileSync('assets/icons/index.json', JSON.stringify({ version: 1, updated: '2026-11-02', viewBox: '0 0 24 24', style: 'stroke currentColor 1.75, round caps and joins, duotone fill currentColor at .18, no text, own artwork', total: icons.length, counts, icons }, null, 1) + '\n');
console.log(JSON.stringify({ total: icons.length, counts, problems }));
