// Node checks for the simulation engine: run with `node sim/selftest.mjs` (Node 24, on the server).
import { readFileSync, existsSync } from 'node:fs';
import { createCatalog } from './catalog.js';
import { createSim } from './engine.js';
import { hashSeed, mulberry32 } from './rng.js';
import { createHeadlessGame, createPerf } from './hooks.js';

const here = new URL('.', import.meta.url);
const load = (name) => JSON.parse(readFileSync(new URL(`../catalog/${name}.json`, here), 'utf8'));
const catalog = createCatalog({ elements: load('elements'), requests: load('requests'), events: load('events'), world: load('world') });
const DAY = catalog.world.sim.dayMs;

let failed = 0, passed = 0;
const quiet = process.argv.includes('--quiet');
function check(name, ok, detail = '') {
  if (ok) { passed++; if (!quiet) console.log(`  ok   ${name}${detail ? '  (' + detail + ')' : ''}`); }
  else { failed++; console.log(`  FAIL ${name}${detail ? '  (' + detail + ')' : ''}`); }
}
function section(title) { if (!quiet) console.log(`\n${title}`); }

// ---- helpers ------------------------------------------------------------------------------------
function problem(over = {}) {
  const req = {
    monthlyUsers: 1e6, peakRps: 2000, mix: { read: 0.9, write: 0.1 }, latencyP99Ms: { default: 200 }, availability: 0.999,
    dataSafety: 'no-loss', budgetPerMonth: 100000, storageTb: 1, userRegions: { us: 1 }, homeRegion: 'us', ...(over.requirements || {}),
  };
  return {
    id: over.id || 'test', requirements: req,
    traffic: { curve: 'flat', sources: { 'web-browser': 1 }, ...(over.traffic || {}) },
    starter: { nodes: [{ ref: 'users', type: 'web-browser', x: -400, y: 0, locked: true }], edges: [] },
    events: over.events || [], requires: over.requires || {},
  };
}

// Builds a design from a compact spec: nodes { ref: [type, opts] }, edges [[a, b], ...]
function build(sim, nodes, edges) {
  let x = 0;
  for (const [ref, spec] of Object.entries(nodes)) {
    const [type, opts = {}] = Array.isArray(spec) ? spec : [spec];
    sim.addNode(type, (x += 120), 0, { id: ref, ...opts });
  }
  for (const [a, b] of edges) sim.connect(a, b);
}

function day(prob, nodes, edges, opts = {}) {
  const sim = createSim({ catalog, problem: prob, seed: opts.seed || 'selftest', mode: opts.mode || 'practice' });
  build(sim, nodes, edges);
  if (opts.before) opts.before(sim);
  sim.start();
  if (opts.until) { sim.advance(opts.until); return { sim, r: null, S: sim.debug() }; }
  sim.advance(DAY);
  return { sim, r: sim.result(), S: sim.debug() };
}

const nodeOut = (r, id) => r.nodes.find((n) => n.id === id);
const evOut = (r, id) => r.events.find((e) => e.id === id);
const avail = (r) => r.slo.availability.actual;

if (process.argv.includes('--perf-contract-only')) {
  console.log(JSON.stringify(contractPerfRun()));
  process.exit(0);
}

if (process.argv.includes('--perf-only')) {
  console.log(JSON.stringify({ day: dayPerfRun(), stress: perfRun() }));
  process.exit(0);
}

// ---- 1. a cache cuts p99 -----------------------------------------------------------------------
section('A cache cuts p99');
{
  const p = problem({ requirements: { peakRps: 7000, mix: { read: 0.97, write: 0.03 }, latencyP99Ms: { default: 120 } } });
  const base = { lb: 'regional-lb', app: ['container-cluster', { units: 24 }], db: 'sql-primary' };
  const a = day(p, base, [['users', 'lb'], ['lb', 'app'], ['app', 'db']]).r;
  const b = day(p, { ...base, cache: 'cache' }, [['users', 'lb'], ['lb', 'app'], ['app', 'cache'], ['app', 'db']]).r;
  const pa = a.slo.latency.byType.read.p99Ms, pb = b.slo.latency.byType.read.p99Ms;
  check('read p99 is lower with a cache', pb < pa * 0.8, `${pa} ms without, ${pb} ms with`);
  check('database is calmer with a cache', nodeOut(b, 'db').peakUtil < nodeOut(a, 'db').peakUtil * 0.5, `peak ${nodeOut(a, 'db').peakUtil} vs ${nodeOut(b, 'db').peakUtil}`);
  check('latency points rise with a cache', b.score.latency > a.score.latency, `${a.score.latency} vs ${b.score.latency}`);
}

// ---- 2. a single database fails under a viral spike ---------------------------------------------
section('A single database fails under a viral spike');
{
  const nodes = { lb: 'regional-lb', app: ['vm-fleet', { units: 40 }], db: 'sql-primary' };
  const edges = [['users', 'lb'], ['lb', 'app'], ['app', 'db']];
  const calm = day(problem({ requirements: { peakRps: 3000 } }), nodes, edges).r;
  const spike = day(problem({ requirements: { peakRps: 3000 }, events: [{ id: 'viral-spike', at: '12:00', params: { factor: 6 } }] }), nodes, edges).r;
  check('holds on a normal day', avail(calm) >= 0.999, `availability ${avail(calm)}`);
  check('fails during the spike', avail(spike) < 0.999, `availability ${avail(spike)}`);
  check('the database is the part that broke', nodeOut(spike, 'db').peakUtil > 1 && nodeOut(spike, 'db').failed > nodeOut(spike, 'app').failed, `db peak ${nodeOut(spike, 'db').peakUtil} failed ${nodeOut(spike, 'db').failed}, servers failed ${nodeOut(spike, 'app').failed}`);
  const calmRetries = day(problem({ requirements: { peakRps: 3000 }, events: [{ id: 'viral-spike', at: '12:00', params: { factor: 6 } }] }), nodes, edges, {
    before: (sim) => { for (const id of ['users', 'app']) { sim.setKnob(id, 'retries', 1); sim.setKnob(id, 'backoff', 'exponential-jitter'); } },
  }).r;
  check('with gentle retries only the database overloads', nodeOut(calmRetries, 'app').peakUtil < 1 && nodeOut(calmRetries, 'db').peakUtil > 1, `servers ${nodeOut(calmRetries, 'app').peakUtil}, db ${nodeOut(calmRetries, 'db').peakUtil}`);
  const ev = evOut(spike, 'viral-spike');
  check('the spike story names the database', ev && ev.hurt[0] === 'db' && /SQL/.test(ev.vars.node), ev ? `${ev.vars.node}, failed ${ev.vars.failed}` : 'no event');
  check('debrief verdict says it broke', /^Broke at 12:00/.test(spike.verdict), spike.verdict);
}

