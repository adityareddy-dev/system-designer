import assert from 'node:assert/strict';
import { lessons } from '../content/lessons/index.js';
const plain=[];
for(const lesson of lessons)for(const [i,step]of lesson.steps.entries()){
 if(step.kind==='read'&&(step.text||'').split(/\s+/).length>120&&!step.diagram&&!step.tap&&i!==0)plain.push(`${lesson.id} step ${i+1}: ${step.title}`);
 if(['Go deeper','Lead the design'].includes(lesson.track)&&step.kind==='read'&&i>0)assert(step.diagram,`${lesson.id}: worked and operational reading has a labelled diagram`);
 if(step.diagram){assert.equal(step.diagram.parts.length,3);assert(step.diagram.parts.every(p=>p[0].length&&p[1].length));}
}
console.log('Steps over 120 words without a visual or interaction:',plain);
assert.deepEqual(plain,[]);
const numbers=lessons.find(l=>l.id==='back-of-envelope');
assert(numbers.steps.find(s=>s.kind==='demo').estimate);
assert.equal(numbers.transfer.answer,2);
assert.equal(numbers.transfer.value,Math.ceil(200*8/(400*.75)));
const {model,triggers}=await import('../ui/figures/simplest-design.js');
let s=model.initial('timeline');
assert.deepEqual(triggers(s),{write:28,restore:25,crossing:25,finish:12,safe:true});
s=model.update(s,'start',20);assert.equal(triggers(s).safe,false);
assert.equal(triggers(s).finish,26);
console.log('Reading diagrams, estimate gate and migration lead-time arithmetic passed.');
