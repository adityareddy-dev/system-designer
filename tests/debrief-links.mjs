// Debrief checks: the passing reference design credits what helped for every event it was built to survive,
// and the "Learn this" link follows the same cause as the headline. Run from the app folder: node tests/debrief-links.mjs [problemId ...]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const imp = (f) => import(pathToFileURL(path.resolve(f)).href);
const { createCatalog } = await imp('sim/catalog.js');
const { createSim } = await imp('sim/engine.js');
const { problems } = await imp('content/problems/index.js');
const { lessons } = await imp('content/lessons/index.js');
const { missedConcepts } = await imp('ui/play/debrief.js').catch(() => ({}));
const catalog = createCatalog({ elements: J('catalog/elements.json'), requests: J('catalog/requests.json'), events: J('catalog/events.json'), world: J('catalog/world.json') });
const only = new Set(process.argv.slice(2));
const bad = [];
let checked = 0;
const play = (p, graph) => {
  const sim = createSim({ catalog, problem: p, seed: 'practice', mode: 'practice' });
  sim.loadGraph(graph); sim.start(); sim.advance(86400000);
  return sim.result();
};
for (const p of problems) {
  if (only.size && !only.has(p.id)) continue;
  const r = play(p, p.editorial.designs[0].graph);
  if (!r.passed) { bad.push(`${p.id}: reference design does not pass`); continue; }
  for (const e of r.events) {
    const def = catalog.eventById.get(e.id);
    if (!(def.counters || []).length) continue;
    checked++;
    // a design that was built to survive an event shows at least one thing that helped, or a plain reason none was needed
    if (!e.story.helped && !/nothing in your design was exposed|nothing in your design calls/i.test(e.story.headline)) bad.push(`${p.id}: "${e.id}" shows no "What helped"`);
    if (/softened it/.test(e.story.helped || '') && (e.helpers || []).length) bad.push(`${p.id}: "${e.id}" says nothing helped but lists ${e.helpers.join(', ')}`);
  }
}
// the link follows the cause the headline and "Try this next" name: broken variants of three reference designs
const lessonFor = (r, p) => (missedConcepts ? missedConcepts(r, catalog, p, lessons).find((m) => m.check === 'availability')?.lessonId : null);
const variants = [
  ['status-page', 'multi-region', (g) => { for (const n of g.nodes) if (n.ref === 'lb' || n.ref === 'api') n.zones = 1; }],
  ['login-sso', 'back-of-envelope', (g) => { g.nodes.find((n) => n.ref === 'idp').units = 1; g.nodes.find((n) => n.ref === 'api').units = 40; }],
  ['payroll-run', 'autoscaling', (g) => { const a = g.nodes.find((n) => n.ref === 'app'); a.units = 2; a.knobs = { timeoutMs: 3000 }; g.nodes = g.nodes.filter((n) => n.ref !== 'scale'); g.edges = g.edges.filter((e) => e[0] !== 'scale'); }],
];
if (!missedConcepts) bad.push('ui/play/debrief.js could not be imported, so the Learn links were not checked');
if (missedConcepts) for (const [id, want, mut] of variants) {
  if (only.size && !only.has(id)) continue;
  const p = problems.find((x) => x.id === id);
  const g = JSON.parse(JSON.stringify(p.editorial.designs[0].graph)); mut(g);
  const r = play(p, g);
  if (r.passed) { bad.push(`${id}: the broken variant passed`); continue; }
  const got = lessonFor(r, p);
  console.log(`${id}: Learn link ${got}`);
  if (got !== want) bad.push(`${id}: Learn link is "${got}", the cause points to "${want}" (${r.nextStep.text.slice(0, 80)})`);
  if (id === 'login-sso' && !/Identity provider/.test(r.nextStep.text)) bad.push(`${id}: the most overloaded part is not named: ${r.nextStep.text.slice(0, 80)}`);
  if (id === 'payroll-run' && /submissions/.test(r.events.find((e) => e.id === 'deadline-surge')?.story.hurt || '')) bad.push(`${id}: the surge is on reads and sign-ins but the text says submissions`);
}
console.log(`${checked} events checked on the reference designs`);
if (bad.length) { console.log(bad.join('\n')); process.exit(1); }
console.log('ok');
