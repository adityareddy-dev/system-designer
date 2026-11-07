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
  ['u', 'a'], ['a', 'c'], ['c', 'i'], ['c', 'p'], ['i', 'q'], ['q', 'w'], ['w', 'p'],
].map(([from, to]) => ({ from, to })) });
const before = JSON.stringify(sim.getGraph());
const trace = sim.trace('notify');
assert(!trace.edgeIds.includes('a>c'), 'without a delivery route, the caller cannot forward traffic');
assert(!trace.edgeIds.includes('c>i'), 'consent does not forward to idempotency');
assert(trace.rejected.some((h) => h.edgeId === 'a>c' && h.reason.includes('side call')));
assert.deepEqual(trace.rejected.find((h) => h.edgeId === 'c>p').path, ['u', 'a', 'c', 'p']);
assert(trace.rejected.every((h) => Array.isArray(h.carries)));
assert(trace.repair, 'a blocked notification chain gets a verified repair');
assert.notEqual(trace.repair.from, trace.repair.to);
const repaired = createSim({ catalog, problem: problemById.get('notification-service') });
repaired.loadGraph(sim.getGraph());
repaired.connect(trace.repair.from, trace.repair.to);
assert(!repaired.validate().some((i) => i.code === 'type-unserved' && i.type === 'notify'));
assert(repaired.trace('notify').edgeIds.includes(`${trace.repair.from}>${trace.repair.to}`));
const advice = sim.validate().find((i) => i.code === 'type-unserved' && i.type === 'notify');
assert(advice.message.includes('App servers (VMs) → Consent service'), advice.message);
assert(!/Connect it to Push/.test(advice.message));
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
// The report's second wiring reaches workers, but chains delivery through a side call.
sim.disconnect('w>p');
sim.connect('w', 'i');
sim.connect('i', 'p');
const workerTrace = sim.trace('notify');
assert.deepEqual(workerTrace.repair, { from: 'w', to: 'p', path: ['u', 'a', 'q', 'w', 'p'] });
assert(sim.validate().find((i) => i.type === 'notify').message.includes('Background workers → Idempotency keys'));
// A producer cannot double as its own queue's downstream consumer.
for (const spare of [null, 'consumer', 'repair-workers']) {
  const blocked = createSim({ catalog, problem: problemById.get('notification-service') });
  blocked.loadGraph({ nodes: [
    ['u', 'mobile-app'], ['producer', 'worker-pool'], ['q', 'queue'], ['destination', 'email-provider'],
    ...(spare ? [[spare, spare === 'consumer' ? 'worker-pool' : 'vm-fleet']] : []),
  ].map(([id, type], x) => ({ id, type, x: x * 160, y: 0 })),
  edges: [['u', 'producer'], ['producer', 'q']] });
  const before = blocked.getGraph();
  const repair = blocked.trace('notify').repair;
  assert.deepEqual(blocked.getGraph(), before, 'finding a repair does not mutate the graph');
  assert(repair, 'a deferred path can be repaired');
  assert.equal(new Set(repair.path).size, repair.path.length, 'a verified path cannot repeat its producer');
  assert(repair.path.includes('q'), 'the repair preserves the deferred queue');
  for (const n of repair.addNodes || []) blocked.addNode(n.type, 0, 0, { id: n.id });
  for (const [from, to] of repair.steps || [[repair.from, repair.to]]) blocked.connect(from, to);
  const actual = blocked.trace('notify');
  for (let i = 1; i < repair.path.length; i++) {
    assert(actual.edgeIds.includes(`${repair.path[i - 1]}>${repair.path[i]}`), 'every advertised hop carries notify');
  }
  assert(!blocked.validate().some(i => i.code === 'flow-cycle'), 'queue repairs introduce no ignored closing links');
  assert(!blocked.validate().some(i => i.type === 'notify' && /unserved/.test(i.code)));
  if (spare === 'consumer') assert.equal(repair.addNodes.length, 0, 'reuse a safe consumer when present');
  else assert.equal(repair.addNodes.length, 1, 'add a distinct downstream consumer when needed');
}
// A converging synchronous branch must not hide a repair through the queue.
const notifyOnly = { id: 'notify-repair', requirements: { peakRps: 10, mix: { notify: 1 } },
  traffic: { curve: 'flat', sources: { 'mobile-app': 1 } }, events: [] };
const converging = createSim({ catalog, problem: notifyOnly, mode: 'sandbox' });
converging.loadGraph({ nodes: [
  ['u', 'mobile-app'], ['direct', 'vm-fleet'], ['producer', 'vm-fleet'], ['q', 'queue'], ['merge', 'vm-fleet'], ['destination', 'email-provider'],
].map(([id, type], x) => ({ id, type, x: x * 160, y: 0 })),
edges: [['u', 'direct'], ['u', 'producer'], ['direct', 'merge'], ['producer', 'q'], ['q', 'merge']] });
assert.deepEqual(converging.trace('notify').repair, {
  from: 'merge', to: 'destination', path: ['u', 'producer', 'q', 'merge', 'destination'],
}, 'reachability distinguishes paths that have traversed the required queue');

// Dense DAGs within share limits must not enumerate exponentially many delivery paths.
for (const count of [24, 28]) {
  const dense = createSim({ catalog, problem: notifyOnly, mode: 'sandbox' });
  const nodes = [['u', 'mobile-app'], ...Array.from({ length: count }, (_, i) => [`c${i}`, 'vm-fleet']),
    ['q', 'queue'], ['destination', 'email-provider']].map(([id, type], x) => ({ id, type, x: x * 160, y: 0 }));
  const edges = [['u', 'c0'], ['u', 'q']];
  for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) edges.push([`c${i}`, `c${j}`]);
  assert(nodes.length <= 120 && edges.length <= 400, 'the dense regression fits supported graph limits');
  dense.loadGraph({ nodes, edges });
  const started = performance.now();
  const issues = dense.validate();
  const elapsed = performance.now() - started;
  assert(elapsed < 1000, `${count}-server validation took ${elapsed.toFixed(0)} ms`);
  assert(issues.some(i => i.code === 'type-unserved' && i.type === 'notify'));
  const repair = dense.trace('notify').repair;
  assert(repair?.path.includes('q'), 'dense graph repair preserves the deferred path');
  for (const n of repair.addNodes || []) dense.addNode(n.type, 0, 0, { id: n.id });
  for (const [from, to] of repair.steps || [[repair.from, repair.to]]) dense.connect(from, to);
  assert(!dense.validate().some(i => i.type === 'notify' && /unserved/.test(i.code)));
}
console.log('Request routing trace checks passed.');


