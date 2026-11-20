import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { runTrafficLab, TRAFFIC_DESIGNS } from '../sim/traffic-lab.js';

const json = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const catalog = createCatalog(Object.fromEntries(['elements', 'requests', 'events', 'world'].map(key => [key, json('../catalog/' + key + '.json')])));
const problem = json('../content/data/p/url-shortener.json');
const runs = Object.fromEntries(TRAFFIC_DESIGNS.map(({ id }) => [id, runTrafficLab(catalog, problem, id)]));
const { baseline, scale, edge } = runs;
assert.deepEqual(baseline, runTrafficLab(catalog, problem, 'baseline'));
assert.ok(baseline.spikeDropped > scale.spikeDropped);
assert.ok(scale.cost > baseline.cost);
assert.ok(edge.spikeDropped < baseline.spikeDropped);
assert.ok(edge.samples.some(sample => sample.nodes.cdn.rps > 0));
assert.ok(baseline.samples.some(sample => sample.nodes.api.status === 'overload'));
assert.equal(baseline.samples.length, scale.samples.length);
assert.equal(baseline.samples.length, edge.samples.length);
console.log(Object.fromEntries(Object.entries(runs).map(([key, { spikeDropped, spikeOffered, cost, availability }]) => [key, { spikeDropped, spikeOffered, cost, availability }])));
