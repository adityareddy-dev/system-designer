// Accepted proof wiring stays aligned with the build-phase warnings.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';

const read = (name) => JSON.parse(fs.readFileSync(new URL('../catalog/' + name + '.json', import.meta.url)));
const catalog = createCatalog({ elements: read('elements'), requests: read('requests'), events: read('events'), world: read('world') });
for (const key of ['kms', 'hsm']) {
  const problem = { id: 'proof-test', requirements: { peakRps: 10, mix: { write: 1 }, compliance: ['encryption', 'audit-log'] }, traffic: { curve: 'flat', sources: { 'mobile-app': 1 } }, events: [],
    starter: { nodes: [{ ref: 'u', type: 'mobile-app' }, { ref: 'app', type: 'vm-fleet' }, { ref: 'db', type: 'sql-primary' }], edges: [['u', 'app'], ['app', 'db']] } };
  const sim = createSim({ catalog, problem });
  const missing = () => sim.validate().filter((i) => i.code === 'compliance-missing');
  assert.equal(missing().length, 2);
  const k = sim.addNode(key, 0, 0), audit = sim.addNode('audit-log', 0, 0);
  assert.equal(missing().length, 2, 'Unconnected proof parts are insufficient');
  assert.equal(sim.canConnect('sql-primary', key).ok, false);
  sim.connect('app', k);
  assert.equal(missing().length, 1, 'Server dependency supplies the key proof');
  sim.connect('app', audit);
  assert.equal(missing().length, 0, 'An incoming audit tap supplies the audit proof');
  sim.disconnect('app>' + audit);
  assert.equal(missing().length, 1);
  sim.connect('db', audit);
  assert.equal(missing().length, 0, 'A database audit tap is also accepted');
}
console.log('Compliance wiring checks passed');
