// Strong routing and eventual replica reads over an explicit delivery queue.
import {mount,button,select,box,packet,stored} from './bench.js';
export const model={
 note:'Model: one serial primary writer and one replica. Strong reads go to the primary; eventual reads go to the replica. A real strong-read protocol must also establish that the primary still has authority.',
 controls:[select('mode','Read target',[['eventual','Replica: eventual'],['strong','Primary: latest']]),button('write','Write next value'),button('read','Read value'),button('deliver','Deliver replication')],
 initial:()=>({mode:'eventual',primary:0,replica:0,answer:null,lastRead:null,message:'Write, read before replication, then choose a primary read.'}),
 update(s,a,v){
  s={...s};
  if(a==='mode')s.mode=v;
  if(a==='write')s.primary++;
  if(a==='deliver')s.replica=s.primary;
  if(a==='read'){
   const source=s.mode==='strong'?'primary':'replica';
   s.answer=s[source];
   s.lastRead={id:(s.lastRead?.id||0)+1,source,version:s.answer};
   s.message=`Read v${s.answer}; latest write is v${s.primary}. ${s.answer===s.primary?'Current.':'Stale.'}`;
  }
  return s;
 },
 view(s){
  const read=s.lastRead;
  return {svg:box(12,12,336,65,'Primary',`v${s.primary}`)+box(12,170,336,65,'Replica',`v${s.replica}`)+stored('primary',s.primary,300,55)+stored('replica',s.replica,300,210,300,55)+(read===null?'':packet('answer:'+read.id,180,120,300,read.source==='primary'?55:210,'v'+read.version,read.version<s.primary?'is-bad':'is-good')),caption:s.message,stats:{'primary version':s.primary,'replica version':s.replica,'answer':s.answer??'?'}};
 }
};
export const mountFigure=(h,c,s)=>mount(h,c,s,model);
