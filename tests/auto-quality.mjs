// Automatic graphics quality: loading and capped displays never leave the canvas blurry; slow devices still step down.
import assert from 'node:assert/strict';
import { createQualityGovernor } from '../render/quality.js';

// Feed frames of a given length for a while; `frameMs` may depend on the current level.
function run(governor, clock, seconds, frameMs) {
  const end = clock.now + seconds * 1000;
  while (clock.now < end) {
    const dt = typeof frameMs === 'function' ? frameMs(governor.level) : frameMs;
    clock.now += dt;
    governor.sample(clock.now, dt);
  }
  return governor.level;
}
const fresh = (level = 'high') => { const clock = { now: 1000 }; return [createQualityGovernor({ level, now: clock.now }), clock]; };

{
  const [g, clock] = fresh();
  assert.equal(run(g, clock, 30, 16.7), 'high', 'a 60 Hz screen stays sharp');
}
{
  const [g, clock] = fresh();
  run(g, clock, 2.8, 90);
  assert.equal(run(g, clock, 20, 16.7), 'high', 'slow frames while the page loads do not lower the quality');
}
{
  const [g, clock] = fresh();
  run(g, clock, 5, 16.7);
  clock.now += 60000; g.sample(clock.now, 60000);
  run(g, clock, 1, 70);
  assert.equal(run(g, clock, 20, 16.7), 'high', 'a tab coming back from the background does not lower the quality');
}
{
  const [g, clock] = fresh();
  assert.equal(run(g, clock, 40, 33.4), 'high', 'a display capped at 30 frames a second ends on the sharp level: lowering it did not help');
  assert.equal(run(g, clock, 60, 33.4), 'high', 'and it is not lowered again');
}
{
  const [g, clock] = fresh();
  const slowDevice = level => ({ high: 60, medium: 42, low: 30 })[level];
  assert.equal(run(g, clock, 30, slowDevice), 'low', 'a device that gets faster with each step keeps stepping down');
  assert.equal(run(g, clock, 60, 16.7), 'high', 'and steps back up on a 60 Hz screen once frames are comfortable');
}
{
  const [g, clock] = fresh();
  const middling = level => ({ high: 40, medium: 17, low: 17 })[level];
  run(g, clock, 12, middling);
  assert.notEqual(g.level, 'low', 'one step down is enough when it restores smooth frames');
  // stepping back up makes it slow again: the retries back off instead of flickering between levels
  let changes = 0, last = g.level;
  for (let i = 0; i < 240; i++) { run(g, clock, 0.5, middling); if (g.level !== last) { changes++; last = g.level; } }
  assert(changes <= 10, `quality settles instead of flickering (${changes} changes in two minutes)`);
}
{
  const [g, clock] = fresh();
  // an idle canvas draws a frame now and then: sparse frames are never read as slow frames
  for (let i = 0; i < 200; i++) { clock.now += 400; g.sample(clock.now, 120); }
  assert.equal(g.level, 'high', 'sparse frames from an idle canvas do not lower the quality');
}
console.log('Automatic quality ignores loading, hidden tabs, idle frames and capped displays, and recovers on 60 Hz screens.');
