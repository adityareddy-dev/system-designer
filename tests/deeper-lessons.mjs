import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lessons } from '../content/lessons/index.js';
import { transferFor, transferCorrect } from '../content/transfers.js';

const expected = ['consistent-hashing','copies-quorums','leader-consensus','consistency-models','storage-engine','work-across-services','ordering-time','device-sync','privacy-design','metrics-systems','logs-traces','slos-error-budgets','multi-tenancy','lead-interview','simplest-design','running-migrations','team-boundaries'];
assert.deepEqual(lessons.slice(-17).map(l => l.id), expected, 'new tracks follow the existing sequence');
const calculations = [5/5,3+3-5,Math.floor(7/2)+1,2/50*1000,5*8,100*600/(250-100),6+4,20*4,20*86400,200*10*4/20,2000*10*500*20/1e6,.03/.005,3000/30,Math.round(24000000/86400*8),90000+1500*36,120000000/2000/3600,5*.5*52];
for (const [i,id] of expected.entries()) {
  const l = lessons.find(l => l.id === id);
  assert.equal(l.track, i < 13 ? 'Go deeper' : 'Lead the design');
  assert(l.minutes >= 5 && l.minutes <= 8);
  assert.equal(l.steps[0].kind, 'read');
  assert(l.steps.filter(s => s.kind === 'quiz').length >= 3);
  assert(l.steps.some(s => s.kind === 'numbers' && s.rows.length >= 3));
  const defenses = l.steps.filter(s => s.kind === 'defend');
  assert(defenses.length >= 2 && defenses.length <= 3);
  for (const d of defenses) {
    assert(d.q.includes('Follow-up:'));
    assert(d.checklist.length >= 3);
    assert(d.checklist.every(p => typeof p === 'string' && p.length > 12));
    assert(d.model.length > 250);
  }
  assert(l.steps.some(s => s.kind === 'demo' || s.title?.startsWith('Worked example:')));
  assert(!/[\u2014]/u.test(JSON.stringify(l)), id + ' uses plain punctuation');
  const transfer = transferFor(id);
  assert(transferCorrect(transfer, transfer.answer, calculations[i]), id + ' transfer arithmetic');
  assert(!transferCorrect(transfer, (transfer.answer + 1) % 3, calculations[i]));
  const svg = fs.readFileSync(new URL(`../assets/scenes/${id}.svg`, import.meta.url), 'utf8');
  assert(Buffer.byteLength(svg) < 6000, id + ' scene size');
  assert(svg.includes('viewBox="0 0 440 240"'));
  const tags = [...svg.matchAll(/<([a-zA-Z][\w-]*)\b/g)].map(m => m[1]);
  assert(tags.every(t => ['svg','path','rect','circle','ellipse','line','polyline','polygon','g','text','title'].includes(t)), id + ' scene vocabulary');
  assert(!/href=|style=|filter=/.test(svg));
  assert((svg.match(/<text\b/g) || []).length <= 3);
  const colors = new Set(['#F5F2E9','#FFFEFA','#182F40','#526575','#C7D1D0','#657A87','#244ED8','#E7ECFF','#006E68','#865400','#4051A1','#24643F','#875500','#B42C37']);
  assert([...svg.matchAll(/#[0-9A-Fa-f]{6}/g)].every(m => colors.has(m[0])));
}
assert.equal(8/9*8, 64/9);
assert.equal((10e6/15)*1.5*86400*15/1e12,1.296);
assert.equal(16*86400*14/1e6,19.3536);
console.log('17 deeper lessons: structure, reasoning, transfers, arithmetic and scene contract passed.');