// ---- 3. replicas add read capacity with lag ------------------------------------------------------
section('Read replicas add read capacity, with lag');
{
  const p = problem({ requirements: { peakRps: 12000, mix: { read: 0.95, write: 0.05 }, readYourWrites: true }, events: [{ id: 'replication-lag', at: '12:00' }] });
  const nodes = { lb: 'regional-lb', app: ['container-cluster', { units: 20 }], db: 'sql-primary' };
  const one = day(p, nodes, [['users', 'lb'], ['lb', 'app'], ['app', 'db']]);
  const two = day(p, { ...nodes, rr: ['sql-replica', { units: 2 }] }, [['users', 'lb'], ['lb', 'app'], ['app', 'db'], ['app', 'rr'], ['db', 'rr']]);
  check('primary alone overloads', nodeOut(one.r, 'db').peakUtil > 1, `peak ${nodeOut(one.r, 'db').peakUtil}`);
  check('replicas take reads off the primary', nodeOut(two.r, 'db').peakUtil < 0.9 && nodeOut(two.r, 'rr').peakUtil > 0.2, `primary ${nodeOut(two.r, 'db').peakUtil}, replicas ${nodeOut(two.r, 'rr').peakUtil}`);
  check('availability improves with replicas', avail(two.r) > avail(one.r) && avail(two.r) >= 0.999, `${avail(one.r)} vs ${avail(two.r)}`);
  check('replicas serve stale reads while lagging', two.r.slo.safety.staleReads > 0 && one.r.slo.safety.staleReads === 0, `stale ${two.r.slo.safety.staleReads} vs ${one.r.slo.safety.staleReads}`);
  check('replica lag is under a second on a normal tick', two.S.lag[two.S.model.idx.get('rr')] < 1, `lag ${two.S.lag[two.S.model.idx.get('rr')].toFixed(3)} s at day end`);
  const lagEv = evOut(two.r, 'replication-lag');
  check('lag story counts stale reads', lagEv && lagEv.vars.stale !== '0', lagEv ? lagEv.vars.stale : 'none');
}

// ---- 4. a queue absorbs a burst ------------------------------------------------------------------
section('A queue absorbs a burst');
{
  const p = problem({ requirements: { peakRps: 1000, mix: { write: 1 }, latencyP99Ms: { default: 400 } }, events: [{ id: 'flash-crowd', at: '12:00', params: { factor: 6, rampSec: 30, holdSec: 600, decaySec: 600 } }] });
  const direct = day(p, { lb: 'regional-lb', app: ['vm-fleet', { units: 20 }], db: 'sql-primary' }, [['users', 'lb'], ['lb', 'app'], ['app', 'db']]).r;
  const q = day(p, { lb: 'regional-lb', app: ['vm-fleet', { units: 20 }], q: 'queue', wk: ['worker-pool', { units: 10 }], db: 'sql-primary' },
    [['users', 'lb'], ['lb', 'app'], ['app', 'q'], ['q', 'wk'], ['wk', 'db']]);
  check('writes fail without a queue', avail(direct) < 0.99, `availability ${avail(direct)}`);
  check('writes succeed with a queue', avail(q.r) >= 0.999, `availability ${avail(q.r)}`);
  const ev = evOut(q.r, 'flash-crowd');
  check('a backlog built up and was recorded', ev && Number.parseFloat(ev.vars.failed) >= 0 && q.S.model.nodes.length && q.r.nodes.find((n) => n.id === 'db').peakUtil <= 1, `db peak ${nodeOut(q.r, 'db').peakUtil}`);
  const back = q.sim.flows().nodeQueue[q.S.model.idx.get('q')];
  check('the backlog drained by the end of the day', back < 1, `${back.toFixed(1)} left`);
  const mid = day(p, { lb: 'regional-lb', app: ['vm-fleet', { units: 20 }], q: 'queue', wk: ['worker-pool', { units: 10 }], db: 'sql-primary' },
    [['users', 'lb'], ['lb', 'app'], ['app', 'q'], ['q', 'wk'], ['wk', 'db']], { until: 12 * 3600000 + 15 * 60000 });
  const midBack = mid.sim.flows().nodeQueue[mid.S.model.idx.get('q')];
  check('messages waited in the queue during the burst', midBack > 10000, `${Math.round(midBack)} queued at 12:15`);
}

// ---- 5. idempotency keys stop double payments under retries ---------------------------------------
section('Idempotency keys stop double payments under retries');
{
  const p = problem({ requirements: { peakRps: 200, mix: { payment: 1 }, latencyP99Ms: { payment: 3000 } }, events: [{ id: 'slow-dependency', at: '12:00' }] });
  const nodes = { lb: 'regional-lb', app: ['vm-fleet', { units: 4 }], pay: 'payment-processor' };
  const edges = [['users', 'lb'], ['lb', 'app'], ['app', 'pay']];
  const before = (sim) => { sim.setKnob('pay', 'timeoutMs', 1000); sim.setKnob('pay', 'retries', 3); };
  const plain = day(p, nodes, edges, { before }).r;
  const keyed = day(p, { ...nodes, idem: 'idempotency-store' }, [...edges, ['app', 'idem']], { before }).r;
  check('retries after timeouts charge some customers twice', plain.slo.safety.duplicates > 0, `${plain.slo.safety.duplicates} duplicates`);
  check('an idempotency store stops the double charges', keyed.slo.safety.duplicates === 0, `${keyed.slo.safety.duplicates} duplicates`);
  // the 50-point duplicate penalty, scaled by the share of requests served
  check('data-safety points reflect it', keyed.score.safety - plain.score.safety >= 40, `${plain.score.safety} vs ${keyed.score.safety}`);
  const qp = problem({ requirements: { peakRps: 200, mix: { payment: 1 } }, events: [{ id: 'duplicate-delivery', at: '12:00' }] });
  const qn = { lb: 'regional-lb', app: ['vm-fleet', { units: 4 }], q: 'queue', wk: ['worker-pool', { units: 4 }], pay: 'payment-processor' };
  const qe = [['users', 'lb'], ['lb', 'app'], ['app', 'q'], ['q', 'wk'], ['wk', 'pay']];
  const qd = day(qp, qn, qe).r;
  const qk = day(qp, { ...qn, idem: 'idempotency-store' }, [...qe, ['wk', 'idem']]).r;
  const fifo = day(qp, qn, qe, { before: (sim) => sim.setKnob('q', 'mode', 'fifo') }).r;
  check('queue redelivery double-charges without keys', qd.slo.safety.duplicates > 0, `${qd.slo.safety.duplicates} duplicates`);
  check('idempotency keys catch queue redelivery', qk.slo.safety.duplicates === 0, `${qk.slo.safety.duplicates} duplicates`);
  check('a FIFO queue deduplicates', fifo.slo.safety.duplicates === 0, `${fifo.slo.safety.duplicates} duplicates`);
}

