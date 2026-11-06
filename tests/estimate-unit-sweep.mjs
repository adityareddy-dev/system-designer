// Every estimate has an inclusive range and explicit display units; shares retain saved canonical values.
import assert from 'node:assert/strict';
import { problems } from '../content/problems/index.js';
import { estimateUnit, estimateFeedback } from '../ui/play/estimate-units.js';
import { renderNumbers } from '../ui/play/numbers.js';
class Element {
  nodeType = 1; children = []; listeners = {}; style = {}; value = '';
  classList = { remove() {}, toggle() {} };
  setAttribute(k,v) { this[k] = String(v); }
  append(...kids) { this.children.push(...kids); }
  replaceChildren(...kids) { this.children = kids; }
  addEventListener(k,fn) { this.listeners[k] = fn; }
}
globalThis.document = { createElement: () => new Element(), createTextNode: text => ({ textContent: text }) };
const all = el => [el, ...(el.children || []).flatMap(all)];
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
for (const problem of problems) {
  const host = new Element(), guesses = {};
  renderNumbers(host, { problem, guesses });
  const controls = all(host).filter(e => e.type === 'number');
  const sliders = all(host).filter(e => e.type === 'range');
  problem.numbers.filter(row => row.ask).forEach((row,i) => {
    const spec = estimateUnit(row), input = controls[i];
    assert(input['aria-label'].includes(spec.unit), problem.id);
    assert(sliders[i]['aria-label'].includes(spec.unit), problem.id);
    if (spec.percent) assert.equal(sliders[i].max, '100', 'the native slider uses percent too');
    assert(+input.min <= spec.value && +input.max >= spec.value);
    input.value = String(spec.value); input.valueAsNumber = spec.value; input.listeners.input();
  });
  problem.numbers.forEach((row,i) => { if (row.ask) assert(Math.abs(guesses[i] - row.value) < .00001, problem.id); });
}
const problem = problems.find(p => p.id === 'search-autocomplete'), host = new Element(), guesses = {};
renderNumbers(host, { problem, guesses, progress: { get: () => ({ estimates: [57600, 10, .9] }), saveEstimates() {} } });
const input = all(host).filter(e => e.type === 'number')[2];
assert.equal(String(input.value), '90', 'existing fraction saves reopen as percent');
input.value = '.9'; input.valueAsNumber = .9; input.listeners.input();
assert.ok(Math.abs(guesses[2] - .009) < 1e-12);
assert.equal(estimateFeedback(problem.numbers[2], guesses[2]).text, 'Unit slip: enter a percent. 0.9 as a fraction means 90%.');
delete globalThis.document;
console.log(`Estimate units and inclusive ranges checked across ${problems.length} problems.`);
