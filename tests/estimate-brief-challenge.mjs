// Node DOM regressions for estimate controls, optional brief content and offline competition.
import assert from 'node:assert/strict';
import { renderNumbers } from '../ui/play/numbers.js';
import { renderClarify } from '../ui/play/clarify.js';
import { renderChallenge } from '../ui/shell/challenge.js';

class Element {
  constructor(tag) { this.tag = tag; this.nodeType = 1; this.children = []; this.attrs = {}; this.events = {}; this.style = { setProperty() {} }; this.dataset = {}; this.value = ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'value') this.value = String(v); }
  append(...kids) { this.children.push(...kids.map(k => k instanceof Element ? k : String(k))); }
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  get firstChild() { return this.children[0]; }
  removeChild(k) { this.children.splice(this.children.indexOf(k), 1); }
  insertBefore(k, ref) { this.children.splice(this.children.indexOf(ref), 0, k); }
  addEventListener(k, fn) { this.events[k] = fn; }
  get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); }
  get textContent() { return this.children.map(k => k instanceof Element ? k.textContent : k).join(''); }
  set textContent(v) { this.children = [String(v)]; }
  get classList() { return { remove() {}, add() {}, toggle() {} }; }
}
globalThis.Node = Element;
globalThis.document = { createElement: tag => new Element(tag), createTextNode: text => String(text) };
const all = el => [el, ...el.children.filter(k => k instanceof Element).flatMap(all)];
const host = new Element('div');
const guesses = {};
renderNumbers(host, { problem: { numbers: [{ label: 'App servers', value: 6, unit: 'servers', ask: true }, { label: 'Storage', value: 2, unit: 'TB', ask: true }] }, guesses });
const inputs = all(host).filter(el => el.attrs.type === 'number');
const sliders = all(host).filter(el => el.attrs.type === 'range');
const check = all(host).find(el => el.tag === 'button' && el.textContent === 'Check my guesses');
assert.equal(check.disabled, true);
inputs[0].value = '7.6'; inputs[0].events.input(); inputs[0].events.change();
assert.equal(guesses[0], 8);
assert.equal(inputs[0].value, '8');
assert.equal(inputs[0].attrs.step, '1');
inputs[1].value = '1.25'; inputs[1].events.input();
assert.equal(guesses[1], 1.25);
assert.equal(check.disabled, false);
sliders[0].value = '537'; sliders[0].events.input();
assert.equal(Number.isInteger(guesses[0]), true);
assert.equal(Number(inputs[0].value), guesses[0]);
assert.match(sliders[0].attrs['aria-valuetext'], /servers/);
assert.match(host.textContent, /1 servers/);
assert.match(host.textContent, /1k servers/);
inputs[0].value = ''; inputs[0].events.input();
assert.equal(guesses[0], null);
assert.equal(check.disabled, true);
inputs[0].value = '9999999'; inputs[0].events.input(); inputs[0].events.change();
assert.equal(guesses[0], Number(inputs[0].attrs.max));

for (const warm of [false, true]) {
  renderClarify(host, { problem: { title: 'Brief', brief: 'Design it.', clarify: [] }, revealed: new Set(), warm });
  assert.doesNotMatch(host.textContent, /null|undefined/);
  assert.equal(host.textContent.includes('First day is a warm-up'), warm);
}

const listeners = new Map();
let available = false, status = 'unreachable';
const problem = { id: 'test', title: 'Test', difficulty: 'Easy' };
const ctx = {
  bus: { on(name, fn) { listeners.set(name, fn); return () => listeners.delete(name); } },
  content: { problems: [problem] }, catalog: {},
  compete: { daily: { todayLocal: () => '2026-11-03', dailyFor: () => ({ problemId: 'test' }), applyVariant: p => p }, bests: {} },
  account: { available: () => available, state: () => ({ status }), leaderboardCard: () => ({ el: new Element('section'), destroy() {} }) },
};
const view = renderChallenge(host, ctx, { parts: ['challenge'], query: {} });
const offline = all(host).find(el => el.attrs.role === 'status');
assert.match(offline.textContent, /Playing offline/);
assert.match(offline.textContent, /Sign-in and leaderboards are unavailable/);
assert.doesNotMatch(host.textContent, /Sign in through/);
status = 'checking'; listeners.get('account')();
assert.match(offline.textContent, /Checking online competition/);
available = true; status = 'ready'; listeners.get('account')();
assert.equal(offline.hidden, true);
assert.match(host.textContent, /Sign in through the leaderboard above/);
available = false; listeners.get('account')();
assert.equal(offline.hidden, false);
view.destroy();
assert.equal(listeners.size, 0);
ctx.account = null;
const localView = renderChallenge(host, ctx, { parts: ['challenge'], query: {} });
assert.match(host.textContent, /Playing offline/);
assert.doesNotMatch(host.textContent, /Sign in through/);
localView.destroy();
console.log('Estimate, brief and offline challenge checks passed.');
