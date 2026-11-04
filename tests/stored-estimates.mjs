// Stored estimates survive navigation, results, and progress sync between devices.
import assert from 'node:assert/strict';
import { createStore } from '../core/store.js';
import { createBus } from '../core/bus.js';
import { createProgress } from '../ui/shell/progress.js';
import { mergeProgress, sanitizeProgress } from '../account/merge.js';
import { renderNumbers } from '../ui/play/numbers.js';

class Element {
  nodeType = 1;
  children = [];
  listeners = {};
  classList = { remove() {}, toggle() {} };
  setAttribute(k, v) { this[k] = v; }
  append(...kids) { this.children.push(...kids); }
  replaceChildren(...kids) { this.children = kids; }
  addEventListener(k, fn) { this.listeners[k] = fn; }
}
globalThis.document = { createElement: () => new Element(), createTextNode: (text) => ({ text }) };
const bus = createBus();
const store = createStore('estimates-test.');
let progress = createProgress(store, bus);
let updates = 0;
bus.on('progress:updated', () => updates++);
const problem = { id: 'url-shortener', numbers: [
  { ask: true, label: 'Reads', value: 5000, unit: 'req/s' },
  { ask: true, label: 'Servers', value: 8, unit: 'servers' },
  { ask: true, label: 'Storage', value: 2, unit: 'TB' },
] };
const inputs = (el) => [el, ...el.children.flatMap((c) => c instanceof Element ? inputs(c) : [])].filter((e) => e.type === 'number');
function open() {
  const host = new Element();
  renderNumbers(host, { problem, guesses: {}, progress });
  return inputs(host);
}
function type(input, value) {
  input.value = value;
  input.valueAsNumber = value === '' ? NaN : Number(value);
  input.listeners.input();
}
let fields = open();
type(fields[0], '5000');
type(fields[1], '8');
assert.equal(updates, 2);
progress = createProgress(store, bus);
assert.deepEqual(open().map((e) => e.value), ['5000', '8', '']);
assert.equal(progress.get(problem.id).attempts, 0);
progress.record(problem.id, { score: { total: 400 }, stars: 1 });
assert.deepEqual(progress.get(problem.id).estimates, [5000, 8, null]);
const old = structuredClone(progress.exportAll());
fields = open();
type(fields[0], '');
type(fields[2], '3.5');
const latest = progress.exportAll();
const merged = mergeProgress(old, latest);
assert.deepEqual(merged.problems[problem.id].estimates, [null, 8, 3.5]);
assert.deepEqual(merged, mergeProgress(latest, old));
assert.deepEqual(merged, mergeProgress(merged, latest));
const tied = structuredClone(latest);
tied.problems[problem.id].estimates = [100, 2, null];
assert.deepEqual(mergeProgress(tied, latest), mergeProgress(latest, tied));
assert.deepEqual(mergeProgress(old, {} ).problems[problem.id].estimates, [5000, 8, null]);
const phone = createProgress(createStore('phone-test.'), createBus());
phone.importAll({ app: 'system-designer', ...merged });
progress = phone;
assert.deepEqual(open().map((e) => e.value), ['', '8', '3.5']);
assert.equal(progress.get(problem.id).bestScore, 400);
assert.equal(progress.get('other-problem'), null);
const malformed = sanitizeProgress({ problems: { bad: { estimatesAt: Date.now(), estimates: [Infinity, -1, '2', null, 1e99, 4] } } });
assert.deepEqual(malformed.problems.bad.estimates, [null, null, null, null, null, 4]);
console.log('Stored estimates: local reopen, clearing, results, sync, phone refill, and validation passed.');
