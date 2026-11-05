import assert from 'node:assert/strict';
import fs from 'node:fs';
import { problems, problemById } from '../content/problems/index.js';
import { lessons } from '../content/lessons/index.js';
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';

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
    // Sources enter a real common front door, never each other's services to exploit global mix.
    for (const w of p.workloadPlan) {
      assert(d.graph.nodes.some(n=>n.ref===w.sourceRef));
      assert(d.graph.edges.some(([a,b])=>a===w.sourceRef && b===w.entryRef));
    }
    sim.start();sim.advance(86400000);
    const result=sim.result();
    assert(result.passed,id+' reference passes');
    assert.equal(Math.round(result.score.total),d.expect.score,id+' measured score');
    assert.equal(Math.round(result.slo.cost.perMonth),d.expect.costPerMonth,id+' measured cost');
    const file=JSON.parse(fs.readFileSync(new URL(`../content/data/p/${id}.json`,import.meta.url)));
    assert.deepEqual(file,p,id+' generated data');
  }
}
for (const lesson of newLessons) assert(problems.some(p=>!ids.includes(p.id)&&p.concepts.includes(lesson)),lesson+' linked from existing problems');
const logs=problemById.get('logs-platform'),traces=problemById.get('tracing-platform');
assert.equal(logs.numbers[1].value,100*86400*30/1e6);
assert.equal(traces.numbers[1].value,10000*20*500*30/1e6);
assert.equal(problemById.get('wearable-health').numbers[0].value,16*86400*14/1e6);
assert.equal(problemById.get('tenant-metrics').requirements.storageTb,(10e6/15)*1.5*86400*14/1e12);
assert.equal(catalog.elementById.get('timeseries-db').capacity.writeRps,3000);
assert.equal(catalog.requestById.get('batch').sizeKb,100000);
console.log('Five Hard problems: full-day passing references, honest source plans, catalog magnitudes, checkpoints, links and generated data passed.');
