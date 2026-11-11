// Fit to screen uses the canvas that panels leave free: corner panels are stepped around, not treated as whole bands.
import assert from 'node:assert/strict';
import { fitInsets } from '../render/fit.js';
import { createCamera } from '../render/camera.js';

const view = { w: 1440, h: 791 };
const base = { l: 72 + 46, t: 66 + 20, r: 46, b: 164 + 30 };
const card = { x: 1108, y: 64, width: 332, height: 46 };       // a folded card in the top right corner
const button = { x: 12, y: 64, width: 172, height: 48 };       // a single button in the top left corner
const gap = { x: 46, y: 20 };

function place(box, insets) {
  const camera = createCamera({ position: { set() {} }, scale: { set() {} } });
  camera.resize(view.w, view.h);
  camera.fitBounds(box.minX, box.minY, box.maxX, box.maxY, insets, false, { maxZ: 1.4 });
  const a = camera.worldToScreen(box.minX, box.minY), b = camera.worldToScreen(box.maxX, box.maxY);
  return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y, zoom: camera.zoom };
}
const clear = (rect, block) => rect.x >= block.x + block.width || rect.x + rect.width <= block.x || rect.y >= block.y + block.height || rect.y + rect.height <= block.y;
const inside = (rect) => rect.x >= base.l - 0.5 && rect.y >= base.t - 0.5 && rect.x + rect.width <= view.w - base.r + 0.5 && rect.y + rect.height <= view.h - base.b + 0.5;

const tall = { minX: 0, minY: 0, maxX: 1112, maxY: 1196 }, wide = { minX: 0, minY: 0, maxX: 2400, maxY: 500 }, small = { minX: 0, minY: 0, maxX: 300, maxY: 200 };

assert.deepEqual(fitInsets(tall, view, base, [], 1.4, gap), base, 'no corner panels: the plain insets');

for (const [name, box] of [['tall', tall], ['wide', wide], ['small', small]]) {
  for (const blocks of [[card], [button], [card, button]]) {
    const rect = place(box, fitInsets(box, view, base, blocks, 1.4, gap));
    assert(inside(rect), `${name}: the diagram stays inside the free canvas`);
    for (const block of blocks) assert(clear(rect, block), `${name}: the diagram clears every corner panel`);
    // never smaller than the old rule, which gave the whole band under a corner panel away
    const band = { ...base, t: Math.max(base.t, ...blocks.map(k => k.y + k.height + gap.y)) };
    const old = place(box, band);
    assert(rect.zoom >= old.zoom - 1e-9, `${name}: stepping around a corner panel never makes the diagram smaller`);
  }
}
{
  // a tall diagram does not hit the folded card at all once centred: it keeps the full height and the middle of the canvas
  const rect = place(tall, fitInsets(tall, view, base, [card], 1.4, gap));
  const free = place(tall, base);
  assert(Math.abs(rect.zoom - free.zoom) < 1e-9 && Math.abs(rect.x - free.x) < 0.5, 'a corner panel the diagram does not touch changes nothing');
}
{
  // a wide diagram must give way: it moves down just far enough, staying centred sideways
  const rect = place(wide, fitInsets(wide, view, base, [card], 1.4, gap));
  const middle = (base.l + view.w - base.r) / 2;
  assert(Math.abs(rect.x + rect.width / 2 - middle) < 0.5, 'a wide diagram stays centred between the side panels');
  assert(rect.y >= card.y + card.height + gap.y - 0.5, 'and starts below the folded card');
}
console.log('Fit steps around corner panels, never shrinks the diagram for them, and keeps it centred.');
