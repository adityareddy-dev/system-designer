// Queue telemetry distinguishes accepted work, completed work and deadline risk.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import lesson from '../content/lessons/queues-backpressure.js';

const read = (name) => JSON.parse(fs.readFileSync(new URL(`../catalog/${name}.json`, import.meta.url)));
const catalog = createCatalog({ elements: read('elements'), requests: read('requests'), events: read('events'), world: read('world') });
const problem = { ...lesson.steps.find((s) => s.kind === 'demo').setup, id: 'queue-meters', events: [] };
const sim = createSim({ catalog, problem, mode: 'lesson', seed: 'queue-meters' });
sim.loadGraph({ nodes: [
  { id: 'u', type: 'mobile-app', x: 0, y: 0 },
  { id: 'app', type: 'vm-fleet', units: 6, x: 100, y: 0 },
  { id: 'q', type: 'queue', x: 200, y: 0 },
  { id: 'wk', type: 'worker-pool', units: 1, x: 400, y: 0 },
  { id: 'db', type: 'sql-primary', x: 600, y: 0 },
], edges: [['u', 'app'], ['app', 'q'], ['q', 'wk'], ['wk', 'db']] });
sim.start();
sim.advance(600000);
const q = sim.state().nodes.find((n) => n.id === 'q');
assert.ok(q.queueDepth > 0 && q.queueAcceptedRps > 0, 'a queue accepts work without completing it');
assert.ok(q.queueDrainRps > 0 && q.queueDrainRps < q.queueAcceptedRps, 'acceptance can exceed completed drain');
assert.ok(q.oldestJobAgeSec > 300, 'oldest waiting job keeps aging');
assert.ok(q.queueLimitSec > 0, 'deadline is exposed separately from age');
sim.setKnob('wk', 'units', 20);
sim.advance(600000);
assert.ok(sim.state().nodes.find((n) => n.id === 'q').queueDrainRps > q.queueDrainRps, 'scaling workers increases completed drain');
sim.disconnect('q>wk');
sim.advance(60000);
assert.equal(sim.state().nodes.find((n) => n.id === 'q').queueAcceptedRps, 0, 'a queue with no usable downstream path reports no acceptance');
console.log('Queue meter checks passed');
