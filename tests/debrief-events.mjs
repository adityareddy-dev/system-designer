// Scenario percentages and measured slow-dependency mechanisms in event explanations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { eventDescription } from '../ui/play/event-copy.js';

const read = (name) => JSON.parse(fs.readFileSync(new URL(`../catalog/${name}.json`, import.meta.url)));
const catalog = createCatalog(Object.fromEntries(['elements', 'requests', 'events', 'world'].map((name) => [name, read(name)])));
{
  const problem = { id: 'provider-quota-copy', requirements: { peakRps: 10, mix: { webhook: 1 } },
    traffic: { curve: 'flat', sources: { 'partner-system': 1 } },
    events: [{ id: 'third-party-rate-limit', at: '01:00' }] };
  const sim = createSim({ catalog, problem });
  sim.addNode('partner-system', 0, 0, { id: 'u' });
  sim.addNode('vm-fleet', 100, 0, { id: 'app' });
  sim.addNode('third-party-api', 200, 0, { id: 'api' });
  sim.connect('u', 'app'); sim.connect('app', 'api');
  sim.start(); sim.advance(86400000);
  const event = sim.result().events.find(e => e.id === 'third-party-rate-limit');
  assert.equal(event.vars.cap, '100', 'a 200 requests/s quota is halved regardless of the 10 requests/s demand');
  assert.match(event.story.headline, /100 req\/s/);
  assert.match(event.description, /configured request quota/);
  assert.doesNotMatch(event.description, /current rate|current load/);
  assert.match(eventDescription(catalog.eventById.get(event.id), event.vars), /configured request quota/);
  assert.match(catalog.ops.limit.params.rpsCapFactor, /configured quota/);
}
const duplicate = catalog.eventById.get('duplicate-delivery');
for (const share of ['3', '1', '2.5', '0']) {
  assert.match(eventDescription(duplicate, { share }), new RegExp(`redelivers ${share.replace('.', '\\.')} percent`));
}
{
  const problem = { id: 'duplicate-copy', requirements: { peakRps: 10, mix: { payment: 1 } },
    traffic: { curve: 'flat', sources: { 'mobile-app': 1 } }, events: [{ id: 'duplicate-delivery', at: '01:00', params: { share: 0.03 } }] };
  const sim = createSim({ catalog, problem });
  for (const [id, type] of [['u', 'mobile-app'], ['q', 'queue'], ['w', 'worker-pool'], ['p', 'payment-processor']]) sim.addNode(type, 0, 0, { id });
  sim.connect('u', 'q'); sim.connect('q', 'w'); sim.connect('w', 'p');
  sim.start(); sim.advance(86400000);
  const event = sim.result().events.find((e) => e.id === 'duplicate-delivery');
  assert.match(event.story.headline, /3 percent/);
  assert.match(eventDescription(duplicate, event.vars), /redelivers 3 percent/);
}
const node = (id, type, knobs = {}) => ({ id, type, x: 0, y: 0, units: 10, knobs });
const run = (nodes, edges, target = 'payment-processor', text) => {
  const problem = { id: 'dependency-copy', requirements: { peakRps: 10, mix: { payment: 1 }, latencyP99Ms: { payment: 5000 } },
    traffic: { curve: 'flat', sources: { 'mobile-app': 1 } },
    events: [{ id: 'slow-dependency', at: '01:00', params: { target: `el:${target}`, addLatencyMs: 3000, durationSec: 1800 }, text }] };
  const sim = createSim({ catalog, problem });
  sim.loadGraph({ nodes, edges: edges.map(([from, to]) => ({ from, to })) });
  sim.start(); sim.advance(86400000);
  return sim.result().events.find((e) => e.id === 'slow-dependency');
};
const direct = run([node('u', 'mobile-app'), node('lb', 'regional-lb'), node('api', 'payment-processor', { timeoutMs: 1000 })], [['u', 'lb'], ['lb', 'api']]);
assert.match(direct.story.hurt, /Calls timed out at .*1,?000 ms timeout/);
assert.match(direct.story.hurt, /No measurable compute capacity was lost/);
assert.match(direct.story.hurt, /requests failed in this window across the design/);
const waiting = run([node('u', 'mobile-app'), node('app', 'vm-fleet', { timeoutMs: 30000 }), node('api', 'payment-processor', { timeoutMs: 30000 })], [['u', 'app'], ['app', 'api']]);
assert.match(waiting.story.hurt, /Waiting reduced compute capacity by up to [\d.]+ percent/);
const disconnected = run([node('u', 'mobile-app'), node('app', 'vm-fleet'), node('store', 'feature-store')], [['u', 'app']], 'feature-store', {
  debrief: { hurt: 'The dependency caused every failure.', fix: 'Add more dependency capacity.' },
});
assert.match(disconnected.story.hurt, /No requests reached .*added latency did not cause these failures/);
assert.match(disconnected.story.hurt, /Routing gap:/);
assert.doesNotMatch(disconnected.story.hurt, /lost 0 percent/);
assert.match(disconnected.story.fix, /routing gap/);
{
  const problem = { id: 'overlapping-authored-rush', requirements: { peakRps: 100, mix: { read: 1 } },
    traffic: { curve: 'flat', sources: { 'mobile-app': 1 } }, events: [
      { id: 'thundering-herd', at: '01:00', params: { factor: 2, types: ['read'] },
        text: { name: 'Read rush', debrief: { hurt: 'The rush overwhelmed the servers.', fix: 'Add servers for the rush.' } } },
      { id: 'dns-misconfig', at: '01:00' },
    ] };
  const sim = createSim({ catalog, problem });
  for (const [id, type] of [['u', 'mobile-app'], ['lb', 'regional-lb'], ['app', 'vm-fleet'], ['db', 'sql-primary']]) sim.addNode(type, 0, 0, { id });
  sim.connect('u', 'lb'); sim.connect('lb', 'app'); sim.connect('app', 'db');
  sim.start(); sim.advance(86400000);
  const rush = sim.result().events.find(e => e.id === 'thundering-herd');
  assert.match(rush.story.hurt, /not overloaded.*dns/i);
  assert.equal(rush.story.fix, null, 'authored advice cannot overwrite an overlapping outage diagnosis');
}
console.log('Debrief event checks passed.');


