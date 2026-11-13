// Account events refresh the home line and identity inside the open profile menu.
import assert from 'node:assert/strict';
import { createBus } from '../core/bus.js';
import { createAccountUi } from '../account/ui.js';
import { renderHome } from '../ui/shell/home.js';
class Element {
  children = [];
  listeners = {};
  style = { setProperty() {} };
  dataset = {};
  classList = { add() {}, contains() { return false; }, toggle() {} };
  setAttribute(k, v) { this[k] = v; }
  removeAttribute(k) { delete this[k]; }
  append(...kids) { for (const c of kids) { if (c instanceof Element) c.parent = this; this.children.push(c); } }
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  replaceWith(el) { const i = this.parent.children.indexOf(this); this.parent.children[i] = el; el.parent = this.parent; }
  addEventListener(k, fn) { this.listeners[k] = fn; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
  get firstChild() { return this.children[0]; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); }
  focus() {}
  // the real home hero is written as HTML text: this stand-in turns each class in it into a child element
  set innerHTML(html) {
    const section = Object.assign(new Element(), { tag: 'section' });
    let into = section;
    for (const m of String(html).matchAll(/class="([^"]+)"/g)) {
      const el = Object.assign(new Element(), { className: m[1] });
      into.append(el);
      if (m[1] === 'sh-bench') into = el; // the bench holds the elements written after it
    }
    this.children = [section];
    section.parent = this;
  }
  get firstElementChild() { return this.children[0]; }
  getBoundingClientRect() { return { bottom: 50, right: 100 }; }
  all() { return [this, ...this.children.flatMap((c) => c instanceof Element ? c.all() : [])]; }
  querySelectorAll(selector) {
    return this.all().slice(1).filter(e => selector.startsWith('.') ? (e.className || '').split(' ').includes(selector.slice(1)) : e.tag === selector);
  }
  querySelector(selector) {
    if (selector.includes(',')) return null;
    const parts = selector.split(' ');
    const matches = (e, s) => s.startsWith('#') ? e.id === s.slice(1) : s.startsWith('.') ? (e.className || '').split(' ').includes(s.slice(1)) : e.tag === s;
    if (parts.length === 1) return this.all().slice(1).find((e) => matches(e, selector)) || null;
    const parent = this.querySelector(parts[0]);
    return parent?.querySelector(parts.slice(1).join(' ')) || null;
  }
}
globalThis.Node = Element;
const overlay = new Element();
globalThis.document = {
  createElement: (tag) => Object.assign(new Element(), { tag }), createTextNode: (text) => text,
  getElementById: () => overlay, documentElement: { clientWidth: 1000 },
  addEventListener() {}, removeEventListener() {},
};
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
const bus = createBus();
let user = null;
const api = {
  state: () => ({ available: true, user, sync: 'idle' }),
  isSignedIn: () => !!user, displayName: () => user?.name || '',
  async rename(name) { user = { ...user, name }; bus.emit('account'); },
};
const ctx = { bus, account: api, reducedMotion: () => true, content: { problems: [], lessons: [], groups: [] },
  progress: { stats: () => ({ solved: 0, stars: 0, lessonsDone: 0 }), all: () => ({}) }, store: { get: () => false } };
const home = new Element();
const view = renderHome(home, ctx);
const note = () => home.querySelector('.sh-gate-note');
assert.match(note().textContent, /stays in this browser/);
user = { name: 'Test player', providers: ['fake'] };
bus.emit('account');
assert.match(note().textContent, /across devices/);
const slot = new Element();
createAccountUi(ctx, api).mountHeader(slot);
slot.children[0].listeners.click();
const menu = overlay.children[0];
const input = menu.querySelector('#ac-name');
input.value = 'Adi R';
await menu.querySelector('.ac-rename').listeners.submit({ preventDefault() {} });
assert.equal(overlay.children[0], menu);
assert.equal(menu.querySelector('#ac-name'), input);
assert.equal(menu.querySelector('#ac-menu-title').textContent, 'Adi R');
assert.equal(menu.querySelector('.ac-avatar-letter').textContent, 'A');
assert.equal(slot.querySelector('.ac-avatar-letter').textContent, 'A');
assert.equal(slot.children[0]['aria-label'], 'Your account: Adi R');
user = null;
bus.emit('account');
assert.match(note().textContent, /stays in this browser/);
view.destroy();

// Email block: the toggle is on for a subscribed account, off for one that turned it off, and says what it does.
const words = (e) => e instanceof Element ? [e.textContent || '', ...e.children.map(words)].join(' ') : String(e);
const ui2 = createAccountUi(ctx, { ...api, state: () => ({ available: true, user: null, sync: 'idle', providers: { fake: true } }) });
const on = ui2.emailBlock({ email: 'a@example.com', marketingOptIn: true });
assert.match(words(on), /Email me new problems, tips and product news. Unsubscribe any time./);
assert.doesNotMatch(words(on), /short surveys/);
assert.match(words(on), /a@example\.com/);
assert.equal(on.querySelector('.ac-check').checked, '', 'on for a subscribed account');
assert.equal(ui2.emailBlock({ email: 'a@example.com', marketingOptIn: false }).querySelector('.ac-check').checked, undefined, 'off when turned off');

// Sign-in card: no opt-in box, no "what we store" copy, one agreement line with the privacy link.
const card = ui2.signInCard({});
const cardText = words(card);
assert.equal(card.querySelector('.ac-check'), null, 'no survey checkbox on sign-in');
assert.equal(card.querySelector('.ac-stored'), null);
assert.match(cardText, /By continuing you agree to the/);
assert.match(cardText, /Privacy policy/);
for (const bad of [/we store/i, /never sold/i, /nothing is sold/i, /no ads/i, /surveys/i]) assert.doesNotMatch(cardText, bad, String(bad));
console.log('Home sign-in wording, open-menu rename, email toggle and sign-in card passed.');
