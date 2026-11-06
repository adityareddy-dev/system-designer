// Node regression checks for armed line insertion and stable phone connection targeting.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createCamera } from '../render/camera.js';

const source = readFileSync(new URL('../ui/play/play.js', import.meta.url), 'utf8');
const edgeHandler = source.slice(source.indexOf("  scene.on('edge:tap'"), source.indexOf("  scene.on('node:longpress'"));
const g = { nodes: [{ id: 'a', x: 0, y: 40 }, { id: 'b', x: 240, y: 80 }], edges: [{ id: 'ab', from: 'a', to: 'b' }] };
let handler, armed = 'regional-lb', placed, menus = 0, cancelled = 0;
const S = { connectFrom: null };
vm.runInNewContext(edgeHandler, {
  scene: { on: (_, fn) => { handler = fn; } }, graph: () => g, S,
  toolbar: { armed: () => armed }, placeComponent: (...args) => { placed = args; },
  cancelModes: () => { cancelled++; }, openMenu: () => { menus++; }, removeEdge() {},
});
handler({ id: 'ab' });
assert.deepEqual(placed, ['regional-lb', 120, 60, 'ab']);
assert.equal(cancelled, 1);
assert.equal(menus, 0);
armed = null;
handler({ id: 'ab' });
assert.equal(menus, 1);
S.connectFrom = 'a';
handler({ id: 'ab' });
assert.equal(menus, 1);

const connectSource = source.slice(source.indexOf('  function startConnect('), source.indexOf('  function cancelModes('));
const fitSource = source.slice(source.indexOf('  function fitView('), source.indexOf('  function placeAtCentre('));
let phone = true, folded = 0, hidden = 0, stopped = 0, fits = 0, lastFit;
const context = vm.createContext({
  S, isLesson: false, graph: () => g, isPhone: () => phone, inspector: { fold: () => { folded++; }, hide: () => { hidden++; } },
  scene: { stopCamera: () => { stopped++; }, fit: (padding, animate, opts) => { fits++; lastFit = opts; }, stats: () => ({ zoom: .9 }) },
  root: { classList: { add() {} } }, showCaption() {},
  freeArea: () => ({ l: 0, t: 100, r: 0, b: 240 }), mode: 'practice',
  performance: { now: () => 10000 },
});
vm.runInContext(connectSource + fitSource, context);
vm.runInContext("startConnect('a'); fitView();", context);
assert.equal(stopped, 1);
assert.equal(hidden, 1);
assert.equal(folded, 0);
assert.equal(fits, 0);
S.connectFrom = null;
vm.runInContext('fitView();', context);
assert.equal(fits, 1);
phone = false;
vm.runInContext("startConnect('a'); fitView();", context);
assert.equal(folded, 1);
assert.equal(fits, 1);
S.connectFrom = null;
vm.runInContext('fitView();', context);
assert.equal(fits, 2);
phone = true; S.selected = 'a';
vm.runInContext('fitView();', context);
assert.equal(lastFit.focusId, undefined, 'explicit fitting includes the graph even with a selected part');
S.booted = true;
const beforeAutomaticFit = fits;
vm.runInContext('fitView(true, null, true);', context);
assert.equal(fits, beforeAutomaticFit, 'opening a selection never automatically refits an editing camera');
assert.equal(lastFit.focusId, undefined);
S.booted = false;
S.editUntil = 11000;
const beforeEditFit = fits;
vm.runInContext('fitView(true, null, true);', context);
assert.equal(fits, beforeEditFit, 'entry fitting is suppressed during an edit');
S.editUntil = 0;
S.selected = null;

const camera = createCamera({ position: { set() {} }, scale: { set() {} } });
camera.resize(390, 844);
camera.fitBounds(-300, -100, 300, 100);
camera.update(100);
const before = { ...camera.center, zoom: camera.zoom };
camera.stop();
camera.update(500);
assert.deepEqual({ ...camera.center, zoom: camera.zoom }, before);
assert.equal(camera.moving, false);
const announcementSource = source.slice(source.indexOf('  let announcementTimer'), source.indexOf('  // ---- building actions'));
const pending = new Map(), announced = { textContent: '' };
let nextTimer = 0;
vm.runInNewContext(announcementSource + "announce('Web browser'); announce('Load balancer'); announce('Connect to Cache?');", {
  kbLive: announced, timers: new Set(),
  clearTimeout: id => pending.delete(id),
  later: fn => { const id = ++nextTimer; pending.set(id, fn); return id; },
});
assert.equal(pending.size, 1, 'superseded keyboard announcements are cancelled');
for (const fn of pending.values()) fn();
assert.equal(announced.textContent, 'Connect to Cache?', 'the live region describes the current target');
console.log('Touch interaction checks passed.');
