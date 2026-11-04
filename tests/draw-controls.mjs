// Count button regression: reaching 24 workers never changes the step size.
import assert from 'node:assert/strict';
import { stepCount } from '../ui/play/draw-controls.js';
let workers = 1;
for (let clicks = 0; clicks < 23; clicks++) workers = stepCount(workers, 1, 1, 100);
assert.equal(workers, 24);
for (const value of [19, 20, 21, 24, 45]) {
  assert.equal(stepCount(value, 1, 1, 100), value + 1);
  assert.equal(stepCount(value, -1, 1, 100), value - 1);
}
assert.equal(stepCount(1, -1, 1, 100), 1);
assert.equal(stepCount(100, 1, 1, 100), 100);
assert.equal(stepCount(0, -1, 0, 100), 0);
console.log('Drawing count checks passed.');
