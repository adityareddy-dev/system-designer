// Ignored delivery loops stay structured even when every scored target passes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { problemById } from '../content/problems/index.js';
const catalog = createCatalog(Object.fromEntries(['elements', 'requests', 'events', 'world'].map(k => [k, JSON.parse(fs.readFileSync(`catalog/${k}.json`, 'utf8'))])));
for (const difficulty of ['Easy', 'Medium', 'Hard']) for (const broken of [false, true]) {
  const problem = { ...problemById.get('rate-limiter-service'), difficulty };
  const sim = createSim({ catalog, problem, seed: 'practice' });
  sim.loadGraph(problem.editorial.designs[0].graph);
  sim.connect('cache', 'svc');
  if (broken) { sim.setKnob('svc', 'autoscale', { on: false }); sim.setKnob('svc', 'units', 1); }
  sim.start(); sim.advance(86400000);
  const result = sim.result();
  assert.equal(result.passed, !broken);
  if (!broken) assert.equal(result.score.total, 1000);
  const warning = result.warnings.find(w => w.code === 'flow-cycle');
  assert(warning, `${difficulty}: loop warning survives ${broken ? 'failure' : 'pass'}`);
  assert.equal(warning.nodeId, 'cache');
  assert.match(warning.text, /ignored by the run.*Remove this closing link.*before interpreting/);
  assert.match(result.nextStep.text, /closes a delivery loop/);
}
console.log('Ignored loops warn before experiments at every difficulty and pass status.');
