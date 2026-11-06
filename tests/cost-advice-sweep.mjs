// Every catalog price dimension gets an applicable experiment and existing controls only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { costAdvice } from '../sim/cost-advice.js';
const elements = JSON.parse(fs.readFileSync('catalog/elements.json')).elements;
for (const el of elements) {
  const advice = costAdvice(el), c = el.cost || {};
  assert(advice.text.length > 30, el.id);
  if (advice.knob) assert(el.knobs.includes(advice.knob), el.id + ' exposes ' + advice.knob);
  if (c.perThousandUsers) { assert.match(advice.text, /per active user/); assert.doesNotMatch(advice.text, /Trim units|smaller size/); }
  if (c.perMillion) assert.match(advice.text, /per request/);
  if (c.perGB) assert.match(advice.text, /per GB transferred/);
  if (c.perGBMonth) assert.match(advice.text, /per GB stored/);
  if (c.perUnit && el.knobs.includes('units') && el.units.max > 1) assert.match(advice.text, /Units have a monthly price/);
  if (!el.knobs.includes('retentionDays')) assert.doesNotMatch(advice.text, /lower Keep for/);
  if (el.knobs.includes('retentionDays') && c.perGBMonth) assert.match(advice.text, /Keep for \(days\)/);
  if (el.knobs.includes('sampling')) assert.match(advice.text, /Sample rate/);
}
console.log(`Cost advice sweep: all ${elements.length} catalog parts and every price dimension.`);
