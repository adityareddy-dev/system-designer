// The round count and the repeat date come from saved daily results, so any number of later practice runs leaves them in place.
// Run from the app folder: node tests/daily-retention.mjs
import assert from 'node:assert/strict';
import { createBests } from '../compete/bests.js';

const mem = new Map();
const store = { get: (k, d) => (mem.has(k) ? JSON.parse(JSON.stringify(mem.get(k))) : d), set: (k, v) => mem.set(k, JSON.parse(JSON.stringify(v))) };
let day = new Date('2026-08-29T12:00:00');
const bests = createBests(store, () => day);
const result = (total) => ({ score: { total }, stars: 2, passed: true, slo: {} });

bests.record('challenge:benefits-portal:daily-2026-08-29', result(900));
bests.record('challenge:url-shortener:daily-2026-09-02', result(800));
assert.deepEqual(bests.dailyPlays(), { 'benefits-portal': ['2026-08-29'], 'url-shortener': ['2026-09-02'] });

// 450 later practice runs on 450 different keys: far beyond the 200-entry history and the 400-key table
day = new Date('2026-11-12T12:00:00');
for (let i = 0; i < 450; i++) bests.record(`practice:problem-${i}:practice`, result(500 + (i % 50)));
assert.equal(bests.history(200).some((x) => x.key.startsWith('challenge:')), false, 'the capped history no longer lists the daily runs');
assert.deepEqual(bests.dailyPlays(), { 'benefits-portal': ['2026-08-29'], 'url-shortener': ['2026-09-02'] }, 'the daily results survive');
assert(bests.get('challenge:benefits-portal:daily-2026-08-29'), 'the best is still saved');

// the Challenge screen reads exactly this map
const { poolStatus } = await import('../compete/daily.js');
const fs = await import('node:fs');
const { problems } = JSON.parse(fs.readFileSync(new URL('../content/data/lite.json', import.meta.url), 'utf8'));
const st = poolStatus('2026-11-12', bests.dailyPlays(), problems);
assert.equal(typeof st.doneInRound, 'number');
console.log('daily retention: ok');
