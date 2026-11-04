// The score dial must show the saved total before it is attached or any frame runs.
import assert from 'node:assert/strict';
import { dial } from '../ui/play/debrief.js';

class Element {
  nodeType = 1;
  children = [];
  attributes = {};
  setAttribute(key, value) { this.attributes[key] = String(value); }
  append(...children) { this.children.push(...children); }
}
globalThis.document = {
  createElement: () => new Element(),
  createElementNS: () => new Element(),
  createTextNode: (text) => ({ nodeType: 3, textContent: text }),
};
globalThis.requestAnimationFrame = () => { throw new Error('The final score must not wait for a frame'); };
const find = (root, cls) => root.className?.split(' ').includes(cls) || root.attributes?.class === cls
  ? root : root.children?.map((child) => find(child, cls)).find(Boolean);

for (const cards of [[0, 135, 164, 164], [0, 30, 30, 30], [400, 200, 200, 200], [0, 0, 0, 0]]) {
  const savedTotal = cards.reduce((sum, points) => sum + points, 0);
  const root = dial(savedTotal);
  assert.equal(find(root, 'pl-dial-n').textContent, savedTotal.toLocaleString('en-US'));
  assert.equal(root.attributes['aria-label'], `Score ${savedTotal} out of 1000`);
  const [filled, circumference] = find(root, 'pl-dial-arc').attributes['stroke-dasharray'].split(' ').map(Number);
  assert.ok(Math.abs(filled - savedTotal / 1000 * circumference) < 1e-9);
}
delete globalThis.document;
delete globalThis.requestAnimationFrame;
console.log('Debrief dial: final totals and arcs agree before the first frame.');
