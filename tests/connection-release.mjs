// Connections use the release position even when the last movement event is delayed.
import assert from 'node:assert/strict';
import { createInput } from '../render/input.js';

const previousWindow = globalThis.window;
globalThis.window = { addEventListener() {}, removeEventListener() {} };
try {
  for (const pointerType of ['mouse', 'touch']) for (const [move, release, target] of [
    [null, 300, 'cache'], [300, 500, 'store'], [300, 700, null], [300, 100, null],
  ]) {
    const handlers = new Map(), events = [];
    const list = [{ id: 'app', x: 100, y: 100 }, { id: 'cache', x: 300, y: 100 }, { id: 'store', x: 500, y: 100 }];
    const canvas = {
      style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 300 }),
      addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener() {},
      setPointerCapture() {}, releasePointerCapture() {},
    };
    const input = createInput(canvas, { addEventListener() {}, removeEventListener() {} }, {
      camera: { zoom: 1, stop() {}, screenToWorld: (x, y) => ({ x, y }) },
      nodes: { list, views: new Map(list.map(n => [n.id, n])), setHover() {},
        hit: (x, y) => list.find(n => Math.abs(n.x - x) <= 36 && Math.abs(n.y - y) <= 36) },
      edges: { hit: () => null }, editable: () => true, ghost: { type: () => null },
      ui: { drawBand() {}, clearBand() {}, clearGuides() {}, setPortRing() {} },
      emit: (name, payload) => events.push({ name, payload }),
    });
    const pointer = x => ({ pointerId: 1, pointerType, button: 0, clientX: x, clientY: 100 });
    try {
      handlers.get('pointerdown')(pointer(136));
      assert.equal(input.mode, 'connect');
      if (move !== null) handlers.get('pointermove')(pointer(move));
      handlers.get('pointerup')(pointer(release));
      assert.deepEqual(events, target ? [{ name: 'connect', payload: { from: 'app', to: target } }] : [],
        `${pointerType}: release at ${release} after movement at ${move}`);
      assert.equal(input.mode, 'idle');
    } finally { input.destroy(); }
  }
  console.log('Mouse and touch connections use the release target and reject empty or self drops.');
} finally {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
}
