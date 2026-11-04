// Request traces follow the engine routes without advancing or changing a run.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { problemById } from '../content/problems/index.js';
const read = (name) => JSON.parse(fs.readFileSync(new URL('../catalog/' + name + '.json', import.meta.url)));
const catalog = createCatalog({ elements: read('elements'), requests: read('requests'), events: read('events'), world: read('world') });
const sim = createSim({ catalog, problem: problemById.get('notification-service') });
sim.loadGraph({ nodes: [
  ['u', 'mobile-app'], ['a', 'vm-fleet'], ['c', 'consent-service'], ['i', 'idempotency-store'], ['q', 'queue'], ['w', 'worker-pool'], ['p', 'push-service'],
].map(([id, type], x) => ({ id, type, x: x * 160, y: 0 })), edges: [
  ['u', 'a'], ['a', 'c'], ['c', 'i'], ['i', 'q'], ['q', 'w'], ['w', 'p'],
].map(([from, to]) => ({ from, to })) });
const before = JSON.stringify(sim.getGraph());
const trace = sim.trace('notify');
assert(!trace.edgeIds.includes('a>c'), 'without a delivery route, the caller cannot forward traffic');
assert(!trace.edgeIds.includes('c>i'), 'consent does not forward to idempotency');
assert(trace.rejected.some((h) => h.edgeId === 'a>c' && h.reason.includes('side call')));
assert.equal(sim.canConnect('consent-service', 'idempotency-store').ok, false);
assert.equal(sim.clockMs, 0);
assert.equal(sim.phase, 'build');
assert.equal(JSON.stringify(sim.getGraph()), before);
assert.deepEqual(sim.trace('notify'), trace, 'trace is deterministic');
assert.deepEqual(sim.trace('unknown').edgeIds, []);
sim.connect('a', 'q');
const fixed = sim.trace('notify');
assert(fixed.edgeIds.includes('a>q'), 'trace refreshes after rewiring');
assert(fixed.edgeIds.includes('q>w'), 'queue delivery route is included');
assert(fixed.edgeIds.includes('a>c'), 'side call remains visible beside delivery');
assert(fixed.stops.some((s) => s.nodeId === 'c' && s.reason.includes('Side call returns')));
assert(sim.trace('payment').rejected.some((h) => h.edgeId === 'a>c' && h.reason.includes('does not handle')));
console.log('Request routing trace checks passed.');