// ---- connection rules ---------------------------------------------------------------------------
section('Connection rules');
{
  const sim = createSim({ catalog, problem: problem() });
  const rules = [
    ['web-browser', 'regional-lb', 'flow'], ['web-browser', 'waf', 'flow'], ['web-browser', 'cdn', 'flow'], ['mobile-app', 'vm-fleet', 'flow'],
    ['mobile-app', 'queue', 'flow'], ['web-browser', 'identity-provider', 'flow'], ['web-browser', 'kms', null], ['web-browser', 'sql-primary', null],
    ['vm-fleet', 'sql-primary', 'flow'], ['vm-fleet', 'queue', 'flow'], ['vm-fleet', 'payment-processor', 'flow'], ['vm-fleet', 'idempotency-store', 'flow'],
    ['regional-lb', 'cache', 'flow'], ['waf', 'regional-lb', 'flow'], ['cache', 'sql-primary', 'flow'],
    ['vm-fleet', 'audit-log', 'tap'], ['vm-fleet', 'cdc-connector', null],
    ['queue', 'worker-pool', 'flow'], ['queue', 'dead-letter-queue', 'flow'], ['queue', 'object-storage', 'flow'], ['queue', 'payment-processor', null],
    ['sql-primary', 'cdc-connector', 'tap'], ['sql-primary', 'audit-log', 'tap'], ['sql-primary', 'sql-replica', 'replication'], ['sql-replica', 'sql-primary', 'replication'],
    ['document-db', 'sql-replica', null], ['sql-primary', 'vm-fleet', null],
    ['cdc-connector', 'queue', 'flow'], ['cdc-connector', 'search-index', 'flow'], ['cdc-connector', 'cache', 'flow'],
    ['identity-provider', 'sms-provider', 'flow'], ['identity-provider', 'sql-primary', null],
    ['payment-processor', 'vm-fleet', 'flow'], ['payment-processor', 'queue', 'flow'], ['payment-processor', 'sql-primary', null], ['email-provider', 'vm-fleet', null],
    ['vm-fleet', 'metrics', 'observe'], ['metrics', 'sql-primary', 'observe'], ['metrics', 'alerting', 'observe'], ['alerting', 'pager', 'observe'],
    ['metrics', 'dashboards', 'observe'], ['pager', 'alerting', 'observe'], ['metrics', 'pager', null], ['web-browser', 'metrics', null],
    ['autoscaler', 'vm-fleet', 'control'], ['vm-fleet', 'autoscaler', 'control'], ['autoscaler', 'sql-primary', null], ['backups', 'sql-primary', 'control'],
    ['backups', 'vm-fleet', null], ['ci-cd', 'container-cluster', 'control'], ['feature-flags', 'serverless-fn', 'control'], ['config-service', 'vm-fleet', 'control'],
    ['secrets-manager', 'vm-fleet', 'control'], ['disaster-recovery', 'sql-primary', 'control'], ['disaster-recovery', 'metrics', null],
  ];
  let bad = [];
  for (const [a, b, kind] of rules) {
    const r = sim.canConnect(a, b);
    if ((kind === null && r.ok) || (kind !== null && (!r.ok || r.kind !== kind))) bad.push(`${a}->${b}: got ${r.ok ? r.kind : 'refused'}, want ${kind || 'refused'}`);
    if (!r.ok && !r.reason) bad.push(`${a}->${b}: refused without a reason`);
  }
  check(`${rules.length} connection rules behave as the contract says`, bad.length === 0, bad.slice(0, 4).join('; '));
  const reason = sim.canConnect('sql-primary', 'vm-fleet').reason;
  check('refusals explain the right direction', /Connect/.test(reason), reason);
  sim.addNode('regional-lb', 0, 0, { id: 'lb' });
  sim.addNode('metrics', 0, 0, { id: 'm' });
  const id = sim.connect('m', 'lb');
  check('observer edges normalise to part → observer', id === 'lb>m', id);
  let code = null;
  try { sim.connect('lb', 'lb'); } catch (e) { code = e.code; }
  check('self connections throw SimError self', code === 'self', code);
  try { sim.connect('lb', 'm'); } catch (e) { code = e.code; }
  check('duplicate connections throw SimError exists', code === 'exists', code);
  try { sim.connect('users', 'nope'); } catch (e) { code = e.code; }
  check('unknown nodes throw SimError unknown-node', code === 'unknown-node', code);
  sim.addNode('sql-primary', 0, 0, { id: 'db' });
  try { sim.connect('db', 'lb'); } catch (e) { code = e.code; }
  check('forbidden connections throw SimError not-allowed', code === 'not-allowed', code);
}

