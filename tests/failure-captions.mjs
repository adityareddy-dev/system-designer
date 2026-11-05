// Deployment failures on a valid low-load route must not be described as missing routes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { createNodeLayer } from '../render/nodes.js';

const read = name => JSON.parse(fs.readFileSync(new URL(`../catalog/${name}.json`, import.meta.url)));
const catalog = createCatalog({ elements: read('elements'), requests: read('requests'), events: read('events'), world: read('world') });
const sim = createSim({ catalog, problem: {
  id: 'failure-captions', requirements: { peakRps: 100, mix: { read: 1 }, latencyP99Ms: { default: 1000 } },
  traffic: { curve: 'flat', sources: { 'web-browser': 1 } },
  events: [{ id: 'bad-deploy', at: '00:01' }],
} });
sim.loadGraph({ nodes: [
  { id: 'users', type: 'web-browser' }, { id: 'app', type: 'vm-fleet', units: 100 }, { id: 'db', type: 'sql-primary' },
], edges: [['users', 'app'], ['app', 'db']] });
assert(!sim.validate().some(i => i.code === 'type-unserved'));
sim.start();
sim.advance(120000);
const app = sim.state().nodes.find(n => n.id === 'app');
assert(app.util < .01 && app.failRps > 10, 'a bad deployment fails requests despite spare capacity');
const layer = createNodeLayer({}, {}, { kit: () => ({ P: { bad: 1, ok: 2, warn: 3 } }) });
const view = { live: true, status: 0, down: false, statusG: {}, evidenceT: { style: {} } };
layer.setLive(view, true, app.util, 0, 0, 0, -1, app.failRps);
assert.match(view.evidenceT.text, /\/s rejected/);
assert(!/route/i.test(view.evidenceT.text));
layer.setLive(view, true, app.util, 0, 0, 0, -1, 0);
assert.equal(view.evidenceT.text, 'Requests recovered');
console.log('Failure caption checks passed.');
