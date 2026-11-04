// A plain design that lacks a part a problem needs: the debrief names that part and links the lesson behind it.
// Run from the app folder: node tests/missing-part-links.mjs [-v]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const imp = (f) => import(pathToFileURL(path.resolve(f)).href);
const { createCatalog } = await imp('sim/catalog.js');
const { createSim } = await imp('sim/engine.js');
const { problems } = await imp('content/problems/index.js');
const { lessons } = await imp('content/lessons/index.js');
const { missedConcepts } = await imp('ui/play/debrief.js');
const catalog = createCatalog({ elements: J('catalog/elements.json'), requests: J('catalog/requests.json'), events: J('catalog/events.json'), world: J('catalog/world.json') });
const verbose = process.argv.includes('-v');
const WANT = { 'insurance-claims': 'storage-tiers', 'payroll-run': 'idempotency-retries', 'appointment-booking': 'search-indexing' };
const bad = [];
for (const [id, lesson] of Object.entries(WANT)) {
  const p = problems.find((q) => q.id === id);
  const src = (p.starter.nodes || []).filter((n) => n.locked);
  const nodes = [...src.map((n) => ({ id: n.ref, type: n.type, x: n.x, y: n.y })), { id: 'api', type: 'vm-fleet', x: 0, y: 0, units: 8 }, { id: 'db', type: 'sql-primary', x: 200, y: 0 }];
  const edges = [...src.map((n) => ({ from: n.ref, to: 'api' })), { from: 'api', to: 'db' }];
  const sim = createSim({ catalog, problem: p, seed: 'practice', mode: 'practice' });
  sim.loadGraph({ nodes, edges }); sim.start(); sim.advance(86400000);
  const r = sim.result();
  const learn = missedConcepts(r, catalog, p, lessons);
  if (verbose) console.log(id, '|', r.verdict, '|', r.nextStep?.text, '|', r.nextStep?.elementId, r.nextStep?.lesson, '|', learn.map((m) => `${m.check}:${m.lessonId}`).join(','));
  const a = learn.find((m) => m.check === 'availability');
  if (!a) bad.push(`${id}: no Learn this link for the reliability miss`);
  else if (a.lessonId !== lesson) bad.push(`${id}: links "${a.lessonId}", wanted "${lesson}"`);
}
if (bad.length) { console.log(bad.join('\n')); process.exit(1); }
console.log('ok');