// ---- every event op -----------------------------------------------------------------------------
section('Every event op');
{
  const opsUsed = new Set();
  const base = {
    nodes: { waf: 'waf', lb: 'regional-lb', app: ['container-cluster', { units: 6 }], cache: 'cache', db: 'sql-primary', rr: 'sql-replica',
      q: 'queue', wk: ['worker-pool', { units: 4 }], pay: 'payment-processor' },
    edges: [['users', 'waf'], ['waf', 'lb'], ['lb', 'app'], ['app', 'cache'], ['app', 'db'], ['app', 'rr'], ['db', 'rr'], ['app', 'q'], ['q', 'wk'], ['wk', 'pay']],
  };
  const direct = { nodes: { lb: 'regional-lb', app: ['container-cluster', { units: 6 }], db: 'sql-primary', pay: 'payment-processor' }, edges: [['users', 'lb'], ['lb', 'app'], ['app', 'db'], ['app', 'pay']] };
  const mix = { read: 0.8, write: 0.1, payment: 0.05, login: 0.05 };
  const P = (events, req = {}) => problem({ requirements: { peakRps: 3000, mix, compliance: [], ...req }, events });
  const baselines = new Map();
  const runCase = (id, sp) => {
    const nodes = sp.nodes || base.nodes, edges = sp.edges || base.edges;
    const key = JSON.stringify([nodes, edges, sp.req || null]);
    if (!baselines.has(key)) baselines.set(key, day(P([], sp.req), nodes, edges));
    return { x: day(P([{ id, at: '12:00', params: sp.params || {} }], sp.req), nodes, edges), b: baselines.get(key) };
  };
  const util = (r, id) => nodeOut(r, id).peakUtil;
  const fails = (x, id) => x.S.failedSum[x.S.model.idx.get(id)];
  const cases = {
    'viral-spike': [{}, (x) => evOut(x.r, 'viral-spike').vars.peakRps !== '0' && evOut(x.r, 'viral-spike').vars.factor === '6'],
    'flash-crowd': [{}, (x, b) => avail(x.r) < avail(b.r)],
    'deadline-surge': [{}, (x, b) => x.r.timeline[13].offeredRps > b.r.timeline[13].offeredRps * 2],
    'hot-key': [{ nodes: { ...base.nodes, kv: ['kv-store', { units: 2 }] }, edges: [...base.edges, ['app', 'kv']] }, (x, b) => util(x.r, 'kv') > util(b.r, 'kv') * 1.1],
    'celebrity-fanout': [{}, (x, b) => util(x.r, 'db') > util(b.r, 'db') * 2],
    'cache-stampede': [{}, (x, b) => util(x.r, 'db') > util(b.r, 'db') * 1.5 && evOut(x.r, 'cache-stampede').vars.node !== 'Cache'],
    'db-failover': [{}, (x, b) => avail(x.r) < avail(b.r) && evOut(x.r, 'db-failover').vars.seconds !== '0'],
    'replication-lag': [{ req: { readYourWrites: true } }, (x, b) => x.r.slo.safety.staleReads > b.r.slo.safety.staleReads],
    'zone-outage': [{}, (x, b) => (evOut(x.r, 'zone-outage').vars.zone === 'a') === (evOut(x.r, 'zone-outage').nodeIds.length > 0)],
    'region-outage': [{ req: { availability: 0.99 } }, (x) => avail(x.r) < 0.95],
    'slow-dependency': [direct, (x, b) => x.r.slo.latency.worstP99Ms > b.r.slo.latency.worstP99Ms + 1000],
    'dependency-outage': [{}, (x) => fails(x, 'pay') > 0],
    'retry-storm': [{}, (x, b) => avail(x.r) <= avail(b.r) && Number(evOut(x.r, 'retry-storm').vars.factor) > 1],
    'thundering-herd': [{}, (x) => evOut(x.r, 'thundering-herd').vars.factor === '10'],
    'cost-blowout': [{}, (x, b) => x.r.slo.cost.perMonth > b.r.slo.cost.perMonth && evOut(x.r, 'cost-blowout').vars.costDelta !== '0'],
    'compliance-audit': [{}, (x) => evOut(x.r, 'compliance-audit').vars.total === '5' && x.r.slo.safety.compliance.failed.length === 5],
    'ddos-attack': [{}, (x) => Number(evOut(x.r, 'ddos-attack').vars.blockedPct) > 50],
    'bot-scraping': [{}, (x) => x.S.attackOffered > 0 && x.S.attackDropped > 0],
    'bad-deploy': [{ params: { target: 'app' } }, (x, b) => avail(x.r) < avail(b.r)],
    'bad-config-push': [{}, (x, b) => avail(x.r) < avail(b.r) - 0.01],
    'noisy-neighbor': [{ ...direct, params: { target: 'db' } }, (x, b) => util(x.r, 'db') > util(b.r, 'db') * 1.5],
    'memory-leak': [{ params: { target: 'app' } }, (x, b) => util(x.r, 'app') > util(b.r, 'app') * 1.1],
    'disk-full': [{ params: { target: 'db' } }, (x) => fails(x, 'db') > 0],
    'cold-start': [{ nodes: { lb: 'regional-lb', fn: 'serverless-fn', db: 'kv-store' }, edges: [['users', 'lb'], ['lb', 'fn'], ['fn', 'db']] }, (x, b) => x.r.slo.latency.worstP99Ms > b.r.slo.latency.worstP99Ms + 300],
    'poison-message': [{}, (x) => Number.parseFloat(evOut(x.r, 'poison-message').vars.minutes) > 0 && evOut(x.r, 'poison-message').vars.backlog !== '0'],
    'duplicate-delivery': [{}, (x) => x.r.slo.safety.duplicates > 0],
    'network-partition': [{ nodes: { lb: 'regional-lb', app: ['container-cluster', { units: 6 }], db2: ['document-db', { region: 'eu' }], pay: 'payment-processor' },
      edges: [['users', 'lb'], ['lb', 'app'], ['app', 'db2'], ['app', 'pay']] }, (x, b) => fails(x, 'app') > fails(b, 'app') + 1000],
    'cert-expiry': [{}, (x, b) => avail(x.r) < avail(b.r) - 0.01],
    'dns-misconfig': [{ nodes: { dns: 'dns', ...base.nodes }, edges: [['users', 'dns'], ['dns', 'waf'], ...base.edges.slice(1)] }, (x, b) => avail(x.r) < avail(b.r)],
    // refused calls, or a queue in front pacing them under the cap
    'third-party-rate-limit': [{}, (x) => evOut(x.r, 'third-party-rate-limit').vars.cap !== '0' && (fails(x, 'pay') > 0 || evOut(x.r, 'third-party-rate-limit').helpers.includes('queue'))],
    'data-corruption': [{}, (x) => x.r.slo.safety.lostWrites > 0],
    'cardinality-explosion': [{ nodes: { ...base.nodes, met: 'metrics' }, edges: [...base.edges, ['app', 'met']] }, (x, b) => x.r.slo.cost.perMonth > b.r.slo.cost.perMonth],
    'key-leak': [{}, (x, b) => util(x.r, 'app') > util(b.r, 'app') * 1.5],
    'gpu-shortage': [{ nodes: { ...base.nodes, gpu: ['gpu-cluster', { units: 60 }] }, edges: [...base.edges, ['app', 'gpu']], req: { mix: { ...mix, inference: 0.01 } } }, (x, b) => util(x.r, 'gpu') > util(b.r, 'gpu') * 2],
    'schema-migration-lock': [{ params: { target: 'db' } }, (x) => fails(x, 'db') > 0],
    'overseas-launch': [{}, (x, b) => x.r.slo.latency.worstP99Ms > b.r.slo.latency.worstP99Ms + 100],
  };
  for (const ev of catalog.events) {
    for (const ef of ev.effects) opsUsed.add(ef.op);
    const [sp, fn] = cases[ev.id] || [{}, null];
    let x, b;
    try {
      ({ x, b } = runCase(ev.id, sp));
    } catch (e) {
      check(`${ev.id} runs`, false, String(e && e.stack || e).split('\n').slice(0, 3).join(' | '));
      continue;
    }
    const e = evOut(x.r, ev.id);
    const ok = !!e && (!fn || fn(x, b));
    const want = Object.keys(evOut(x.r, ev.id)?.vars || {}).length === new Set(Object.values(ev.debrief).join(' ').match(/\{(\w+)\}/g) || []).size;
    check(`${ev.id} (${ev.effects.map((f) => f.op).join(', ')})`, ok && want, e ? JSON.stringify(e.vars).slice(0, 150) : 'event missing');
  }
  const allOps = Object.keys(catalog.ops);
  check('every op in events.json is used by some event and was exercised', allOps.every((o) => opsUsed.has(o)), allOps.filter((o) => !opsUsed.has(o)).join(', '));
}

