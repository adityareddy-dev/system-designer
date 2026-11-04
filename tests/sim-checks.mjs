// Node checks for the simulation rules players rely on: edits while a lesson runs, honest scores for empty designs,
// bounded retries, paced outside services, conserved queue chains, consensus failover and debrief wording.
// Run from the app folder (on the server): node tests/sim-checks.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const imp = (f) => import(pathToFileURL(path.resolve(f)).href);
const { createCatalog } = await imp('sim/catalog.js');
const { createSim } = await imp('sim/engine.js');
const { problems, problemById } = await imp('content/problems/index.js');
const catalog = createCatalog({ elements: J('catalog/elements.json'), requests: J('catalog/requests.json'), events: J('catalog/events.json'), world: J('catalog/world.json') });

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  (' + detail + ')' : ''}`); };
const section = (t) => console.log('\n' + t);
const runDay = (p, graph, opts = {}) => {
  const sim = createSim({ catalog, problem: p, seed: opts.seed || 'practice', mode: opts.mode || 'practice' });
  if (graph) sim.loadGraph(graph);
  opts.before?.(sim);
  sim.start();
  if (opts.onTick) sim.on('tick', () => opts.onTick(sim));
  sim.advance(opts.until ?? 86400000);
  return { sim, r: sim.result() };
};
const lessonProblem = { id: 'lesson', requirements: { peakRps: 500, mix: { read: 1 } }, traffic: { curve: 'flat', sources: { 'mobile-app': 1 } },
  starter: { nodes: [{ ref: 'u', type: 'mobile-app', x: 0, y: 0, locked: true }, { ref: 'app', type: 'vm-fleet', x: 200, y: 0 }], edges: [['u', 'app']] }, events: [] };

section('Parts can change while a lesson or the intro runs');
for (const mode of ['lesson', 'intro', 'sandbox']) {
  const sim = createSim({ catalog, problem: lessonProblem, seed: 'x', mode });
  sim.start(); sim.advance(60000);
  let id = null, err = '';
  try { id = sim.addNode('regional-lb', -100, 0); sim.connect('u', id); } catch (e) { err = e.message; }
  check(`${mode}: a load balancer can be dropped in and connected mid-day`, !!id && sim.getGraph().edges.some((e) => e.from === 'u' && e.to === id), err);
}
{
  const sim = createSim({ catalog, problem: lessonProblem, seed: 'x', mode: 'practice' });
  sim.start();
  let threw = false;
  try { sim.addNode('regional-lb', 0, 0); } catch { threw = true; }
  check('practice: parts stay fixed once the day starts', threw);
  let bad = false;
  try { createSim({ catalog, problem: lessonProblem, mode: 'sandbox' }).addNode('cache', NaN, Infinity); } catch { bad = true; }
  check('a part needs a finite position', bad);
}

section('Scores reflect what was served');
for (const id of ['appointment-booking', 'payments-checkout', 'url-shortener', 'smart-home-hub']) {
  const p = problemById.get(id);
  const { r } = runDay(p, null);
  check(`${id}: an empty design scores almost nothing and does not pass`, r.score.total <= 60 && !r.passed, `score ${r.score.total}, latency ${r.score.latency}, cost ${r.score.cost}`);
  check(`${id}: the verdict says nothing was served`, /Nothing was served/.test(r.verdict), r.verdict);
}

