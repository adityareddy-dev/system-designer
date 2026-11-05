import assert from 'node:assert/strict';
import fs from 'node:fs';
import { problems, problemById } from '../content/problems/index.js';
import { lessons } from '../content/lessons/index.js';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import sizing from '../content/sizing.js';
import { defenseQuestions } from '../ui/play/interview.js';
import { checkFor } from '../ui/play/design-check.js';

const read = file => JSON.parse(fs.readFileSync(new URL(`../catalog/${file}.json`,import.meta.url)));
const catalog = createCatalog({elements:read('elements'),requests:read('requests'),events:read('events'),world:read('world')});
const ids=['logs-platform','tracing-platform','tenant-metrics','device-notes','wearable-health'];
const newLessons=new Set(lessons.slice(-17).map(l=>l.id));
for (const id of ids) {
  const p=problemById.get(id);
  assert.equal(p.difficulty,'Hard');
  assert(p.clarify.length >= 2 && p.clarify.length <= 4);
  assert.equal(p.hints.length,3);
  assert(p.numbers.filter(n=>n.ask).length>=1);
  assert(p.events.length>=2);
  assert(p.concepts.filter(c=>newLessons.has(c)).length>=3);
  assert(!/\u2014/u.test(JSON.stringify(p)),id+' punctuation');
  assert(p.correctness?.fields?.length>=2 && p.correctness.limits);
  assert(p.traffic.sourceTypes, id + ' source assignments');
  assert(checkFor(p)?.calculation, id + ' prediction check');
  assert(sizing[id]?.[0]?.passed, id + ' measured Hard sizing');
  const rate=p.workloadPlan.reduce((sum,w)=>sum+w.peakRps,0);
  assert(Math.abs(rate-p.requirements.peakRps)<1e-6,id+' aggregate rate');
  for (const [type,share] of Object.entries(p.requirements.mix)) {
    const planned=p.workloadPlan.reduce((sum,w)=>sum+w.peakRps*(w.mix[type]||0),0);
    assert(Math.abs(planned-rate*share)<1e-6,id+' aggregate '+type);
  }
  for (const d of p.editorial.designs) {
    for (const node of d.graph.nodes) for (const [key,value] of Object.entries(node.knobs || {})) {
      const knob=catalog.knobs[key];
      assert(knob,id+' known knob '+key);
      const options=key === 'mode' ? catalog.elementById.get(node.type).params?.modes || knob.options : knob.options;
      if (knob.type === 'enum') assert(options.includes(value),id+' editor can select '+key+'='+value);
    }
    const sim=createSim({catalog,problem:p,seed:'practice',mode:'practice'});
    sim.loadGraph(d.graph);
    assert.equal(sim.getGraph().edges.length,d.graph.edges.length,id+' no refused edges');
    assert.deepEqual(sim.validate(),[],id+' clean validation');
    // Every source has its own usable route, including when another source still works.
    for (const w of p.workloadPlan) {
      assert(d.graph.nodes.some(n=>n.ref===w.sourceRef));
      assert(d.graph.edges.some(([a,b])=>a===w.sourceRef && b===w.entryRef));
      const broken=createSim({catalog,problem:p,seed:'practice'});
      broken.loadGraph(d.graph);
      broken.disconnect(w.sourceRef+'>'+w.entryRef);
      assert(broken.validate().some(issue=>issue.code==='source-type-unserved' && issue.nodeId===w.sourceRef),id+' per-source preflight');
      broken.start();broken.advance(86400000);
      assert.equal(broken.result().firstFailure.kind,'routing',id+' routing diagnosis');
      assert(!broken.result().nextStep.sizing,id+' no capacity repair for a route gap');
    }
    sim.start();sim.advance(86400000);
    const result=sim.result();
    assert(defenseQuestions(p,result.graph,result,catalog).length>=3,id+' measured interview follow-ups');
    assert(result.passed,id+' reference passes');
    assert.equal(Math.round(result.score.total),d.expect.score,id+' measured score');
    assert.equal(Math.round(result.slo.cost.perMonth),d.expect.costPerMonth,id+' measured cost');
    const file=JSON.parse(fs.readFileSync(new URL(`../content/data/p/${id}.json`,import.meta.url)));
    assert.deepEqual(file,p,id+' generated data');
  }
}
const tenant=problemById.get('tenant-metrics');
const overloaded=createSim({catalog,problem:tenant,seed:'practice'});
overloaded.loadGraph(tenant.editorial.designs[0].graph);overloaded.setKnob('api','units',3);
assert.deepEqual(overloaded.validate(),[]);
overloaded.start();overloaded.advance(86400000);
assert.equal(overloaded.result().firstFailure.kind,'capacity');
assert.equal(overloaded.result().nextStep.nodeId,'api');
assert(overloaded.result().nodes.find(n=>n.id==='api').failed>0);
for (const lesson of newLessons) assert(problems.some(p=>!ids.includes(p.id)&&p.concepts.includes(lesson)),lesson+' linked from existing problems');
const logs=problemById.get('logs-platform'),traces=problemById.get('tracing-platform');
assert.equal(logs.numbers[1].value,100*86400*30/1e6);
assert.equal(traces.numbers[1].value,10000*20*500*30/1e6);
assert.equal(problemById.get('wearable-health').numbers[0].value,16*86400*14/1e6);
assert.equal(problemById.get('tenant-metrics').requirements.storageTb,(10e6/15)*1.5*86400*14/1e12);
assert.equal(catalog.elementById.get('timeseries-db').capacity.writeRps,3000);
assert.equal(catalog.requestById.get('batch').sizeKb,100000);
console.log('Five Hard problems: full-day passing references, honest source plans, catalog magnitudes, checkpoints, links and generated data passed.');
