// Every catalog price dimension gets an applicable experiment and existing controls only.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { costAdvice } from '../sim/cost-advice.js';
import { createCatalog } from '../sim/catalog.js';
import { makeNode } from '../sim/graph.js';
import { compile } from '../sim/route.js';
import { computeCost, newCounters } from '../sim/cost.js';
const catalog = createCatalog(Object.fromEntries(['elements', 'requests', 'events', 'world'].map(k => [k, JSON.parse(fs.readFileSync(`catalog/${k}.json`))])));
const { elements, world } = catalog;
const env = { regionIds: world.regions.map(r => r.id), homeRegion: world.regions[0].id, ttlAdjust: {} };
const problem = { traffic: {}, requirements: { storageTb: 2, monthlyUsers: 10000, mix: { read: 1 } } };
function bill(el, knob, value) {
  const opts = ['units', 'tier'].includes(knob) ? { [knob]: value } : { knobs: { [knob]: value } };
  const node = makeNode(catalog, el, 'part', 0, 0, opts, env);
  const model = compile(catalog, { nodes: [node], edges: [] }, env, problem);
  const counters = newCounters(1);
  counters.inKbDay[0] = counters.writeKbDay[0] = 1e6;
  counters.reqDay[0] = 1e6; counters.gbDay[0] = 100;
  return computeCost({ model, problem, world }, counters).perMonth;
}
let experiments = 0;
for (const el of elements) {
  const advice = costAdvice(el), c = el.cost || {};
  assert(advice.text.length > 30, el.id);
  if (advice.knob) assert(el.knobs.includes(advice.knob), el.id + ' exposes ' + advice.knob);
  if (c.perThousandUsers) { assert.match(advice.text, /per active user/); assert.doesNotMatch(advice.text, /Trim units|smaller size/); }
  if (c.perMillion) assert.match(advice.text, /per request/);
  if (c.perGB) assert.match(advice.text, /per GB transferred/);
  if (c.perGBMonth) assert.match(advice.text, /per GB stored/);
  if (c.perUnit && el.knobs.includes('units') && el.units.max > 1) assert.match(advice.text, /Units have a monthly price/);
  if (!['queue', 'tap'].includes(el.kind) || !el.knobs.includes('retentionDays')) assert.doesNotMatch(advice.text, /lower Keep for/);
  if (['queue', 'tap'].includes(el.kind) && el.knobs.includes('retentionDays') && c.perGBMonth) assert.match(advice.text, /Keep for \(days\)/);
  if (el.knobs.includes('sampling')) assert.match(advice.text, /Sample rate/);
  const named = [
    /lower Keep for/.test(advice.text) && 'retentionDays',
    /smaller pool/.test(advice.text) && 'units',
    /smaller size/.test(advice.text) && 'tier',
    /Lower Sample rate/.test(advice.text) && 'sampling',
  ].filter(Boolean);
  if (advice.knob) assert(named.includes(advice.knob), el.id + ' names its suggested control');
  for (const knob of named) {
    const [low, high] = knob === 'units' ? [el.units.min, Math.min(el.units.max, el.units.min + 4)]
      : knob === 'tier' ? ['S', 'XL']
      : [Math.min(...catalog.knobs[knob].options), Math.max(...catalog.knobs[knob].options)];
    assert(bill(el, knob, low) < bill(el, knob, high), `${el.id}: lowering named ${knob} must lower the actual bill`);
    experiments++;
  }
  if (el.kind === 'store' && el.knobs.includes('retentionDays')) {
    assert.equal(bill(el, 'retentionDays', 1), bill(el, 'retentionDays', 3650), `${el.id}: store volume follows required storage`);
  }
}
console.log(`Cost advice sweep: all ${elements.length} catalog parts, every price dimension and ${experiments} measured control experiments.`);
