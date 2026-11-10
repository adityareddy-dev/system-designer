// Camera transitions finish after delayed frames without magnifying a fling.
import assert from 'node:assert/strict';
import { createCamera } from '../render/camera.js';

const camera = () => {
  const c = createCamera({ position: { set() {} }, scale: { set() {} } });
  c.resize(800, 600);
  return c;
};
const delayed = camera();
delayed.fling(1, 0); delayed.update(60000);
assert(delayed.center.x > -210 && delayed.center.x < -190, 'a suspended tab keeps the finite fling distance');
assert.equal(delayed.moving, false);
delayed.fitBounds(0, 0, 400, 200, 40, true);
delayed.update(500);
assert.equal(delayed.moving, false, 'a delayed frame completes the fit');
const center = delayed.worldToScreen(200, 100);
assert(Math.abs(center.x - 400) < 1e-6 && Math.abs(center.y - 300) < 1e-6);
console.log('Delayed frames finish camera fits and preserve bounded fling distance.');
