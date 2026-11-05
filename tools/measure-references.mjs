// Refreshes expected results for the composed problem bank without changing sizes, budgets or targets.
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { problems } from '../content/problems/index.js';
import calibration from '../content/problems/calibration.js';
const catalog = createCatalog(Object.fromEntries(['elements','requests','events','world'].map(k => [k, JSON.parse(fs.readFileSync(`catalog/${k}.json`, 'utf8'))])));
for (const p of problems) for (const [i,d] of p.editorial.designs.entries()) {
  const sim = createSim({ catalog, problem: p, seed: 'practice' });
  sim.loadGraph(d.graph); sim.start(); sim.advance(86400000);
  const r = sim.result(), c = calibration[p.id] ||= {}, dc = (c.designs ||= {})[i] ||= {};
  dc.expect = { score: r.score.total, costPerMonth: Math.round(r.slo.cost.perMonth), passed: r.passed,
    availability: Math.round(r.slo.availability.actual * 100000) / 100000, ...(!r.passed ? { verdict: r.verdict } : {}) };
}
const body = Object.keys(calibration).sort().map(k => `  ${JSON.stringify(k)}: ${JSON.stringify(calibration[k])},`).join('\n');
fs.writeFileSync('content/problems/calibration.js', '// Calibration measured from full simulated days (tests/calibrate.mjs). Keyed by problem id.\nexport default {\n' + body + '\n};\n');
console.log('Updated measured reference expectations without resizing.');
