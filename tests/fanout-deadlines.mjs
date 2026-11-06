// Fanout deadlines follow each subscriber and type, counting overdue copies only once.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';

const catalog = createCatalog(Object.fromEntries(['elements', 'requests', 'events', 'world'].map(k =>
  [k, JSON.parse(fs.readFileSync(new URL(`../catalog/${k}.json`, import.meta.url)))])));
function run({ email = true, warehouses = 1, eventLimit = 10, at = '23:59' } = {}) {
  const sim = createSim({ catalog, seed: 'practice', problem: { id: 'fanout-deadlines',
    requirements: { peakRps: 60, mix: { notify: 0.99, event: 0.01 },
      queueDeadlineSec: { notify: 3600, event: eventLimit }, availability: 0.9999,
      latencyP99Ms: { default: 1000 }, budgetPerMonth: 10000000 },
    traffic: { curve: 'flat', sources: { 'mobile-app': 1 } },
    events: [{ id: 'viral-spike', at, params: { factor: 100, rampSec: 0, holdSec: 60, decaySec: 0 } }] } });
  const nodes = [
    { id: 'u', type: 'mobile-app' }, { id: 'app', type: 'vm-fleet', units: 100 },
    { id: 'q', type: 'pubsub' }, { id: 'idem', type: 'idempotency' },
  ];
  const edges = [['u', 'app'], ['app', 'q'], ['app', 'idem']];
  if (email) {
    nodes.push({ id: 'wk', type: 'worker-pool', units: 100 }, { id: 'email', type: 'email-provider' });
    edges.push(['q', 'wk'], ['wk', 'email'], ['wk', 'idem']);
  }
  for (let i = 0; i < warehouses; i++) {
    nodes.push({ id: `db${i}`, type: 'data-warehouse', units: 1 });
    edges.push(['q', `db${i}`]);
  }
  sim.loadGraph({ nodes: nodes.map(n => ({ x: 0, y: 0, ...n })), edges });
  let beforeSettlement;
  sim.on('tick', ({ clockMs }) => {
    if (clockMs === 86400000) beforeSettlement = sim.debug().lateDay;
  });
  sim.start(); sim.advance(86400000);
  return { ...sim.result(), beforeSettlement };
}
const isolated = run({ email: false });
const mixed = run();
assert(isolated.lateRequests > 2000, 'the warehouse misses the short event deadline');
assert.equal(mixed.lateRequests, isolated.lateRequests, 'a larger notification backlog cannot hide late events');
assert.equal(mixed.passed, false, 'missed event deadlines prevent passing a strict availability target');
assert.equal(run({ warehouses: 2 }).lateRequests, mixed.lateRequests, 'two late copies of an event count as one failed request');
assert.equal(run({ eventLimit: 3600 }).lateRequests, 0, 'neither branch misses the relaxed deadline');

const settled = run({ eventLimit: 120 });
assert.equal(settled.beforeSettlement, 0, 'the final burst has not reached its deadline by midnight');
assert(settled.lateRequests > 0, 'settlement includes work that cannot drain before its deadline');
assert.equal(settled.lateRequests, run({ email: false, eventLimit: 120 }).lateRequests,
  'settlement uses the warehouse drain rate even with a larger email backlog');
assert.equal(settled.lateRequests, run({ warehouses: 2, eventLimit: 120 }).lateRequests,
  'settlement also counts overdue copies once');
const early = run({ at: '12:00' });
assert(early.beforeSettlement > 2000, 'deadline crossings are charged during the day');
assert.equal(early.lateRequests, Math.round(early.beforeSettlement), 'drained late work is not charged again at settlement');
console.log('Fanout per-subscriber deadlines and day-end settlement passed.');
