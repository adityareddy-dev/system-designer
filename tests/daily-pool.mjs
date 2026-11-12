// Daily pool status: size, no repeat in a round, position, done count, repeat with last-played date.
// Run from the app folder: node tests/daily-pool.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const { dailyFor, dailyPool, poolStatus, addDays } = await import(pathToFileURL(path.join(root, 'compete/daily.js')).href);
const { DAILY_SAFE } = await import(pathToFileURL(path.join(root, 'compete/daily-safe.js')).href);
const { problems } = JSON.parse(fs.readFileSync(path.join(root, 'content/data/lite.json'), 'utf8'));
let bad = 0;
const check = (ok, m) => { if (!ok) { bad++; console.log('FAIL', m); } };

const flagged = problems.filter((p) => p.daily && !DAILY_SAFE[p.id]?.skip).length;
const n = dailyPool(problems).length;
check(n > 0 && n === flagged, `pool size ${n} should equal daily-flagged problems ${flagged}`);
const base = poolStatus('2026-11-12', {}, problems);
check(base.poolSize === n, 'poolStatus poolSize matches the pool');

// A round starts on a day number divisible by n.
const epoch = '1970-01-01';
const roundStart = (r) => addDays(epoch, r * n);
const r0 = Math.floor(Date.UTC(2026, 10, 12) / 86400000 / n);
const start = roundStart(r0);
const ids = [];
for (let i = 0; i < n; i++) ids.push(dailyFor(addDays(start, i), problems).problemId);
check(new Set(ids).size === n, 'no problem repeats within a round');
check(poolStatus(start, {}, problems).positionInRound === 1, 'first day of a round is position 1');
check(poolStatus(addDays(start, n - 1), {}, problems).positionInRound === n, 'last day of a round is position n');
check(poolStatus(addDays(start, n), {}, problems).positionInRound === 1, 'next round restarts at 1');
check(poolStatus(addDays(start, n), {}, problems).round === r0 + 1, 'round number advances');
check(poolStatus(addDays(start, 5), {}, problems).positionInRound === 6, 'position on day 6');

// Fresh player: 0 done, no repeat.
for (const d of [start, addDays(start, 10), addDays(start, n + 3)]) {
  const s = poolStatus(d, {}, problems);
  check(s.doneInRound === 0 && !s.repeats && s.lastPlayed === null, `fresh player on ${d}`);
}

// Played three days of this round (map keyed by problem id, values are daily dates).
const played = {};
for (const i of [0, 1, 2]) played[ids[i]] = [addDays(start, i)];
check(poolStatus(addDays(start, 3), played, problems).doneInRound === 3, 'three done in this round');
check(poolStatus(addDays(start, 3), played, problems).repeats === false, 'not a repeat inside the same round');
check(poolStatus(addDays(start, n + 3), played, problems).doneInRound === 0, 'next round starts at 0 done');

// Repeat in the next round gets repeats=true with the last-played date.
const dNext = addDays(start, n + 2);
const again = dailyFor(dNext, problems).problemId;
const idx = ids.indexOf(again);
if (idx < 0) check(false, 'repeat problem should be in the earlier round');
else {
  const m = { [again]: [addDays(start, idx)] };
  const s = poolStatus(dNext, m, problems);
  check(s.repeats === true, 'repeat flagged');
  check(s.lastPlayed === addDays(start, idx), `last played ${s.lastPlayed} should be ${addDays(start, idx)}`);
  check(s.positionInRound === 3, 'position of the repeat day');
  const two = { [again]: [addDays(start, idx), addDays(start, idx + 1 > n - 1 ? idx : idx)] };
  check(poolStatus(dNext, two, problems).lastPlayed === addDays(start, idx), 'latest of several dates');
}

// Problems outside the pool or with bad dates are ignored.
check(poolStatus(start, { nope: [start], [ids[0]]: ['junk'] }, problems).doneInRound === 0, 'unknown id and bad date ignored');

console.log(bad ? `${bad} checks failed` : `daily pool: all checks passed (pool of ${n})`);
process.exit(bad ? 1 : 0);
