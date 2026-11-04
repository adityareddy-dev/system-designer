// Every editorial reference applies cleanly: no setting on a part that lacks it, no parts on top of each other,
// and no validation warning once loaded. Run from the app folder: node tests/content-refs.mjs [problemId ...]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const imp = (f) => import(pathToFileURL(path.resolve(f)).href);
const { createCatalog } = await imp('sim/catalog.js');
const { createSim } = await imp('sim/engine.js');
const { problems } = await imp('content/problems/index.js');
const catalog = createCatalog({ elements: J('catalog/elements.json'), requests: J('catalog/requests.json'), events: J('catalog/events.json'), world: J('catalog/world.json') });
const GAP_X = 132, GAP_Y = 112; // the same spacing the board enforces when a part is dropped
const only = new Set(process.argv.slice(2));
const bad = [];
let checked = 0;
for (const p of problems) {
  if (only.size && !only.has(p.id)) continue;
  (p.editorial?.designs || []).forEach((d, di) => {
    checked++;
    const tag = `${p.id} design ${di + 1}`;
    const ns = d.graph.nodes;
    for (const n of ns) {
      const el = catalog.elementById.get(n.type);
      if (!el) { bad.push(`${tag}: unknown part ${n.type}`); continue; }
      for (const k of ['zones', 'tier', 'region']) if (n[k] != null && n[k] !== (k === 'zones' ? 1 : n[k]) && !(el.knobs || []).includes(k) && k === 'zones') bad.push(`${tag}: ${n.ref} (${el.name}) has no zones setting`);
      for (const k of Object.keys(n.knobs || {})) if (!(el.knobs || []).includes(k)) bad.push(`${tag}: ${n.ref} (${el.name}) has no "${k}" setting`);
    }
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
      if (Math.abs(ns[i].x - ns[j].x) < GAP_X && Math.abs(ns[i].y - ns[j].y) < GAP_Y) bad.push(`${tag}: ${ns[i].ref} and ${ns[j].ref} overlap`);
    }
    const sim = createSim({ catalog, problem: p, seed: 'practice', mode: 'practice' });
    sim.loadGraph({
      nodes: ns.map((n) => ({ id: n.ref, type: n.type, x: n.x, y: n.y, units: n.units, zones: n.zones ?? 1, region: n.region ?? 'problem', tier: n.tier ?? 'M', knobs: n.knobs || {} })),
      edges: d.graph.edges.map(([a, b]) => ({ id: `${a}>${b}`, from: a, to: b, kind: 'flow' })),
    });
    for (const i of sim.validate()) bad.push(`${tag}: ${i.message}`);
  });
}
console.log(`checked ${checked} reference designs`);
if (bad.length) { console.log(bad.join('\n')); process.exit(1); }
console.log('ok');
