// Repair diagnoses and interview evidence follow measured facts independently of prose and part labels.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { problemById } from '../content/problems/index.js';
import { repairCase, repairCorrect } from '../ui/play/repair.js';
import { defenseQuestions } from '../ui/play/interview.js';
import { fmtNum } from '../ui/play/util.js';

const catalog = createCatalog(Object.fromEntries(['elements', 'requests', 'events', 'world'].map(key =>
  [key, JSON.parse(fs.readFileSync(new URL(`../catalog/${key}.json`, import.meta.url)))])));
function day(problem, edit = () => {}) {
  const sim = createSim({ catalog, problem });
  sim.loadGraph(problem.editorial.designs[0].graph);
  edit(sim);
  sim.start(); sim.advance(86400000);
  return sim.result();
}

const health = problemById.get('health-records');
const slow = day(health, sim => sim.setKnob('scans', 'region', 'apac'));
assert.deepEqual(slow.checks, { availability: true, latency: false, safety: true, cost: true });
assert.match(slow.nextStep.text, /Shorten this request path/);
assert.equal(slow.nextStep.routingIssue, undefined, 'the slow request already has a complete route');
const latency = repairCase(slow, health, catalog);
assert.match(latency.choices[latency.answer], /Reduce network travel, synchronous hops or processing time/);
assert.match(latency.effects[latency.effect], /Lower p99 latency for served requests/);
assert.match(latency.evidence, /Worst p99/);
assert.equal(latency.value, 1980);
assert(repairCorrect(latency, latency.answer, latency.effect, 1980));
const routeChoice = latency.choices.findIndex(text => text.startsWith('Restore a complete path'));
const routeEffect = latency.effects.findIndex(text => text.startsWith('Completion becomes possible'));
assert(routeChoice >= 0 && routeEffect >= 0);
assert(!repairCorrect(latency, routeChoice, routeEffect, 1980), 'route restoration cannot pass a latency-only repair');
const reworded = repairCase({ ...slow, verdict: 'Requests finish, but slowly.', nextStep: { ...slow.nextStep, text: 'Reduce network distance.' } }, health, catalog);
assert.deepEqual(reworded, latency, 'changing advice wording cannot change the diagnosis');

const broken = day(health, sim => {
  const edge = sim.getGraph().edges.find(e => e.to === 'scans');
  assert(edge, 'the scan store has an incoming connection');
  sim.disconnect(edge.id);
});
assert(broken.nextStep.routingIssue?.code, 'validation exposes the missing scan route');
const missing = repairCase({ ...broken, verdict: '', nextStep: { ...broken.nextStep, text: '' } }, health, catalog);
assert.match(missing.choices[missing.answer], /Restore a complete path/);
assert.match(missing.effects[missing.effect], /Completion becomes possible/);

for (const id of ['music-streaming', 'video-on-demand', 'game-patch-day']) {
  const problem = problemById.get(id), result = day(problem);
  const cache = result.graph.nodes.find(n => catalog.elementById.get(n.type)?.kind === 'cache');
  assert.equal(cache.type, 'cdn', id);
  const questions = defenseQuestions(problem, result.graph, result, catalog);
  const question = questions.find(q => q.kind === 'cache');
  assert(question, id + ' has a cache follow-up');
  assert.equal(question.nodeId, cache.id);
  const metrics = result.nodes.find(n => n.id === cache.id);
  const label = cache.label || catalog.elementById.get(cache.type).name;
  assert(question.evidence.includes(`${label}: peak ${Math.round(metrics.peakUtil * 100)}% busy; ${metrics.minutesOverloaded || 0} overloaded minutes; ${fmtNum(metrics.failed || 0)} failed operations.`), id + ' quotes CDN utilization');
  assert(question.evidence.some(text => text.startsWith('Downstream origin: ')), id + ' includes downstream evidence');
  assert(question.checklist.some(text => text.includes('coalesced refill with request shedding')), id + ' uses the cache comparison');
  const renamed = structuredClone(result.graph);
  renamed.nodes.forEach(n => n.label = n.id === cache.id ? 'Replica partition costs' : 'Cache miss units');
  const renamedQuestions = defenseQuestions(problem, renamed, result, catalog);
  assert.deepEqual(renamedQuestions.map(q => [q.kind, q.nodeId, q.checklist[2]]), questions.map(q => [q.kind, q.nodeId, q.checklist[2]]), id + ' labels never select the question kind or related part');
  const eventQuestion = questions.find(q => q.kind === 'event');
  const event = result.events.find(e => e.hurt?.length) || result.events[0];
  const busiest = result.nodes.filter(n => n.peakUtil > 0).sort((a, b) => b.peakUtil - a.peakUtil)[0];
  assert.equal(eventQuestion.nodeId, event.hurt?.[0] || event.nodeIds?.[0] || busiest?.id, id + ' event evidence follows the affected part or measured busiest part for untargeted events');
}
console.log('Latency and routing repairs, CDN origin evidence and label-independent follow-ups passed.');