section('Retries are bounded and follow the callers’ settings');
{
  const base = problemById.get('payments-checkout');
  const p = { ...base, requirements: { ...base.requirements, peakRps: 2000, mix: { read: 0.5, write: 0.5 }, compliance: [] }, events: [{ id: 'retry-storm', at: '10:00' }], requires: {},
    traffic: { curve: 'flat', sources: { 'mobile-app': 1 } }, starter: { nodes: [{ ref: 'u', type: 'mobile-app', x: 0, y: 0, locked: true }], edges: [] } };
  const g = (retries, backoff) => ({ nodes: [{ id: 'u', type: 'mobile-app', x: 0, y: 0, knobs: { retries, backoff } }, { id: 'l', type: 'regional-lb', x: 100, y: 0, units: 2 }, { id: 'v', type: 'vm-fleet', x: 200, y: 0, units: 4 }, { id: 'd', type: 'kv-store', x: 300, y: 0, units: 4 }],
    edges: [{ from: 'u', to: 'l' }, { from: 'l', to: 'v' }, { from: 'v', to: 'd' }] });
  const factor = (rr) => Number(rr.events.find((e) => e.id === 'retry-storm').vars.factor);
  const none0 = runDay(p, g(0, 'none')).r, none3 = runDay(p, g(3, 'none')).r, jit3 = runDay(p, g(3, 'exponential-jitter')).r, none5 = runDay(p, g(5, 'none')).r;
  check('no retries: the blip does not grow', factor(none0) <= 1.15, `x${factor(none0)}`);
  check('three lockstep retries roughly quadruple the load, never more', factor(none3) > 2.5 && factor(none3) <= 4.05, `x${factor(none3)}`);
  check('jittered backoff keeps the storm small', factor(jit3) < 1.6, `x${factor(jit3)}`);
  check('five retries amplify more than three, bounded by six', factor(none5) > factor(none3) && factor(none5) <= 6.05, `x${factor(none5)}`);
  const peak = (rr) => rr.nodes.find((n) => n.id === 'v').peakUtil;
  check('the servers’ peak load follows the client setting', peak(none3) > peak(jit3) * 1.5, `${peak(none3)} vs ${peak(jit3)}`);
}

section('Outside services are paced, not hammered, and refused calls are not billed');
{
  const p = problemById.get('tax-deadline-surge');
  let maxFail = 0, maxUtil = 0;
  const { r } = runDay(p, p.editorial.designs[0].graph, { onTick: (sim) => { for (const n of sim.state().nodes) { if (n.type === 'email-provider') { maxFail = Math.max(maxFail, n.failRps); maxUtil = Math.max(maxUtil, n.util); } } } });
  const offeredNotify = p.requirements.peakRps * (p.requirements.mix.notify || 0);
  check('the email provider sees at most a few times the offered sends', maxFail <= Math.max(50, 3 * offeredNotify), `max failRps ${Math.round(maxFail)}, offered at peak ${Math.round(offeredNotify)}`);
  check('shown utilisation stays readable', maxUtil <= 10, `max util ${maxUtil}`);
  const mail = r.slo.cost.lines.find((l) => /Email provider usage/.test(l.label));
  check('the email bill stays in the same range as the sends', !mail || mail.usd < 20000, mail ? `$${Math.round(mail.usd)}` : 'no line');
  for (const id of ['appointment-booking', 'notification-service', 'tax-deadline-surge', 'video-upload-pipeline']) {
    const q = problemById.get(id);
    const withEv = runDay(q, q.editorial.designs[0].graph).r.slo.cost.perMonth;
    const noEv = runDay({ ...q, events: [], eventPool: [] }, q.editorial.designs[0].graph).r.slo.cost.perMonth;
    check(`${id}: a day of events moves the bill by less than 2 times`, withEv / noEv < 2, `$${Math.round(withEv)} vs $${Math.round(noEv)}`);
  }
}

section('Queue chains conserve requests');
{
  const p = problemById.get('video-upload-pipeline');
  const tot = {};
  const { sim } = runDay(p, p.editorial.designs[0].graph, { onTick: (s) => { const f = s.flows(); const T = f.typeIds.length; const up = f.typeIds.indexOf('upload'); f.edgeIds.forEach((e, i) => { tot[e] = (tot[e] || 0) + f.edgeRps[i * T + up] * 10; }); } });
  void sim;
  const intoQ = Object.entries(tot).filter(([e]) => e.endsWith('>q')).reduce((a, [, v]) => a + v, 0);
  const toTc = Object.entries(tot).filter(([e]) => e.endsWith('>tc')).reduce((a, [, v]) => a + v, 0);
  check('uploads reaching the transcoder match uploads queued', intoQ > 1000 && toTc <= intoQ * 1.1 && toTc >= intoQ * 0.9, `${Math.round(intoQ)} queued, ${Math.round(toTc)} transcoded`);
}

