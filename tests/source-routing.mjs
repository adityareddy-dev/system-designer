// Source-specific routes, honest capacity diagnoses, event wording and formatted durations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { problemById, problems } from '../content/problems/index.js';
import { duration } from '../ui/play/debrief.js';
import { reflectionCorrect, reflectionTarget } from '../ui/play/reflection.js';
const catalog = createCatalog(Object.fromEntries(['elements','requests','events','world'].map(k => [k, JSON.parse(fs.readFileSync(`catalog/${k}.json`, 'utf8'))])));
const p = problemById.get('observability-platform');
assert(!p.editorial.designs[0].graph.edges.some(([a,b]) => a === 'dist' && b === 'qry'));
const play = problem => { const sim = createSim({ catalog, problem, seed: 'practice' }); sim.loadGraph(p.editorial.designs[0].graph); return sim; };
const isolated = play(p);
assert.equal(isolated.validate().filter(i => i.level === 'error').length, 0);
isolated.start(); isolated.advance(86400000);
assert.equal(isolated.result().passed, true, 'separate ingest and query paths pass');
const shared = play({ ...p, traffic: { ...p.traffic, sourceTypes: null }, events: [] });
assert(shared.validate().some(i => i.code === 'source-type-unserved' && i.nodeId === 'agents' && i.type === 'read'));
shared.start(); shared.advance(86400000);
assert.match(shared.result().nextStep.text, /source|route/i);
assert.doesNotMatch(shared.result().nextStep.text, /ran out of room/);
assert(!shared.result().nextStep.knob, 'a routing diagnosis never offers a capacity lever');
assert.equal(shared.result().firstFailure.kind, 'routing');
const target = reflectionTarget(shared.result());
assert.equal(reflectionCorrect(target, target.id, target.percent), true);
assert.equal(reflectionCorrect(target, 'not-the-cause', target.percent), false);
const rush = isolated.result().events.find(e => e.id === 'thundering-herd');
assert.match(rush.name, /Dashboard/); assert.doesNotMatch(JSON.stringify(rush.story), /sign-in|reconnect/);
assert.equal(duration(10), '10 seconds');
for (const p of problems) {
  for (const d of p.editorial.designs) {
    const sim = createSim({ catalog, problem: p, seed: 'practice' }); sim.loadGraph(d.graph); sim.start(); sim.advance(86400000);
    const r = sim.result();
    assert.doesNotMatch(JSON.stringify([r.verdict, r.nextStep.text, r.events.map(e => [e.story, e.vars])]), /\d+\.\d{4,}/, `${p.id} exposes an unformatted decimal`);
    if (r.nextStep.text.includes('ran out of room')) {
      const n = r.nodes.find(n => n.id === r.nextStep.nodeId);
      assert(n?.peakUtil > 1, `${p.id} blames capacity below saturation`);
    }
  }
}
const file = problemById.get('file-sync');
const sim = createSim({ catalog, problem: file }); sim.loadGraph(file.editorial.designs[0].graph); sim.start(); sim.advance(86400000);
const unbuffered = structuredClone(file.editorial.designs[0].graph);
const removed = new Set(unbuffered.nodes.filter(n => n.type === 'queue' || n.type === 'worker-pool').map(n => n.ref));
unbuffered.nodes = unbuffered.nodes.filter(n => !removed.has(n.ref));
unbuffered.edges = unbuffered.edges.filter(([a,b]) => !removed.has(a) && !removed.has(b));
const noQueue = createSim({ catalog, problem: file }); noQueue.loadGraph(unbuffered); noQueue.start(); noQueue.advance(86400000);
assert.match(noQueue.result().events.find(e => e.id === 'disk-full').story.fix, /queue|writes.*wait/i);
assert(sim.result().slo.availability.actual > noQueue.result().slo.availability.actual, 'buffering the write path actually improves disk-full survival');
function dnsTrial(ttl, loose = false) {
  const trial = createSim({ catalog, problem: { id: 'dns-ttl', requirements: { peakRps: 100, mix: { read: 1 }, latencyP99Ms: { default: 1000 } }, traffic: { curve: 'flat', sources: { 'web-browser': 1 } }, events: [{ id: 'dns-misconfig', at: '12:00' }] } });
  const source = trial.addNode('web-browser',-400,0), dns = trial.addNode('dns',-200,0), lb = trial.addNode('regional-lb',0,0), app = trial.addNode('vm-fleet',200,0), db = trial.addNode('sql-primary',400,0);
  trial.setKnob(dns,'ttlSec', loose ? 3600 : ttl);
  if (loose) trial.setKnob(trial.addNode('dns',0,200),'ttlSec',ttl);
  trial.connect(source,dns); trial.connect(dns,lb); trial.connect(lb,app); trial.connect(app,db);
  trial.start(); trial.advance(86400000); return trial.result();
}
const longDns = dnsTrial(3600), shortDns = dnsTrial(60);
assert(shortDns.slo.availability.actual > longDns.slo.availability.actual, 'short TTL fixes the modeled cache lifetime');
assert.equal(dnsTrial(60,true).slo.availability.actual, longDns.slo.availability.actual, 'a disconnected low-TTL resolver does not help');
console.log('Per-source routing, reference isolation, causal advice, event overrides and decimal formatting passed.');