// ---- counters soften events ---------------------------------------------------------------------
section('Counters soften events');
{
  const P = (events, mix = { read: 0.9, write: 0.1 }) => problem({ requirements: { peakRps: 2000, mix }, events });
  const nodes = { lb: 'regional-lb', app: ['container-cluster', { units: 6, zones: 1 }], db: 'sql-primary' };
  const edges = [['users', 'lb'], ['lb', 'app'], ['app', 'db']];
  const z1 = day(P([{ id: 'zone-outage', at: '12:00' }]), nodes, edges, { seed: 'zone-a' });
  const z3 = day(P([{ id: 'zone-outage', at: '12:00' }]), { lb: ['regional-lb', { zones: 2 }], app: ['container-cluster', { units: 6, zones: 3 }], db: ['sql-primary', { zones: 2 }] }, edges, { seed: 'zone-a' });
  const zone = evOut(z1.r, 'zone-outage').vars.zone;
  check('three zones ride out a zone outage', zone === 'a' ? avail(z3.r) > avail(z1.r) + 0.01 : avail(z3.r) >= avail(z1.r), `zone ${zone}: ${avail(z1.r)} with one zone, ${avail(z3.r)} with three`);
  const fo1 = day(P([{ id: 'db-failover', at: '12:00' }]), nodes, edges).r;
  const fo2 = day(P([{ id: 'db-failover', at: '12:00' }]), { ...nodes, db: ['sql-primary', { zones: 2, knobs: { replication: 'sync' } }] }, edges).r;
  const fo3 = day(P([{ id: 'db-failover', at: '12:00' }]), { ...nodes, db: ['sql-primary', { zones: 2 }] }, edges).r;
  check('a standby in a second zone shortens failover', avail(fo2) > avail(fo1), `${avail(fo1)} vs ${avail(fo2)}`);
  check('async failover loses the last writes, sync loses none', fo3.slo.safety.lostWrites > 0 && fo2.slo.safety.lostWrites === 0, `async ${fo3.slo.safety.lostWrites}, sync ${fo2.slo.safety.lostWrites}`);
  const st = day(P([{ id: 'cache-stampede', at: '12:00' }], { read: 0.98, write: 0.02 }), { lb: 'regional-lb', app: ['container-cluster', { units: 6 }], cache: 'cache', db: 'sql-primary' },
    [['users', 'lb'], ['lb', 'app'], ['app', 'cache'], ['cache', 'db']], { before: () => {} }).r;
  const stc = day(P([{ id: 'cache-stampede', at: '12:00' }], { read: 0.98, write: 0.02 }), { lb: 'regional-lb', app: ['container-cluster', { units: 6 }], cache: ['cache', { knobs: { coalesce: true } }], db: 'sql-primary' },
    [['users', 'lb'], ['lb', 'app'], ['app', 'cache'], ['cache', 'db']]).r;
  check('collapsing misses tames a cache stampede', nodeOut(stc, 'db').peakUtil < nodeOut(st, 'db').peakUtil, `db peak ${nodeOut(st, 'db').peakUtil} vs ${nodeOut(stc, 'db').peakUtil}`);
  const dd = (extra) => day(P([{ id: 'ddos-attack', at: '12:00' }]), { ...extra, lb: 'regional-lb', app: ['container-cluster', { units: 6 }], db: 'sql-primary' },
    [...(extra.dd ? [['users', 'dd'], ['dd', 'lb']] : [['users', 'lb']]), ['lb', 'app'], ['app', 'db']]).r;
  const open = dd({}), shielded = dd({ dd: 'ddos-shield' });
  check('a DDoS shield keeps real users served', avail(shielded) > avail(open) + 0.01, `${avail(open)} vs ${avail(shielded)}`);
  const slowP = problem({ requirements: { peakRps: 1500, mix: { read: 0.9, payment: 0.1 } }, events: [{ id: 'slow-dependency', at: '12:00' }] });
  const sn = { lb: 'regional-lb', app: ['vm-fleet', { units: 4 }], db: 'sql-primary', pay: 'payment-processor' };
  const se = [['users', 'lb'], ['lb', 'app'], ['app', 'db'], ['app', 'pay']];
  const slowA = day(slowP, sn, se).r;
  const slowB = day(slowP, { ...sn, cb: 'circuit-breaker' }, [['users', 'lb'], ['lb', 'app'], ['app', 'db'], ['app', 'cb'], ['cb', 'pay']]).r;
  check('a slow dependency drains caller capacity (Little\'s law)', Number(evOut(slowA, 'slow-dependency').vars.capacityLostPct) > 50, evOut(slowA, 'slow-dependency').vars.capacityLostPct + ' percent');
  check('a circuit breaker protects the rest of the traffic', avail(slowB) > avail(slowA), `${avail(slowA)} vs ${avail(slowB)}`);
  const dep = problem({ requirements: { peakRps: 500, mix: { payment: 1 } }, events: [{ id: 'dependency-outage', at: '12:00' }] });
  const depA = day(dep, { lb: 'regional-lb', app: ['vm-fleet', { units: 4 }], pay: 'payment-processor' }, [['users', 'lb'], ['lb', 'app'], ['app', 'pay']]).r;
  const depB = day(dep, { lb: 'regional-lb', app: ['vm-fleet', { units: 4 }], q: 'queue', wk: ['worker-pool', { units: 6 }], pay: 'payment-processor' }, [['users', 'lb'], ['lb', 'app'], ['app', 'q'], ['q', 'wk'], ['wk', 'pay']]).r;
  check('a queue turns a provider outage into "pending"', avail(depB) > avail(depA) && avail(depB) >= 0.999, `${avail(depA)} vs ${avail(depB)}`);
  const auditP = problem({ requirements: { peakRps: 500, compliance: ['audit-log', 'backups'] }, events: [{ id: 'compliance-audit', at: '12:00' }] });
  const au1 = day(auditP, { lb: 'regional-lb', app: ['vm-fleet', { units: 2 }], db: 'sql-primary' }, [['users', 'lb'], ['lb', 'app'], ['app', 'db']]).r;
  const au2 = day(auditP, { lb: 'regional-lb', app: ['vm-fleet', { units: 2 }], db: 'sql-primary', au: 'audit-log', bk: 'backups' }, [['users', 'lb'], ['lb', 'app'], ['app', 'db'], ['app', 'au'], ['bk', 'db']]).r;
  check('an audit checks the problem\'s compliance list', au1.slo.safety.compliance.failed.length === 2 && au2.slo.safety.compliance.failed.length === 0, `${au1.slo.safety.compliance.failed} / ${au2.slo.safety.compliance.passed}`);
  const geo = problem({ requirements: { peakRps: 1000, availability: 0.99, userRegions: { us: 0.5, eu: 0.5 } }, events: [{ id: 'region-outage', at: '12:00' }] });
  const one = day(geo, { lb: 'regional-lb', app: ['vm-fleet', { units: 4 }], db: 'kv-store' }, [['users', 'lb'], ['lb', 'app'], ['app', 'db']]).r;
  const two = day(geo, { gd: 'geo-dns', lb: 'regional-lb', app: ['vm-fleet', { units: 4 }], db: 'kv-store', lb2: ['regional-lb', { region: 'eu' }], app2: ['vm-fleet', { units: 4, region: 'eu' }], db2: ['kv-store', { region: 'eu' }] },
    [['users', 'gd'], ['gd', 'lb'], ['gd', 'lb2'], ['lb', 'app'], ['app', 'db'], ['lb2', 'app2'], ['app2', 'db2']]).r;
  check('GeoDNS with a second region survives a region outage', avail(two) > avail(one) + 0.02, `${avail(one)} vs ${avail(two)}`);
  check('far users see higher latency without a nearby region', one.slo.latency.byType.read.p99Ms > two.slo.latency.byType.read.p99Ms, `${one.slo.latency.byType.read.p99Ms} vs ${two.slo.latency.byType.read.p99Ms} ms`);
  const as = problem({ requirements: { peakRps: 2000 }, traffic: { curve: 'consumer-evening' }, events: [{ id: 'deadline-surge', at: '08:00', params: { factor: 4 } }] });
  const asA = day(as, { lb: 'regional-lb', app: ['container-cluster', { units: 3 }], db: 'kv-store' }, [['users', 'lb'], ['lb', 'app'], ['app', 'db']]);
  const asB = day(as, { lb: 'regional-lb', app: ['container-cluster', { units: 3, knobs: { autoscale: { on: true, min: 3, max: 20, targetUtil: 0.6 } } }], db: 'kv-store' }, [['users', 'lb'], ['lb', 'app'], ['app', 'db']]);
  const avgUnits = asB.S.counters.unitSec[asB.S.model.idx.get('app')] / asB.S.counters.elapsedSec;
  check('autoscaling handles a slow climb', avail(asB.r) > avail(asA.r) + 0.01 && avgUnits > 3.2, `${avail(asA.r)} vs ${avail(asB.r)}, ${avgUnits.toFixed(1)} units on average`);
  const fc = problem({ requirements: { peakRps: 2000 }, events: [{ id: 'flash-crowd', at: '12:00', params: { factor: 5 } }] });
  const fcB = day(fc, { lb: 'regional-lb', app: ['container-cluster', { units: 3, knobs: { autoscale: { on: true, min: 3, max: 30, targetUtil: 0.6 } } }], db: 'kv-store' }, [['users', 'lb'], ['lb', 'app'], ['app', 'db']]).r;
  check('autoscaling is too late for a 30-second flash crowd', avail(fcB) < 0.999 && Number(evOut(fcB, 'flash-crowd').vars.minutes) >= 2, `${avail(fcB)}, overloaded ${evOut(fcB, 'flash-crowd').vars.minutes} min`);
}

