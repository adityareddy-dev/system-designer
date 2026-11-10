// A served-traffic lesson check explains a simultaneous speed miss without hiding it.
import assert from 'node:assert/strict';
import { goalPassed } from '../ui/play/goal-feedback.js';
const goal = { metric: 'availability', op: '>=', value: .99, holdSec: 60 };
const slow = goalPassed(goal, 1, 'App servers', { slo: { latency: { p99Ms: 965, targetMs: 300, shareOk: .25 } } });
assert.match(slow, /Requests served 100%/);
assert.match(slow, /60 seconds/);
assert.match(slow, /965 ms.*misses.*300 ms/);
assert.match(slow, /complete.*slow/i);
assert.match(slow, /earlier minutes/i);
const fast = goalPassed(goal, 1, 'App servers', { slo: { latency: { p99Ms: 110, targetMs: 300, shareOk: .25 } } });
assert.match(fast, /110 ms.*meets.*300 ms/);
assert.doesNotMatch(fast, /misses/);
console.log('Lesson goal feedback distinguishes served traffic, current speed and earlier history.');
