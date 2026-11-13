// Written checkpoints require complete choices and keep the player's answer separate from traffic scoring.
import assert from 'node:assert/strict';
import { problemById } from '../content/problems/index.js';
import { checkpointComplete, renderCheckpointForm, renderCorrectness } from '../ui/play/correctness.js';

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.nodeType = 1; this.style = {}; this.value = ''; }
  setAttribute(key, value) { this[key] = String(value); }
  addEventListener(key, fn) { this.events[key] = fn; }
  append(child) { this.children.push(child); }
  setCustomValidity(message) { this.validationMessage = message; }
  reportValidity() { return !this.validationMessage; }
}
globalThis.document = { createElement: (tag) => new Element(tag), createTextNode: (text) => ({ nodeType: 3, textContent: text }) };
const all = (node) => [node, ...(node.children || []).flatMap(all)];
const copy = (node) => all(node).map((el) => el.textContent || '').join(' ');
for (const id of ['bank-ledger', 'concert-ticket-drop', 'notification-service']) {
  const checkpoint = problemById.get(id).correctness;
  assert.ok(checkpoint.fields.length >= 3 && checkpoint.fields.length <= 5);
  assert.equal(checkpointComplete(checkpoint, { text: 'A transaction', choices: [] }), false);
  const answer = { text: 'Keep the operation atomic and reuse its key.', choices: checkpoint.fields.map((field) => field.correct) };
  assert.equal(checkpointComplete(checkpoint, answer), true);
  assert.equal(checkpointComplete(checkpoint, { ...answer, text: '   ' }), false);
  assert.equal(checkpointComplete(checkpoint, { ...answer, choices: [99, 99] }), false);
  let submitted;
  const form = renderCheckpointForm(checkpoint, {}, (value) => { submitted = value; }, () => {});
  form.events.submit({ preventDefault() {} });
  assert.equal(submitted, undefined);
  all(form).filter((el) => el.tag === 'select').forEach((el, i) => { el.value = String(answer.choices[i]); });
  all(form).find((el) => el.tag === 'input').value = answer.text;
  form.events.submit({ preventDefault() {} });
  assert.deepEqual(submitted, answer);
  // A wrong answer shows its explanation first, then the next submit still starts the day. Skip is offered.
  let late; const wrongForm = renderCheckpointForm(checkpoint, {}, (value) => { late = value; }, () => {});
  all(wrongForm).filter((el) => el.tag === 'select').forEach((el, i) => { el.value = String(1 - checkpoint.fields[i].correct); });
  all(wrongForm).find((el) => el.tag === 'input').value = answer.text;
  wrongForm.events.submit({ preventDefault() {} });
  assert.equal(late, undefined);
  wrongForm.events.submit({ preventDefault() {} });
  assert.ok(late, 'a wrong answer still lets the day start');
  assert.ok(copy(wrongForm).includes('Skip and start day'));
  const debrief = copy(renderCorrectness(checkpoint, submitted));
  assert.ok(debrief.includes(answer.text));
  assert.ok(debrief.includes(checkpoint.limits));
  assert.ok(debrief.includes(checkpoint.discussion));
  assert.equal((debrief.match(/Matches the reference/g) || []).length, checkpoint.fields.length);
  assert.ok(copy(renderCorrectness(checkpoint, { ...answer, choices: answer.choices.map((n) => 1 - n) })).includes('Revisit this choice'));
}
delete globalThis.document;
console.log('Correctness checkpoint checks passed.');
