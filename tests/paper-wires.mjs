import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEdgeLayer } from '../render/edges.js';

class Graphics {
  calls = [];
  clear() { this.calls = []; return this; }
  moveTo(...p) { this.calls.push(['move', ...p]); return this; }
  lineTo(...p) { this.calls.push(['line', ...p]); return this; }
  rect(...p) { this.calls.push(['rect', ...p]); return this; }
  poly(...p) { this.calls.push(['poly', ...p]); return this; }
  stroke(p) { this.calls.push(['stroke', p]); return this; }
  fill(p) { this.calls.push(['fill', p]); return this; }
  destroy() {}
}

test('paper traffic uses thin ink dashes on a rounded obstacle route, including hot links', () => {
  let time = 0, reduced = false;
  const env = { kit: () => ({ look: 'paper', P: { ink: 0x141414 } }), reduced: () => reduced,
    visualTime: () => time, highContrast: () => false };
  const layer = createEdgeLayer({ Graphics }, { addChild() {} }, {}, env);
  layer.sync({ edges: [{ id: 'ab', from: 'a', to: 'b' }] });
  layer.updateGeometry(new Map([['a', { id: 'a', x: 0, y: 0 }], ['b', { id: 'b', x: 400, y: 180 }],
    ['obstacle', { id: 'obstacle', x: 180, y: 90 }]]));
  const v = layer.views.get('ab');
  layer.setLoad(v, 10000, 20, 0xff0000); layer.update(16);
  const strokes = () => v.g.calls.filter(c => c[0] === 'stroke').map(c => c[1]);
  assert(strokes().length > 0);
  assert(strokes().every(s => s.width === 2.5 && s.color === 0x141414), 'even overloaded links stay 2.5px ink without bands');
  assert(v.g.calls.filter(c => c[0] === 'move').length > 3, 'separate sketch pen dashes');
  assert(v.g.calls.some(c => c[0] === 'poly'), 'solid direction arrow');
  let diagonal = false;
  for (let i = 1; i < v.lut.xs.length; i++) if (Math.abs(v.lut.xs[i]-v.lut.xs[i-1]) > .01 && Math.abs(v.lut.ys[i]-v.lut.ys[i-1]) > .01) diagonal = true;
  assert(diagonal, 'routing corners must be rounded');
  for(let i=0;i<=v.lut.segs;i++) assert(!(v.lut.xs[i]>136 && v.lut.xs[i]<224 && v.lut.ys[i]>46 && v.lut.ys[i]<134), 'rounded route avoids the intervening part');
  const first = JSON.stringify(v.g.calls); layer.update(16);
  assert.equal(JSON.stringify(v.g.calls), first, 'frozen visual clock holds dashes still');
  time = 137; layer.update(16); assert.notEqual(JSON.stringify(v.g.calls), first, 'running clock advances dashes');
  reduced = true; time = 1200; layer.redrawAll(); layer.update(16); const still = JSON.stringify(v.g.calls);
  time = 1800; layer.update(16); assert.equal(JSON.stringify(v.g.calls), still, 'reduced motion freezes dashes');
  layer.destroy();
});
