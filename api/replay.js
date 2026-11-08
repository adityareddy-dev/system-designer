// Runs replays on a small pool of worker threads. Jobs wait in this thread, in two lanes (daily boards first), and go to a
// worker only when it is free, so a job's time limit counts its own run, never its wait. A stuck replay ends only its own
// worker; the jobs still waiting are untouched and go to a fresh one. Each player may have one job in the scorer at a
// time and each address a few, and addresses take turns (the next job comes from the address with the fewest jobs
// running, then the one served longest ago), so no small group can fill the queue or hold the workers for everyone else.
import { Worker } from 'node:worker_threads';
import { ReplayError } from './replay-core.js';

export function createReplayer({ workers = 2, timeoutMs = 10_000, maxQueue = 24, maxWaitMs = 12_000, startupTimeoutMs = 12_000, perKey = 1, perAddress = 3, workerUrl = new URL('./replay-worker.js', import.meta.url) } = {}) {
  const pool = [];                 // { w, job|null }
  const lanes = { daily: [], other: [] };
  const byKey = new Map();         // user -> jobs waiting or running
  const byAddress = new Map();     // address -> jobs waiting or running
  const runningAt = new Map();     // address -> jobs running
  const servedAt = new Map();      // address -> turn it was last served (kept while it has jobs)
  let turn = 0;
  let nextId = 1;
  let closed = false;

  const bump = (m, k, d) => { if (k == null) return; const n = (m.get(k) || 0) + d; if (n > 0) m.set(k, n); else m.delete(k); };
  const waiting = () => lanes.daily.length + lanes.other.length;
  const running = () => pool.filter((s) => s.job).length;

  function settle(job, err, result) {
    if (job.done) return;
    job.done = true;
    clearTimeout(job.timer);
    clearTimeout(job.waitTimer);
    bump(byKey, job.key, -1);
    bump(byAddress, job.address, -1);
    if (job.running) bump(runningAt, job.address, -1);
    if (job.address != null && !byAddress.has(job.address)) servedAt.delete(job.address);
    if (err) job.reject(err); else job.resolve(result);
  }

  function spawn() {
    const slot = { w: null, job: null, ready: false };
    const w = new Worker(workerUrl);
    slot.w = w;
    w.unref();
    w.on('message', (m) => {
      if (m?.ready === true) { slot.ready = true; dispatch(slot); return; }
      if (m?.ready === false) { gone(); w.terminate().catch(() => {}); return; }
      if (!m || m.id == null || !slot.job || slot.job.id !== m.id) return;
      const job = slot.job;
      slot.job = null;
      if (m.ok) settle(job, null, m.result); else settle(job, new ReplayError(m.code, m.message));
      pump();
    });
    const gone = () => {
      const i = pool.indexOf(slot);
      if (i >= 0) pool.splice(i, 1);
      if (slot.job) { const job = slot.job; slot.job = null; settle(job, new ReplayError('replay-failed', 'The design could not be replayed.')); }
      pump();
    };
    w.on('error', gone);
    w.on('exit', gone);
    pool.push(slot);
    return slot;
  }

  function expire(slot, job, code) {
    if (slot.job !== job) return;
    slot.job = null;
    const i = pool.indexOf(slot);
    if (i >= 0) pool.splice(i, 1);
    slot.w.terminate().catch(() => {});
    settle(job, new ReplayError(code, code === 'timeout' ? 'That design took too long to replay.' : 'The scorer is busy. Try again in a minute.'));
    pump();
  }

  function dispatch(slot) {
    const job = slot.job;
    if (!slot.ready || !job) return;
    clearTimeout(job.timer);
    job.timer = setTimeout(() => expire(slot, job, 'timeout'), timeoutMs);
    slot.w.postMessage({ id: job.id, payload: job.payload });
  }

  // Daily boards first; within a lane, the address with the fewest jobs running, then the one served longest ago, then the oldest job.
  function nextJob() {
    for (const lane of [lanes.daily, lanes.other]) {
      if (!lane.length) continue;
      let best = 0;
      let rank = [Infinity, Infinity];
      for (let i = 0; i < lane.length; i++) {
        const a = lane[i].address;
        const r = a == null ? [0, -1] : [runningAt.get(a) || 0, servedAt.get(a) ?? -1];
        if (r[0] < rank[0] || (r[0] === rank[0] && r[1] < rank[1])) { best = i; rank = r; }
      }
      const job = lane.splice(best, 1)[0];
      if (job.address != null) servedAt.set(job.address, turn++);
      return job;
    }
    return null;
  }

  function pump() {
    if (closed) return;
    while (waiting()) {
      let slot = pool.find((s) => !s.job);
      if (!slot && pool.length < workers) slot = spawn();
      if (!slot) return;
      const job = nextJob();
      clearTimeout(job.waitTimer);
      slot.job = job;
      job.running = true;
      bump(runningAt, job.address, 1);
      // Boot has a bounded wait of its own; replay time starts only after the worker is ready.
      job.timer = setTimeout(() => expire(slot, job, 'busy'), startupTimeoutMs);
      dispatch(slot);
    }
  }

  // payload: the design link; key: the player; address: where the request came from; daily: true for a daily board.
  function run(payload, { key = null, address = null, daily = false } = {}) {
    if (closed) return Promise.reject(new ReplayError('stopping', 'The scorer is restarting. Try again in a minute.'));
    if (key != null && (byKey.get(key) || 0) >= perKey) return Promise.reject(new ReplayError('scoring', 'Your last result is still being scored. Try again in a moment.'));
    if (address != null && (byAddress.get(address) || 0) >= perAddress) return Promise.reject(new ReplayError('scoring', 'Results from this network are still being scored. Try again in a moment.'));
    if (waiting() >= maxQueue) return Promise.reject(new ReplayError('busy', 'The scorer is busy. Try again in a minute.'));
    return new Promise((resolve, reject) => {
      const job = { id: nextId++, payload, key, address, resolve, reject, timer: 0, waitTimer: 0, done: false, running: false };
      bump(byKey, key, 1);
      bump(byAddress, address, 1);
      const lane = daily ? lanes.daily : lanes.other;
      lane.push(job);
      // a job that cannot start soon is answered instead of holding the request open
      job.waitTimer = setTimeout(() => {
        const i = lane.indexOf(job);
        if (i < 0) return;
        lane.splice(i, 1);
        settle(job, new ReplayError('busy', 'The scorer is busy. Try again in a minute.'));
      }, maxWaitMs);
      pump();
    });
  }

  async function close() {
    closed = true;
    for (const job of [...lanes.daily, ...lanes.other]) settle(job, new ReplayError('stopping', 'The scorer is restarting. Try again in a minute.'));
    lanes.daily.length = 0;
    lanes.other.length = 0;
    const slots = pool.splice(0);
    for (const s of slots) if (s.job) { const job = s.job; s.job = null; settle(job, new ReplayError('stopping', 'The scorer is restarting. Try again in a minute.')); }
    await Promise.all(slots.map((s) => s.w.terminate().catch(() => {})));
  }

  return { run, close, pending: () => waiting() + running(), stats: () => ({ waiting: waiting(), running: running(), workers: pool.length }) };
}