section('Consensus databases lose one node, not the cluster');
{
  const p = problemById.get('bank-ledger');
  const mk = (type, units) => ({ ...p, events: [{ id: 'db-failover', at: '10:00', params: { target: 'db' } }], eventPool: [] });
  const g = (type, units) => ({ nodes: [{ id: 'web', type: 'web-browser', x: 0, y: 0 }, { id: 'mobile', type: 'mobile-app', x: 0, y: 100 }, { id: 'partner', type: 'partner-system', x: 0, y: 200 }, { id: 'app', type: 'vm-fleet', x: 200, y: 0, units: 120, zones: 3 }, { id: 'db', type, x: 400, y: 0, units, zones: 3 }],
    edges: [{ from: 'web', to: 'app' }, { from: 'mobile', to: 'app' }, { from: 'partner', to: 'app' }, { from: 'app', to: 'db' }] });
  const sql = runDay(mk(), g('distributed-sql', 30)).r.events.find((e) => e.id === 'db-failover');
  const one = runDay(mk(), g('sql-primary', 1)).r.events.find((e) => e.id === 'db-failover');
  const n = (s) => Number.parseFloat(s) * (/k$/.test(s) ? 1e3 : /M$/.test(s) ? 1e6 : 1);
  check('a consensus cluster fails far fewer requests than a single primary', n(sql.vars.failed) < n(one.vars.failed) * 0.1, `${sql.vars.failed} vs ${one.vars.failed}`);
  check('its story names the re-election', /re-elected/.test(sql.story.headline), sql.story.headline);
}

section('Repair advice preserves required destinations and event coverage');
{
  const p = { ...lessonProblem, requires: { payment: [['payment-processor']] }, requirements: { peakRps: 100, mix: { read: 0.5, payment: 0.5 } },
    events: [{ id: 'duplicate-delivery', at: '10:00' }] };
  const graph = { nodes: [{ id: 'u', type: 'mobile-app', x: 0, y: 0 }, { id: 'app', type: 'vm-fleet', x: 100, y: 0, units: 10 },
    { id: 'q', type: 'queue', x: 200, y: 0 }, { id: 'wk', type: 'worker-pool', x: 300, y: 0, units: 10 },
    { id: 'db', type: 'sql-replica', x: 400, y: 0 }, { id: 'pay', type: 'payment-processor', x: 400, y: 100 },
    { id: 'keys', type: 'idempotency-store', x: 300, y: 100 }],
    edges: [['u', 'app'], ['app', 'db'], ['app', 'q'], ['q', 'wk'], ['wk', 'db']].map(([from, to]) => ({ from, to })) };
  const { sim, r } = runDay(p, graph);
  const issue = sim.validate().find((i) => i.type === 'payment' && i.code === 'type-unserved');
  check('a blocked worker payment path still requires the processor', /payment processor/i.test(issue?.message || '') && !/straight to.*SQL/.test(issue?.message || ''), issue?.message);
  check('repair explains why a processor elsewhere does not cover this branch', /another branch/.test(issue?.message || ''));
  check('the debrief keeps the required payment destination', /payment processor/i.test(r.nextStep.text), r.nextStep.text);
  const ledgerProblem = { ...p, requires: { payment: [['ledger-db']] } };
  const ledgerSim = createSim({ catalog, problem: ledgerProblem });
  ledgerSim.loadGraph(graph);
  check('a ledger requirement is preserved too', /ledger/i.test(ledgerSim.validate().find((i) => i.type === 'payment')?.message || ''));
  const event = r.events.find((e) => e.id === 'duplicate-delivery');
  check('disconnected idempotency keys receive no helper credit', !event.helpers.includes('idempotency-store'));
  check('event advice explicitly identifies a counter off the request path', /Idempotency keys: present but not on this request path/.test(event.story.helped || ''), event.story.helped);
  const fixed = structuredClone(graph);
  fixed.edges.push({ from: 'wk', to: 'pay' }, { from: 'wk', to: 'keys' });
  const covered = runDay(p, fixed).r.events.find((e) => e.id === 'duplicate-delivery');
  check('keys called by active workers receive path coverage credit', covered.helpers.includes('idempotency-store'), covered.story.helped);
}

