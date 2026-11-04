// Runs every reference design against the daily variant of many dates; a day is solvable when at least one design passes.
// Run from the app folder: node tests/daily-solvable.mjs [fromDate] [days]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const imp = (f) => import(pathToFileURL(path.resolve(f)).href);
const { createCatalog } = await imp('sim/catalog.js');
const { createSim } = await imp('sim/engine.js');
const { problems } = await imp('content/problems/index.js');
const { dailyFor, applyVariant, addDays } = await imp('compete/daily.js');
const catalog = createCatalog({ elements: J('catalog/elements.json'), requests: J('catalog/requests.json'), events: J('catalog/events.json'), world: J('catalog/world.json') });

const from = process.argv[2] || '2026-11-03';
const days = Number(process.argv[3] || 60);
const list = problems || [];
let bad = 0;
const byProblem = {};
for (let i = 0; i < days; i++) {
  const date = addDays(from, i);
  const d = dailyFor(date, list);
  const base = list.find((p) => p.id === d.problemId);
  if (!base) continue;
  const prob = applyVariant(base, d.variant, catalog);
  let best = null;
  for (const design of base.editorial?.designs || []) {
    const sim = createSim({ catalog, problem: prob, seed: d.seed, mode: 'challenge' });
    sim.loadGraph(design.graph);
    sim.start();
    sim.advance(86400000);
    const r = sim.result();
    if (!best || r.score.total > best.score) best = { score: Math.round(r.score.total), passed: r.passed, stars: r.stars };
  }
  const row = { date, id: d.problemId, mag: d.variant.magnitude, shift: d.variant.shiftMin, extra: d.variant.extraEventId, ...best };
  (byProblem[d.problemId] ||= []).push(row);
  if (!best || !best.passed) { bad++; console.log('FAIL', JSON.stringify(row)); }
}
console.log(`unsolvable days: ${bad} of ${days}`);
process.exit(bad ? 1 : 0);
