// The remembered peak multiplier is explicitly an example in modules and shipped lesson data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import lesson from '../content/lessons/back-of-envelope.js';
const copies = [lesson, JSON.parse(fs.readFileSync(new URL('../content/data/l/back-of-envelope.json', import.meta.url)))];
for (const data of copies) {
  assert.match(data.takeaway, /example/i, 'three times average must be labelled an example, not a universal sizing rule');
  assert.match(data.takeaway, /traffic/i, 'choose the peak factor for the workload');
}
console.log('The peak shortcut is labelled as an example in the module and shipped lesson.');
