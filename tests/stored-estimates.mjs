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
function open(problemToRender = problem) {
  const host = new Element();
  renderNumbers(host, { problem: problemToRender, guesses: {}, progress });
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
const original = structuredClone(progress.get(problem.id));
const transfer = { ...problem, twistDay: true, numbers: [{ ask: true, label: 'New ceiling', value: 19531, unit: 'dollars/month' }] };
const transferGuesses = {};
const transferHost = new Element();
renderNumbers(transferHost, { problem: transfer, guesses: transferGuesses, progress });
assert.equal(inputs(transferHost)[0].value, '', 'transfer never reads the original estimate at the same index');
type(inputs(transferHost)[0], '19000');
assert.equal(transferGuesses[0], 19000);
renderNumbers(transferHost, { problem: transfer, guesses: transferGuesses, progress });
assert.equal(inputs(transferHost)[0].value, '19000', 'transfer keeps its own estimates within the session');
assert.deepEqual(progress.get(problem.id), original, 'transfer leaves original estimates and timestamps intact');
const malformed = sanitizeProgress({ problems: { bad: { estimatesAt: Date.now(), estimates: [Infinity, -1, '2', null, 1e99, 4] } } });
assert.deepEqual(malformed.problems.bad.estimates, [null, null, null, null, null, 4]);
const percentProblem = { id: 'search-autocomplete', numbers: [
  { ask: true, label: 'Reads', value: 57600, unit: 'req/s' },
  { ask: true, label: 'Servers', value: 10, unit: 'servers' },
  { ask: true, label: 'Cache hits', value: .9, unit: 'of reads' },
] };
fields = open(percentProblem);
type(fields[2], '0');
assert.deepEqual(progress.get(percentProblem.id).estimates, [null, null, 0]);
assert.deepEqual(open(percentProblem).map(e => e.value), ['', '', '0'], 'zero percent reopens while unanswered rows stay blank');
progress.record(percentProblem.id, { score: { total: 400 }, stars: 1 });
const zeroSnapshot = structuredClone(progress.exportAll());
const synced = mergeProgress(zeroSnapshot, {});
assert.deepEqual(synced.problems[percentProblem.id].estimates, [null, null, 0], 'sync preserves canonical zero');
progress = createProgress(createStore('percent-phone-test.'), createBus());
progress.importAll({ app: 'system-designer', ...synced });
assert.deepEqual(open(percentProblem).map(e => e.value), ['', '', '0']);
fields = open(percentProblem);
type(fields[2], '100');
assert.deepEqual(progress.get(percentProblem.id).estimates, [null, null, 1]);
type(fields[2], '');
assert.deepEqual(mergeProgress(zeroSnapshot, progress.exportAll()).problems[percentProblem.id].estimates, [null, null, null], 'clearing zero remains unanswered after sync');
console.log('Stored estimates: local reopen, clearing, results, sync, phone refill, and validation passed.');
