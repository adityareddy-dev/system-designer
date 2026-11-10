// The scorer pool on its own, with a stand-in worker: time limits count from the start of a job, a stuck job ends only its
// own worker, one job per player and a few per address, the daily lane first, and a full or slow queue answers "busy".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReplayer } from '../replay.js';

const workerUrl = new URL('./fixtures/slow-worker.js', import.meta.url);
const codeOf = (p) => p.then(() => 'ok', (e) => e.code);

test('worker startup does not consume the replay time limit', async () => {
  const delayed = new URL('./fixtures/delayed-worker.js', import.meta.url);
  const r = createReplayer({ workers: 1, timeoutMs: 400, workerUrl: delayed });
  try { assert.equal(await codeOf(r.run('work:10')), 'ok'); }
  finally { await r.close(); }
});

test('a worker that cannot start promptly returns busy and releases its job', async () => {
  const delayed = new URL('./fixtures/delayed-worker.js', import.meta.url);
  const r = createReplayer({ workers: 1, startupTimeoutMs: 100, workerUrl: delayed });
  try {
    assert.equal(await codeOf(r.run('work:10')), 'busy');
    assert.equal(r.pending(), 0);
  } finally { await r.close(); }
});

test('the time limit counts from when a job starts, not from when it was queued', async () => {
  const r = createReplayer({ workers: 1, timeoutMs: 700, workerUrl });
  try {
    const jobs = [1, 2, 3, 4].map((i) => r.run('work:300', { key: 'u' + i, address: 'a' + i }));
    const out = await Promise.all(jobs.map(codeOf));
    assert.deepEqual(out, ['ok', 'ok', 'ok', 'ok'], 'four 300 ms jobs in a row, 1.2 s in all, each within its 700 ms');
  } finally { await r.close(); }
});

test('a stuck job ends only its own worker; the jobs waiting behind it still run', async () => {
  const r = createReplayer({ workers: 1, timeoutMs: 400, workerUrl });
  try {
    const stuck = r.run('hang', { key: 'bad', address: 'x' });
    const after = [r.run('work:50', { key: 'u1', address: 'y' }), r.run('work:50', { key: 'u2', address: 'z' })];
    assert.equal(await codeOf(stuck), 'timeout');
    assert.deepEqual(await Promise.all(after.map(codeOf)), ['ok', 'ok']);
    assert.equal(r.pending(), 0);
  } finally { await r.close(); }
});

test('one job at a time per player, and a few per address', async () => {
  const r = createReplayer({ workers: 1, perAddress: 2, workerUrl });
  try {
    const first = r.run('work:200', { key: 'p1', address: 'net-1' });
    assert.equal(await codeOf(r.run('work:10', { key: 'p1', address: 'net-2' })), 'scoring', 'same player, second job');
    const second = r.run('work:10', { key: 'p2', address: 'net-1' });
    assert.equal(await codeOf(r.run('work:10', { key: 'p3', address: 'net-1' })), 'scoring', 'third job from one address');
    const other = r.run('work:10', { key: 'p4', address: 'net-3' });
    assert.deepEqual(await Promise.all([first, second, other].map(codeOf)), ['ok', 'ok', 'ok']);
    assert.equal(await codeOf(r.run('work:10', { key: 'p1', address: 'net-1' })), 'ok', 'free again once scored');
  } finally { await r.close(); }
});

test('daily boards go first; a full queue and a long wait answer busy', async () => {
  const r = createReplayer({ workers: 1, maxQueue: 3, maxWaitMs: 600, workerUrl });
  try {
    await r.run('work:1');
    const order = [];
    const busy = r.run('work:250', { key: 'a', address: '1' }).then((x) => order.push('first'));
    await new Promise((res) => setTimeout(res, 30));
    const practice = r.run('work:10', { key: 'b', address: '2' }).then(() => order.push('practice'));
    const daily = r.run('work:10', { key: 'c', address: '3', daily: true }).then(() => order.push('daily'));
    const third = r.run('work:400', { key: 'd', address: '4' });
    assert.equal(await codeOf(r.run('work:10', { key: 'e', address: '5' })), 'busy', 'queue of 3 is full');
    await Promise.all([busy, practice, daily]);
    assert.deepEqual(order, ['first', 'daily', 'practice']);
    assert.equal(await codeOf(third), 'ok');
    // two 400 ms jobs ahead: the one that waits past 600 ms is answered busy instead of holding its request open
    const long = [r.run('work:400', { key: 'f', address: '6' }), r.run('work:400', { key: 'g', address: '7' }), r.run('work:10', { key: 'h', address: '8' })];
    assert.deepEqual(await Promise.all(long.map(codeOf)), ['ok', 'ok', 'busy']);
  } finally { await r.close(); }
});

test('two workers score two jobs at once', async () => {
  const r = createReplayer({ workers: 2, workerUrl });
  try {
    await Promise.all(['warm1', 'warm2'].map(key => r.run('work:1', { key })));
    const t0 = Date.now();
    await Promise.all([r.run('work:300', { key: 'x' }), r.run('work:300', { key: 'y' })]);
    assert.ok(Date.now() - t0 < 550, `ran side by side (${Date.now() - t0} ms)`);
  } finally { await r.close(); }
});

test('addresses take turns: a newcomer does not wait behind one address\'s queue', async () => {
  const r = createReplayer({ workers: 1, perAddress: 3, workerUrl });
  try {
    const order = [];
    const tag = (p, name) => p.then(() => order.push(name), () => order.push(name + '!'));
    const jobs = [
      tag(r.run('work:150', { key: 'e1', address: 'evil' }), 'evil-1'),
      tag(r.run('work:150', { key: 'e2', address: 'evil' }), 'evil-2'),
      tag(r.run('work:150', { key: 'e3', address: 'evil' }), 'evil-3'),
    ];
    await new Promise((res) => setTimeout(res, 20));
    jobs.push(tag(r.run('work:10', { key: 'g1', address: 'good' }), 'good'));
    await Promise.all(jobs);
    assert.deepEqual(order, ['evil-1', 'good', 'evil-2', 'evil-3']);
  } finally { await r.close(); }
});
