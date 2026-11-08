// Every catalog rejection names the attempted endpoints and gives a fitting next step.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { connectRule } from '../sim/graph.js';
const catalog = createCatalog(Object.fromEntries(['elements','requests','events','world'].map(k => [k, JSON.parse(fs.readFileSync(`catalog/${k}.json`, 'utf8'))])));
const names = [...catalog.elements.map(el => [el.name, el]), ['App servers', catalog.elementById.get('vm-fleet')]];
let rejected = 0;
for (const a of catalog.elements) for (const b of catalog.elements) {
  const r = connectRule(a, b);
  if (r.ok) continue;
  rejected++;
  assert(r.reason.includes(a.name) && r.reason.includes(b.name), `${a.id} → ${b.id}: ${r.reason}`);
  assert(r.reason.length > `${a.name} → ${b.name} is not supported. `.length, 'give a next step');
  if (a.kind === 'queue' && ['external', 'lookaside'].includes(b.kind)) {
    assert.match(r.reason, /Background workers/, `${a.name} needs a consumer to call ${b.name}, even when that service can send webhooks`);
  }
  const advice = r.reason.split('is not supported. ')[1];
  for (const [fromName, from] of names) for (const [toName, to] of names) {
    if (advice.includes(`${fromName} → ${toName}`)) assert(connectRule(from, to).ok, `${a.id} → ${b.id} recommends another rejected link: ${fromName} → ${toName}`);
  }
}
const reason = (a, b) => connectRule(catalog.elementById.get(a), catalog.elementById.get(b)).reason;
assert.doesNotMatch(reason('object-storage', 'kms'), /database/i);
assert.match(reason('object-storage', 'kms'), /App servers → Key management/);
assert.match(reason('object-storage', 'kms'), /App servers → Object storage/);
assert.doesNotMatch(reason('mobile-app', 'email-provider'), /Email provider → Mobile app/);
assert.match(reason('backups', 'kms'), /Backups.*store|storage/i);
assert.match(reason('metrics', 'pager'), /Alerting/);
console.log(`${rejected} rejected catalog pairs name both endpoints and explain their wiring roles.`);