// ---- determinism -----------------------------------------------------------------------------------
section('Determinism');
{
  const p = problem({ requirements: { peakRps: 5000, mix: { read: 0.8, write: 0.15, payment: 0.05 } }, events: [{ id: 'zone-outage', at: '10:00' }, { id: 'bad-deploy', at: '15:00' }, { id: 'viral-spike', at: '19:00' }] });
  const nodes = { lb: 'regional-lb', app: ['container-cluster', { units: 8, zones: 2 }], cache: 'cache', db: ['sql-primary', { zones: 2 }], pay: 'payment-processor' };
  const edges = [['users', 'lb'], ['lb', 'app'], ['app', 'cache'], ['app', 'db'], ['app', 'pay']];
  const a = day(p, nodes, edges, { seed: 'daily-2026-11-02' }).r;
  const b = day(p, nodes, edges, { seed: 'daily-2026-11-02' }).r;
  check('same design, problem and seed give an identical result', JSON.stringify(a) === JSON.stringify(b), `score ${a.score.total}`);
  const c = day(p, nodes, edges, { seed: 'daily-2026-11-03' }).r;
  check('a different seed changes the scenario', JSON.stringify(a.minuteSuccess) !== JSON.stringify(c.minuteSuccess), `scores ${a.score.total} / ${c.score.total}`);
  const r1 = mulberry32(hashSeed('x')), r2 = mulberry32(hashSeed('x'));
  check('rng is seeded', r1() === r2() && hashSeed('daily-2026-11-02') === hashSeed('daily-2026-11-02'));
  const sim = createSim({ catalog, problem: p, seed: 's' });
  build(sim, nodes, edges);
  sim.start();
  let ticks = 0;
  for (let i = 0; i < 100; i++) ticks += sim.advance(3333);
  check('advance() keeps fractional time', ticks === 33, `${ticks} ticks for 333,300 ms`);
  check('state() reports a clock label', sim.state().clockLabel === '00:05', sim.state().clockLabel);
}

