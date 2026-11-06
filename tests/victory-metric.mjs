// A pass compares the measured repair, including a latency repair at unchanged availability.
import assert from 'node:assert/strict';
import { victoryMetric, victoryRepair } from '../ui/play/victory.js';
const result = { slo: { availability: { actual: 1, target: .999 }, latency: { worstP99Ms: 150 }, cost: { perMonth: 800, budget: 1000 } } };
assert.equal(victoryMetric(result, { availability: .8, p99: 1200 }).label, 'Requests served');
const latency = victoryMetric(result, { availability: 1, p99: 1200 });
assert.equal(latency.label, 'Worst p99');
assert.equal(latency.format(latency.from), '1,200 ms');
assert.equal(latency.format(latency.value), '150 ms');
assert.equal(victoryMetric(result, { availability: 1, cost: 1400 }).label, 'Cost / month');
assert.equal(victoryMetric(result, null).from, null, 'a first run does not invent an earlier result');
console.log('Wins compare the measured limiting metric');

const graph = {
  nodes: ['source', 'repair', 'db', 'other', 'other-db'].map(id => ({ id, units: 1, knobs: {} })),
  edges: [['source', 'repair'], ['repair', 'db'], ['source', 'other'], ['other', 'other-db']]
    .map(([from, to]) => ({ id: `${from}>${to}`, from, to, kind: 'flow' })),
};
const without = id => ({ ...graph, edges: graph.edges.filter(e => e.id !== id) });
for (const id of ['repair>db', 'source>repair']) {
  const repair = victoryRepair(graph, without(id));
  assert.deepEqual(repair.route.map(e => e.id), ['source>repair', 'repair>db'], 'added connections replay only the affected route in request order');
  assert(repair.changes.some(n => n.id === 'repair'), 'a connection-only repair marks the repaired part');
  const removal = victoryRepair(without(id), graph);
  assert(removal.route.every(e => e.id === 'source>repair' || e.id === 'repair>db'), 'removed connections do not highlight sibling branches');
  assert(removal.changes.some(n => n.id === 'repair'), 'removing a connection marks the affected part');
}
const resized = structuredClone(graph); resized.nodes.find(n => n.id === 'repair').units = 3;
assert.deepEqual(victoryRepair(resized, graph).route.map(e => e.id), ['source>repair', 'repair>db']);
assert.equal(victoryRepair(graph, graph).route.length, graph.edges.length, 'an unchanged successful design still shows its surviving routes');
console.log('Connection repairs replay their affected route without unrelated branches.');
