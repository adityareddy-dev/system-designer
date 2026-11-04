// Check checkpoint content wiring and the written-answer discussion flow without a browser.
import assert from 'node:assert/strict';
import checkpoints from '../content/problems/correctness.js';
import { problemById } from '../content/problems/index.js';
import { renderCorrectness } from '../ui/play/correctness.js';

for (const [id, checkpoint] of Object.entries(checkpoints)) {
  assert.ok(problemById.has(id), `Unknown checkpoint problem: ${id}`);
  assert.equal(problemById.get(id).correctness, checkpoint);
  assert.ok(checkpoint.prompt.endsWith('?'), id);
  assert.ok(checkpoint.discussion.length > 150, id);
}
assert.match(checkpoints['concert-ticket-drop'].discussion, /token.*state/);
assert.match(checkpoints['airline-booking'].prompt, /15-minute/);
assert.match(checkpoints['notification-service'].discussion, /Without provider support/);
assert.equal(renderCorrectness(null), null);

class Element {
  constructor(tag) { this.tag = tag; this.nodeType = 1; this.children = []; this.events = {}; this.style = {}; this.value = ''; }
  setAttribute(key, value) { this[key] = value; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(event, handler) { this.events[event] = handler; }
}
globalThis.document = { createElement: (tag) => new Element(tag), createTextNode: (text) => ({ text }) };
try {
  const panel = renderCorrectness(checkpoints['concert-ticket-drop']);
  const answer = panel.children.find((e) => e.tag === 'label').children[1];
  const button = panel.children.find((e) => e.tag === 'button');
  const discussion = panel.children.at(-1);
  assert.equal(button.disabled, '');
  assert.equal(discussion.hidden, '');
  answer.value = '   ';
  answer.events.input();
  assert.equal(button.disabled, true);
  answer.value = 'A conditional transition checks the hold token and expiry.';
  answer.events.input();
  assert.equal(button.disabled, false);
  button.events.click();
  assert.equal(discussion.hidden, false);
  assert.equal(button.hidden, true);
  assert.equal(discussion.children[1].textContent, checkpoints['concert-ticket-drop'].discussion);
  assert.equal(answer.value, 'A conditional transition checks the hold token and expiry.');
} finally {
  delete globalThis.document;
}
console.log(`Correctness checkpoints passed: ${Object.keys(checkpoints).length} problems and written-answer flow.`);
