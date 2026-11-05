// Required destinations, outage diagnoses and whole-graph fits use actual workload evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { problemById } from '../content/problems/index.js';
import { createCamera, ZOOM_MIN } from '../render/camera.js';
import { reflectionCorrect, reflectionTarget, renderReflection } from '../ui/play/reflection.js';

const catalog = createCatalog(Object.fromEntries(['elements', 'requests', 'events', 'world'].map(k => [k, JSON.parse(fs.readFileSync(`catalog/${k}.json`, 'utf8'))])));
const ride = problemById.get('ride-hailing-dispatch');
const sim = createSim({ catalog, problem: ride, seed: 'practice' });
sim.loadGraph(ride.editorial.designs[0].graph);
sim.disconnect('api>pay');
const missing = () => sim.validate().some(i => i.level === 'error' && i.type === 'payment');
assert(missing(), 'the active payment path needs its processor');
const idle = sim.addNode('web-browser', 0, 400);
const unusedApp = sim.addNode('vm-fleet', 200, 400);
sim.connect(idle, unusedApp); sim.connect(unusedApp, 'pay');
assert(missing(), 'an unassigned source cannot supply required-path evidence');
assert(!sim.trace('payment').nodeIds.includes(idle), 'the request trace excludes idle sources');
sim.start(); sim.advance(86400000);
assert.equal(sim.result().passed, false, 'an idle processor branch cannot pass the day');
assert.equal(sim.result().nodes.find(n => n.id === 'pay').peakRequests, 0);
assert.equal(sim.result().firstFailure.kind, 'routing');
sim.reset(); sim.connect('api', 'pay');
assert.equal(missing(), false, 'repairing the active path satisfies the requirement');
sim.start(); sim.advance(86400000);
assert(sim.result().nodes.find(n => n.id === 'pay').peakRequests > 0);
assert(sim.result().passed);

for (const assigned of [true, false]) {
  const trial = createSim({ catalog, problem: { id: 'idle-route',
    requirements: { peakRps: 100, mix: { read: 1 } },
    traffic: { curve: 'flat', sources: { 'web-browser': 1, 'mobile-app': assigned ? 1 : 0 },
      ...(assigned ? { sourceTypes: { active: ['read'], idle: [] } } : {}) }, events: [] } });
  trial.loadGraph({ nodes: [['active', 'web-browser'], ['idle', 'mobile-app'], ['app', 'vm-fleet'], ['db', 'sql-primary']].map(([id, type]) => ({ id, type, x: 0, y: 0 })), edges: [['idle', 'app'], ['app', 'db']] });
  assert(trial.validate().some(i => i.code === 'type-unserved' && i.type === 'read'), 'only positive source weights count as served paths');
  const trace = trial.trace('read');
  assert.deepEqual(trace.nodeIds, ['active']);
  assert.equal(trace.repair.path[0], 'active', 'a suggested repair must serve the active source');
}

const outage = createSim({ catalog, seed: 'practice', problem: { id: 'unavailable-fleet',
  requirements: { peakRps: 100, mix: { read: 1 }, latencyP99Ms: { default: 1000 } },
  traffic: { curve: 'flat', sources: { 'web-browser': 1 } }, events: [{ id: 'zone-outage', at: '12:00' }] } });
const src = outage.addNode('web-browser', -200, 0);
const app = outage.addNode('vm-fleet', 0, 0, { units: 2, zones: 1 });
const db = outage.addNode('sql-primary', 200, 0, { units: 50, zones: 3 });
outage.connect(src, app); outage.connect(app, db); outage.start(); outage.advance(86400000);
const result = outage.result();
assert.equal(result.firstFailure.kind, 'dependency');
assert.equal(result.firstFailure.nodeId, app);
assert.equal(result.firstFailure.atMs, 12 * 3600000);
assert.equal(result.firstFailure.util, null, 'unavailable capacity has no measured busy percentage');
assert(result.nodes.find(n => n.id === app).peakUtil < 1);
const target = reflectionTarget(result);
assert.equal(target.percent, null);
assert(reflectionCorrect(target, app, 'unavailable'));
for (const answer of [0, 999, NaN, 'available', '']) assert(!reflectionCorrect(target, app, answer));
assert(!reflectionCorrect(target, db, 'unavailable'));

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.nodeType = 1; this.value = ''; this.classList = { add() {} }; }
  setAttribute(key, value) { this[key] = String(value); }
  addEventListener(key, fn) { this.events[key] = fn; }
  append(child) { this.children.push(child); }
}
globalThis.document = { createElement: tag => new Element(tag), createTextNode: text => ({ nodeType: 3, textContent: text }) };
try {
  const form = renderReflection(result, catalog);
  const all = node => [node, ...(node.children || []).flatMap(all)];
  const nodes = all(form);
  const copy = () => nodes.map(n => n.textContent || '').join(' ');
  assert.match(copy(), /capacity unavailable/);
  assert.doesNotMatch(copy(), /999%|null%|0% busy/);
  const metric = nodes.find(n => n['aria-label'] === 'Available capacity at the first failure');
  assert.equal(metric.tag, 'select');
  nodes.find(n => n['aria-label'] === 'Your diagnosis').value = app;
  metric.value = 'unavailable';
  nodes.find(n => n.tag === 'form').events.submit({ preventDefault() {} });
  assert.match(copy(), /Evidence checked/);
  assert.match(copy(), /busy percentage was not measurable/);
} finally { delete globalThis.document; }

const camera = createCamera({ position: { set() {} }, scale: { set() {} } });
camera.resize(390, 844);
for (const animate of [false, true]) {
  for (const width of [2200, 10000]) {
    camera.fitBounds(-36, -50, width + 36, 66, { l: 46, r: 46, t: 100, b: 300 }, animate, { minZ: 0, maxZ: 0.9 });
    if (animate) camera.update(320);
    assert(camera.zoom < ZOOM_MIN);
    for (const [x, y] of [[-36, -50], [width + 36, 66]]) {
      const point = camera.worldToScreen(x, y);
      assert(point.x >= 46 - 1e-6 && point.x <= 344 + 1e-6);
      assert(point.y >= 100 && point.y <= 544);
    }
  }
}
camera.fitBounds(-36, -50, 2236, 66, 80, false);
assert(camera.zoom < ZOOM_MIN, 'the default renderer fit also frames the whole graph');
assert(camera.worldToScreen(2236, 0).x <= 310 + 1e-6);
camera.fitBounds(0, 0, 100, 100, 40, false, { minZ: 0.55, maxZ: 0.9 });
assert(camera.zoom >= 0.55, 'branch inspection retains readable zoom');
camera.setReducedMotion(true); camera.zoomBy(0.001);
assert.equal(camera.zoom, ZOOM_MIN, 'interactive zoom retains its minimum');
console.log('Required paths, unavailable capacity evidence and unrestricted explicit fits passed.');
