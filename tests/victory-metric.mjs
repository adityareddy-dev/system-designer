// A pass compares the measured repair, including a latency repair at unchanged availability.
import assert from 'node:assert/strict';
import { victoryMetric } from '../ui/play/victory.js';
const result = { slo: { availability: { actual: 1, target: .999 }, latency: { worstP99Ms: 150 }, cost: { perMonth: 800, budget: 1000 } } };
assert.equal(victoryMetric(result, { availability: .8, p99: 1200 }).label, 'Requests served');
const latency = victoryMetric(result, { availability: 1, p99: 1200 });
assert.equal(latency.label, 'Worst p99');
assert.equal(latency.format(latency.from), '1,200 ms');
assert.equal(latency.format(latency.value), '150 ms');
assert.equal(victoryMetric(result, { availability: 1, cost: 1400 }).label, 'Cost / month');
assert.equal(victoryMetric(result, null).from, null, 'a first run does not invent an earlier result');
console.log('Wins compare the measured limiting metric');
