// Every estimate has an inclusive range and explicit display units; shares retain saved canonical values.
import assert from 'node:assert/strict';
import { problems } from '../content/problems/index.js';
import { estimateUnit, estimateFeedback } from '../ui/play/estimate-units.js';
for (const problem of problems) for (const row of problem.numbers) {
  const spec = estimateUnit(row);
  assert.ok(spec.unit && spec.value >= spec.lo && spec.value <= spec.hi, `${problem.id}: ${row.label}`);
  assert.equal(estimateFeedback(row, row.value).cls, 'ok');
  if (/^of /.test(row.unit)) {
    assert.equal(spec.factor, 100);
    assert.equal(spec.unit, '%');
    assert.equal(spec.hi, 100);
    assert.match(estimateFeedback(row, row.value / 100).text, /Unit slip/);
  }
}
console.log(`Estimate units and inclusive ranges checked across ${problems.length} problems.`);