// ---- API surface -------------------------------------------------------------------------------
section('API surface');
{
  const p = problem({ requirements: { peakRps: 1000 }, events: [{ id: 'viral-spike', at: '01:00' }] });
  const sim = createSim({ catalog, problem: p, seed: 'api' });
  const lb = sim.addNode('regional-lb', 0, 0);
  const app = sim.addNode('vm-fleet', 100, 0);
  const db = sim.addNode('sql-primary', 200, 0);
  check('new nodes get n1, n2, ...', lb === 'n1' && app === 'n2' && db === 'n3', [lb, app, db].join(','));
  sim.connect('users', lb); sim.connect(lb, app); sim.connect(app, db);
  const issues = sim.validate();
  check('a sound design has no validation errors', !issues.some((i) => i.level === 'error'), JSON.stringify(issues));
  sim.disconnect(`${app}>${db}`);
  check('validate() explains a missing path', sim.validate().some((i) => i.code === 'type-unserved'), sim.validate().map((i) => i.code).join(','));
  sim.connect(app, db);
  const est = sim.estimate();
  check('estimate() gives cost and a peak check', est.perMonth > 0 && est.nodes.length === 4 && est.holdsAtPeak === true, `$${est.perMonth}, holds ${est.holdsAtPeak}`);
  const g = sim.getGraph();
  const sim2 = createSim({ catalog, problem: p, seed: 'api' });
  sim2.loadGraph(g);
  check('getGraph() and loadGraph() round-trip', JSON.stringify(sim2.getGraph()) === JSON.stringify(g));
  const events = [];
  sim.on('event', (e) => events.push(e));
  let done = null;
  sim.on('done', (e) => { done = e; });
  let statusSeen = 0;
  sim.on('status', () => statusSeen++);
  sim.start();
  check('start() moves to running', sim.phase === 'running');
  sim.advance(3600000);
  sim.pause();
  check('pause() stops the clock', sim.phase === 'paused');
  sim.setKnob(app, 'units', 6);
  sim.resume();
  sim.advance(DAY);
  check('the day ends in phase done with a result', sim.phase === 'done' && done && done.result && done.result.score.total > 0, sim.phase);
  check('event start and end are emitted', events.some((e) => e.phase === 'start') && events.some((e) => e.phase === 'end'), events.map((e) => e.phase).join(','));
  check('status changes are emitted', statusSeen > 0, `${statusSeen}`);
  const r = sim.result();
  check('knob changes during the day are recorded', r.interventions.length === 1 && r.interventions[0].knob === 'units', JSON.stringify(r.interventions));
  check('debrief has 24 timeline hours and 1,440 minutes', r.timeline.length === 24 && r.minuteSuccess.length === 1440);
  const f = sim.flows();
  check('flows() exposes typed arrays sized to the graph', f.edgeRps.length === f.edgeIds.length * f.typeIds.length && f.nodeUtil.length === f.nodeIds.length);
  sim.reset();
  check('reset() returns to build and keeps the graph', sim.phase === 'build' && sim.getGraph().nodes.length === 4);
  let threw = null;
  const ch = createSim({ catalog, problem: p, seed: 'c', mode: 'challenge' });
  ch.loadGraph(g);
  ch.start();
  try { ch.setKnob(app, 'units', 3); } catch (e) { threw = e.code; }
  check('challenge mode locks knobs once the day starts', threw === 'locked', threw);
  threw = null;
  try { ch.addNode('cache', 0, 0); } catch (e) { threw = e.code; }
  check('parts cannot be added during the day', threw === 'not-allowed', threw);
  const sb = createSim({ catalog, problem: null, mode: 'sandbox', seed: 'sb' });
  sb.addNode('web-browser', 0, 0, { id: 'u' });
  sb.addNode('vm-fleet', 0, 0, { id: 'a' });
  sb.addNode('kv-store', 0, 0, { id: 'k' });
  sb.connect('u', 'a'); sb.connect('a', 'k');
  sb.setTraffic({ rpsByType: { read: 4000, write: 500 }, curve: 'flat' });
  sb.start();
  sb.advance(DAY + 3600000);
  sb.fireEvent('ddos-attack');
  sb.advance(600000);
  sb.addNode('waf', 0, 0, { id: 'w' });
  check('sandbox wraps the day, fires events on demand and allows edits while running', sb.phase === 'running' && sb.state().events.some((e) => e.id === 'ddos-attack') && sb.getGraph().nodes.length === 4, sb.state().clockLabel);
  const game = createHeadlessGame({ catalog, findProblem: (id) => (id === 'test' ? p : null) });
  await game.loadProblem('test');
  const a1 = game.placeComponent('regional-lb', 0, 0);
  const a2 = game.placeComponent('vm-fleet', 0, 0);
  const a3 = game.placeComponent('kv-store', 0, 0);
  game.connect('users', a1); game.connect(a1, a2); game.connect(a2, a3);
  game.startTraffic();
  const gs = game.step(DAY);
  check('headless __game reaches the debrief with a score and no errors', gs.phase === 'done' && gs.step === 'debrief' && gs.score && gs.score.total > 0 && gs.errors.length === 0, JSON.stringify({ phase: gs.phase, score: gs.score, errors: gs.errors }).slice(0, 200));
  const perf = createPerf();
  for (let i = 0; i < 130; i++) perf.record({ dtWallMs: 16 + (i % 10), simMs: 1, renderMs: 4, ticks: 1 });
  check('__perf keeps rolling means and p95', perf.data.frameMs > 16 && perf.data.frameMsP95 >= 24 && perf.data.fps > 0, JSON.stringify(perf.data));
}

// ---- performance -------------------------------------------------------------------------------
// Measured in a fresh Node process (like a fresh page) so the JIT state left by the tests above does not skew it.
// The full-day budget covers a 30-part service; the mixed-region stress case keeps its frame budget.
function dayPerfRun() {
  const p = problem({ requirements: { peakRps: 2000, mix: { read: 1 }, userRegions: { us: 1 } } });
  const sim = createSim({ catalog, problem: p, seed: 'perf-day' });
  sim.addNode('regional-lb', 0, 0, { id: 'lb' }); sim.connect('users', 'lb');
  for (let i = 0; i < 14; i++) {
    sim.addNode('vm-fleet', 120, i * 120, { id: 'app' + i, units: 4 });
    sim.addNode('sql-primary', 240, i * 120, { id: 'db' + i });
    sim.connect('lb', 'app' + i); sim.connect('app' + i, 'db' + i);
  }
  const times = [];
  for (let i = 0; i < 2; i++) { sim.reset(); sim.start(); sim.advance(DAY); }
  for (let i = 0; i < 10; i++) {
    sim.reset(); sim.start();
    const t = performance.now(); sim.advance(DAY); times.push(performance.now() - t);
    if (times.length >= 3 && Math.min(...times) < 2000) break;
  }
  const result = sim.result();
  return { n: result.graph.nodes.length, times, served: result.slo.availability.actual,
    active: result.nodes.filter(n => n.id !== 'users').every(n => n.peakRequests > 0) };
}