section('Sizing uses the fleet at the measured peak');
{
  const base = problemById.get('url-shortener');
  const p = { ...base, requirements: { ...base.requirements, peakRps: 16000, budgetPerMonth: 1e9, latencyP99Ms: { default: 100 } }, events: [] };
  const graph = { nodes: [
    { id: 'u', type: 'mobile-app', x: 0, y: 0, knobs: { retries: 0 } },
    { id: 'v', type: 'vm-fleet', x: 100, y: 0, units: 8, knobs: { autoscale: { on: true, min: 2, max: 8, targetUtil: 0.6 } } },
    { id: 'd', type: 'kv-store', x: 200, y: 0, units: 100 }
  ], edges: [{ from: 'u', to: 'v' }, { from: 'v', to: 'd' }] };
  const { r } = runDay(p, graph);
  check('sizing shows simultaneous load, active units, headroom and monthly cost', /Measured peak:.*requests\/s with.*active.*30 percent headroom.*0.70.*month/.test(r.nextStep.text), r.nextStep.text);
  const m = r.nextStep.text.match(/round up ([\d,]+) ÷ \(([\d,]+) × 0.70\) = ([\d,]+)/);
  check('suggested units follow the displayed capacity arithmetic', !!m && Math.abs(Math.ceil(Number(m[1].replaceAll(',', '')) / (Number(m[2].replaceAll(',', '')) * 0.7)) - Number(m[3].replaceAll(',', ''))) <= 1);
  if (m) {
    const count = Number(m[3].replaceAll(',', ''));
    const resized = structuredClone(graph);
    resized.nodes[1].units = count;
    resized.nodes[1].knobs.autoscale.min = count;
    resized.nodes[1].knobs.autoscale.max = count;
    const busy = runDay(p, resized).r.nodes.find(n => n.id === 'v').peakUtil;
    check('applying the advice lands near 70 percent peak busy', busy <= 0.71 && busy >= 0.6, String(busy));
  }
}
section('Unreached dependencies do not receive repair advice');
{
  const base = problemById.get('url-shortener');
  const p = { ...base, requirements: { ...base.requirements, peakRps: 60000 }, events: [{ id: 'slow-dependency', at: '10:00' }] };
  const graph = { nodes: [
    { id: 'u', type: 'mobile-app', x: 0, y: 0, knobs: { retries: 0 } },
    { id: 'v', type: 'vm-fleet', x: 100, y: 0, units: 100 },
    { id: 'sql', type: 'sql-primary', x: 200, y: 0 },
    { id: 'dep', type: 'payment-processor', x: 300, y: 0 }
  ], edges: [{ from: 'u', to: 'v' }, { from: 'v', to: 'sql' }] };
  const story = runDay(p, graph).r.events.find(e => e.id === 'slow-dependency')?.story;
  check('general dependency teaching is separate from the next action', /In general, timeouts/.test(story?.hurt || '') && /Fix.*SQL/.test(story?.fix || '') && !/timeout|circuit breaker/i.test(story?.fix || ''), JSON.stringify(story));
}

section('Debrief wording follows what was measured');
{
  const bad = [];
  for (const p of problems) {
    for (const [i, d] of p.editorial.designs.entries()) {
      const { r } = runDay(p, d.graph);
      const texts = [r.verdict, r.nextStep?.text, ...r.tradeoffs.map((t) => t.text), ...r.events.flatMap((e) => Object.values(e.story || {}))].filter(Boolean);
      for (const t of texts) {
        if (/999 percent|undefined|NaN|\b0 minutes\b|\b1 minutes\b|\b1 requests\b|\d\.\d requests failed|missing pieces: nothing|grew into 1 times/.test(t)) bad.push(`${p.id} d${i}: ${t.slice(0, 120)}`);
      }
    }
  }
  check('no story says 999 percent, 0 minutes, nothing or undefined', bad.length === 0, bad.slice(0, 5).join(' | '));
}

section('Reference designs');
{
  let ok = 0, total = 0;
  const failing = [];
  for (const p of problems) {
    const { r } = runDay(p, p.editorial.designs[0].graph);
    total++;
    if (r.passed) ok++; else failing.push(p.id);
    const exp = p.editorial.designs[0].expect;
    if (exp && exp.passed != null && exp.passed !== r.passed) failing.push(p.id + ' (label out of date)');
  }
  console.log(`  ${ok} of ${total} first reference designs pass. Not yet: ${failing.join(', ') || 'none'}`);
  check('at least 90 percent of first reference designs pass their own day', ok / total >= 0.9, `${ok}/${total}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
