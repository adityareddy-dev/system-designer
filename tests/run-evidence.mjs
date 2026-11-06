// The carried part follows measured failure evidence, including routing gaps and unavailable capacity.
import assert from 'node:assert/strict';
import { runEvidence } from '../ui/play/run-transition.js';
const graph = { nodes: ['client', 'app', 'db'].map(id => ({ id, type: id })), edges: [{ kind: 'flow', from: 'client', to: 'app' }, { kind: 'flow', from: 'app', to: 'db' }] };
const result = { passed: false, graph, firstFailure: { nodeId: 'app', kind: 'dependency', util: null },
  nodes: [{ id: 'client', failed: 100, peakUtil: 0 }, { id: 'app', failed: 10, peakUtil: .2 }], slo: { cost: { perMonth: 1, budget: 10 } } };
assert.equal(runEvidence(result)[0].id, 'app', 'the cause takes precedence over upstream failed-request totals');
assert.deepEqual(runEvidence({ ...result, passed: true }).map(n => n.id), ['client', 'app', 'db']);
assert.deepEqual(runEvidence({ graph: { nodes: [], edges: [] } }), []);
const large = { nodes: Array.from({ length: 20 }, (_, i) => ({ id: 'n' + i })), edges: Array.from({ length: 19 }, (_, i) => ({ from: 'n' + i, to: 'n' + (i + 1), kind: 'flow' })) };
assert.equal(runEvidence({ passed: true, graph: large }).length, 5, 'the carried path stays small on phones');
console.log('Carried evidence follows the measured cause and bounds large path summaries.');
