// Inspector wording and load-balancing demo regression checks, runnable in Node.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { capacityText, inspectorStatus } from '../ui/play/inspector-facts.js';
import lesson from '../content/lessons/load-balancing.js';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';

const read = (name) => JSON.parse(fs.readFileSync(new URL(`../catalog/${name}.json`, import.meta.url)));
const catalog = createCatalog(Object.fromEntries(['elements', 'requests', 'events', 'world'].map((name) => [name, read(name)])));
const tiers = catalog.world.tiers;
for (const [type, units, label] of [['vm-fleet', 3, 'per 4 vCPU server'], ['container-cluster', 12, 'per 4 vCPU node'], ['worker-pool', 40, 'per 2 vCPU worker']]) {
  const el = catalog.elementById.get(type);
  const text = capacityText(el, { units }, tiers);
  assert.ok(text.includes('req/s total, '));
  assert.ok(text.includes(label), text);
  assert.notEqual(capacityText(el, { units, tier: 'L' }, tiers), text);
}
assert.equal(capacityText(catalog.elementById.get('vm-fleet'), { units: 3 }, tiers), '3k req/s total, 1k req/s per 4 vCPU server at 100% busy');
for (const [status, name] of [['overload', 'overload'], [3, 'overload'], ['down', 'down'], [4, 'down'], ['warn', 'warn'], ['hot', 'hot']]) {
  assert.equal(inspectorStatus({ status }).name, name);
  assert.ok(!inspectorStatus({ status }).text.includes('Healthy'));
}
assert.equal(inspectorStatus({ status: 'ok' }).text, 'Available');
assert.equal(inspectorStatus({ status: 'ok', failRps: 20 }).text, 'Available · Requests failing');
assert.equal(inspectorStatus({ status: 'overload', failRps: 20 }).text, 'Available · Overloaded · Requests failing');
const setup = lesson.steps.find((s) => s.kind === 'demo').setup;
const sim = createSim({ catalog, problem: { id: 'load-balancing', ...setup }, mode: 'lesson', seed: 'inspector' });
assert.ok(sim.estimate().nodes.find((n) => n.id === 'app').util <= 3.01);
sim.start();
sim.advance(600000);
const app = sim.state().nodes.find((n) => n.id === 'app');
assert.ok(app.util > 2.4 && app.util < 3.1, `Demo busy level: ${app.util}`);
assert.equal(inspectorStatus(app).name, 'overload');
console.log('Inspector facts and load-balancing demo checks passed.');

assert.equal(inspectorStatus({status:'overload',util:.03,failRps:20}).text, 'Available · Requests failing');
assert.equal(inspectorStatus({}).text, 'Not measured yet');
