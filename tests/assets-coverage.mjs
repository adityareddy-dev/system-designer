// Asset gate: every element, category, event, request shape, node shape and interface icon the game uses exists.
// Run from the app folder: node tests/assets-coverage.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const app = process.argv[2] || '.';
const J = (f) => JSON.parse(fs.readFileSync(path.join(app, f), 'utf8'));
const imp = (f) => import(pathToFileURL(path.resolve(app, f)).href);
const { ICONS } = await imp('assets/icons/data.js');
const { SHAPES, NODE_SHAPES, shapeSvg, STATUS_GLYPHS } = await imp('assets/shapes.js');
const { icon, iconInner, ICON_IDS } = await imp('assets/icons/index.js');
const { getPalette } = await imp('assets/palette.js');

const el = J('catalog/elements.json'), rq = J('catalog/requests.json'), ev = J('catalog/events.json');
const missing = [];
const need = (id) => { if (!ICONS[id]) missing.push(id); };
el.elements.forEach((e) => need('el.' + e.id));
el.categories.forEach((c) => need('cat.' + c.id));
ev.events.forEach((e) => need('ev.' + e.id));
rq.types.forEach((t) => {
  need('req.' + t.id);
  if (!SHAPES[t.shape]) missing.push('shape ' + t.shape);
  if (!/<svg[\s\S]+<\/svg>/.test(shapeSvg(t.shape))) missing.push('shapeSvg ' + t.shape);
});
el.categories.forEach((c) => { if (!NODE_SHAPES[c.nodeShape]) missing.push('nodeShape ' + c.nodeShape); });
['ok', 'warn', 'hot', 'overload', 'down'].forEach((s) => { if (!STATUS_GLYPHS[s]) missing.push('status ' + s); });

const contract = fs.readFileSync(path.join(app, 'CONTRACT.md'), 'utf8').match(/Fixed `ui.` names: ([^\n]+)/)[1].replace(/\.\s*$/, '').split(', ').map((s) => s.trim());
contract.forEach((n) => need('ui.' + n));

// Every literal icon id in the code must exist (dynamic ids are covered by the catalog checks above).
const used = new Set();
const walk = (d) => {
  for (const f of fs.readdirSync(path.join(app, d), { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p);
    else if (f.name.endsWith('.js')) for (const m of fs.readFileSync(path.join(app, p), 'utf8').matchAll(/['"`]((?:ui|el|cat|ev|req)\.[a-z0-9-]*[a-z0-9])['"`]/g)) used.add(m[1]);
  }
};
['ui', 'compete', 'render', 'content'].forEach(walk);
const SOUNDS = new Set(['ui.tap']);
for (const id of used) if (!SOUNDS.has(id) && !ICONS[id]) missing.push('used ' + id);

// Lesson read steps name icons too.
for (const f of fs.readdirSync(path.join(app, 'content/lessons')).filter((x) => x.endsWith('.js') && x !== 'index.js')) {
  const l = (await imp('content/lessons/' + f)).default;
  for (const s of l.steps || []) if (s.icon && !ICONS[s.icon]) missing.push(`lesson ${l.id} icon ${s.icon}`);
}

const svg = icon('el.cache', { size: 24, title: 'Cache' });
const ok1 = svg.startsWith('<svg') && svg.includes('<title>Cache</title>') && iconInner('el.cache').startsWith('<g ');
const pal = ['light', 'dark'].map(getPalette);
const ok2 = pal.every((p) => typeof p.hex.canvas === 'number' && Object.keys(p.hex.cat).length === 9 && Object.keys(p.hex.req).length === 8);

const out = {
  icons: ICON_IDS.length,
  elements: el.elements.length, categories: el.categories.length, events: ev.events.length, requestShapes: rq.types.length,
  uiContract: contract.length, usedLiteralIds: used.size, missing, iconApi: ok1, palette: ok2,
};
console.log(JSON.stringify(out, null, 1));
process.exit(missing.length || !ok1 || !ok2 ? 1 : 0);