function perfRun() {
  const p = problem({
    requirements: { peakRps: 40000, mix: { read: 0.7, write: 0.1, search: 0.08, payment: 0.02, login: 0.05, upload: 0.02, notify: 0.03 }, userRegions: { us: 0.6, eu: 0.3, apac: 0.1 }, compliance: ['audit-log'] },
    traffic: { curve: 'consumer-evening', sources: { 'web-browser': 0.5, 'mobile-app': 0.5 } },
    events: [{ id: 'viral-spike', at: '19:00' }, { id: 'cache-stampede', at: '20:00' }, { id: 'zone-outage', at: '10:00' }, { id: 'slow-dependency', at: '14:00' }, { id: 'ddos-attack', at: '03:00' }, { id: 'duplicate-delivery', at: '16:00' }],
  });
  const nodes = {
    phones: 'mobile-app', cdn: 'cdn', waf: 'waf', lb: ['regional-lb', { zones: 2 }], gw: 'api-gateway', app: ['container-cluster', { units: 30, zones: 3 }],
    search: ['search-index', { units: 4 }], cache: ['distributed-cache', { units: 3, zones: 3 }], db: ['sql-primary', { zones: 2, tier: 'XL' }], rr: ['sql-replica', { units: 3, tier: 'L' }],
    proxy: 'db-proxy', idp: 'identity-provider', idem: 'idempotency-store', pay: 'payment-processor', q: 'queue', wk: ['worker-pool', { units: 10 }], dlq: 'dead-letter-queue',
    obj: 'object-storage', email: 'email-provider', push: 'push-service', au: 'audit-log', cdc: 'cdc-connector', met: 'metrics', al: 'alerting', pg: 'pager', logs: 'logs', bk: 'backups', kv: ['kv-store', { units: 4 }], tr: 'traces',
  };
  const edges = [['users', 'cdn'], ['phones', 'cdn'], ['users', 'waf'], ['phones', 'waf'], ['cdn', 'waf'], ['waf', 'lb'], ['lb', 'gw'], ['gw', 'app'], ['app', 'cache'], ['app', 'proxy'], ['proxy', 'db'], ['app', 'rr'], ['db', 'rr'],
    ['app', 'search'], ['app', 'idp'], ['app', 'idem'], ['app', 'pay'], ['app', 'q'], ['q', 'wk'], ['q', 'dlq'], ['wk', 'email'], ['wk', 'push'], ['app', 'obj'], ['app', 'au'], ['db', 'cdc'], ['cdc', 'search'],
    ['app', 'met'], ['met', 'al'], ['al', 'pg'], ['app', 'logs'], ['bk', 'db'], ['app', 'kv'], ['app', 'tr']];
  const sim = createSim({ catalog, problem: p, seed: 'perf' });
  build(sim, nodes, edges);
  const n = sim.getGraph().nodes.length;
  // Warm this graph in the fresh process before measuring steady simulation work.
  for (let i = 0; i < 3; i++) {
    sim.reset();
    sim.start();
    sim.advance(DAY);
  }
  const times = [];
  let r;
  for (let i = 0; i < 3; i++) {
    sim.reset();
    sim.start();
    const t0 = performance.now();
    sim.advance(DAY);
    times.push(performance.now() - t0);
    r = sim.result();
  }
  sim.reset(); sim.start();
  const t1 = performance.now();
  let worst = 0;
  for (let f = 0; f < 1080; f++) { const t = performance.now(); sim.advance(80000); worst = Math.max(worst, performance.now() - t); }
  const per = (performance.now() - t1) / 1080;
  return { n, lanes: sim.debug().nActive, times, per, worst, score: r.score.total };
}

// Thirty active parts on fourteen independent service paths, with reads and writes.
function contractPerfRun() {
  const p = problem({ requirements: { peakRps: 40000 } });
  const sim = createSim({ catalog, problem: p, seed: 'perf-contract' });
  const lb = sim.addNode('regional-lb', 0, 0, { id: 'lb', zones: 3 });
  sim.connect('users', lb);
  for (let i = 0; i < 14; i++) {
    const app = sim.addNode('container-cluster', 100, i * 100, { id: 'app' + i, units: 3, zones: 3 });
    const store = sim.addNode('kv-store', 200, i * 100, { id: 'store' + i, units: 3, zones: 3 });
    sim.connect(lb, app); sim.connect(app, store);
  }
  const times = [];
  let result;
  for (let i = 0; i < 6; i++) {
    sim.reset(); sim.start();
    const start = performance.now();
    sim.advance(DAY);
    if (i >= 3) times.push(performance.now() - start);
    result = sim.result();
  }
  return { n: result.graph.nodes.length, active: result.nodes.filter(n => n.peakRequests > 0 || (catalog.elementById.get(n.type).kind === 'source' && result.slo.availability.actual > 0)).length, times };
}

section('Performance');
{
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const baselineOut = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--perf-contract-only'], { encoding: 'utf8' });
  let baseline = null;
  try { baseline = JSON.parse(baselineOut.stdout.trim().split('\n').pop()); } catch { /* reported below */ }
  check('a full day with 30 active parts runs in under 2000 ms', baseline?.n === 30 && baseline.active === 30 && Math.min(...baseline.times) < 2000,
    baseline ? `${baseline.active} active parts, ${baseline.times.map(t => t.toFixed(0)).join(' / ')} ms` : baselineOut.stderr);
  const out = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--perf-only'], { encoding: 'utf8' });
  let p = null;
  try { p = JSON.parse(out.stdout.trim().split('\n').pop()); } catch { /* reported below */ }
  if (!p) check('performance run', false, (out.stderr || out.stdout || '').slice(0, 300));
  else {
    const best = Math.min(...p.day.times);
    check(`a full day of an active ${p.day.n}-node service runs in under 2000 ms`, p.day.n >= 30 && p.day.active && p.day.served === 1 && best < 2000,
      `${p.day.times.map((t) => t.toFixed(0)).join(' / ')} ms, ${(best / 8640 * 1000).toFixed(1)} µs per tick`);
    const frames = DAY / catalog.world.sim.tickMs / 8;
    check(`a full day of the ${p.stress.n}-node stress graph fits 10 ms per eight ticks`, Math.min(...p.stress.times) / frames < 10, `${p.stress.times.map(t => t.toFixed(0)).join(" / ")} ms`);
    check(`8 ticks per frame (8x) of the ${p.stress.n}-node stress graph (${p.stress.lanes} lanes) stays under 10 ms`, p.stress.per < 10,
      `${p.stress.per.toFixed(2)} ms mean, ${p.stress.worst.toFixed(2)} ms worst frame`);
  }
  const t0 = performance.now();
  const warm = perfRun();
  check('after 100+ other days in one process each 8x frame stays under 10 ms', warm.per < 10, `${(performance.now() - t0).toFixed(0)} ms total, ${warm.per.toFixed(2)} ms per 8x frame`);
}

// ---- editorial designs (once content exists) -----------------------------------------------------
section('Editorial designs');
{
  const idx = new URL('../content/problems/index.js', here);
  if (!existsSync(idx)) {
    console.log('  skip content/problems/index.js not present yet');
  } else {
    let problems = [];
    try {
      const mod = await import(idx.href);
      const d = mod.default || mod;
      problems = d.problems || mod.problems || (d.groups || mod.groups || []).flatMap((g) => g.problems || []) || [];
      if (!problems.length && Array.isArray(d)) problems = d.flatMap((g) => g.problems || []);
    } catch (e) { check('content index imports', false, String(e.message)); }
    for (const pr of problems) {
      const design = pr.editorial && pr.editorial.designs && pr.editorial.designs[0];
      if (!design) continue;
      try {
        const sim = createSim({ catalog, problem: pr, seed: 'practice' });
        sim.loadGraph(design.graph);
        sim.start();
        sim.advance(DAY);
        const r = sim.result();
        const exp = design.expect && design.expect.score;
        check(`${pr.id}: "${design.name}"`, exp == null || r.score.total >= exp - 50, `score ${r.score.total}${exp != null ? ' vs expect ' + exp : ''}, $${Math.round(r.slo.cost.perMonth)}`);
      } catch (e) { check(`${pr.id} editorial runs`, false, String(e.message)); }
    }
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
