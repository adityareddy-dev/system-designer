// Reference previews show effective defaults and explicit settings without changing designs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { referenceSettings } from '../ui/play/reference-settings.js';

const catalog = createCatalog(Object.fromEntries(['elements', 'requests', 'events', 'world'].map((name) =>
  [name, JSON.parse(fs.readFileSync(new URL(`../catalog/${name}.json`, import.meta.url), 'utf8'))])));
const node = { type: 'cache', units: 4, zones: 2, tier: 'L', knobs: { coalesce: true, ttlSec: 60 } };
const before = JSON.stringify(node);
const text = referenceSettings(node, catalog, 'eu');
assert.match(text, /Units: 4/);
assert.match(text, /Zones: 2/);
assert.match(text, /Size: L/);
assert.ok(text.includes(catalog.world.regions.find((r) => r.id === 'eu').name));
assert.match(text, /Collapse misses: On/);
assert.match(text, /Keep answers for: 60/);
assert.equal(JSON.stringify(node), before);
for (const el of catalog.elements) {
  const defaults = referenceSettings({ type: el.id }, catalog);
  assert.ok(!defaults.includes('undefined') && !defaults.includes('[object Object]'), el.id);
  for (const key of ['ttlSec', 'retentionDays', 'replication']) {
    if (el.knobs.includes(key) && el.params?.[key] != null) {
      assert.ok(defaults.includes(`${catalog.knobs[key].label}: ${el.params[key]}`), el.id);
    }
  }
}
assert.match(referenceSettings({ type: catalog.elements.find((el) => el.knobs.includes('autoscale')).id, knobs: { autoscale: { on: true, min: 3, max: 12, targetUtil: 0.6 } } }, catalog), /3 to 12, target 60% busy/);
console.log('Reference settings checks passed.');

