// Consumer contracts checked against a changing API and an explicit retirement schedule.
import {mount,select,toggle,button,box,packet,text} from './bench.js';
export const consumers=[{name:'Mobile',field:'name',week:4},{name:'Billing',field:'name',week:2},{name:'Export',field:'name',week:6}];
export function compatibility(s,c){const version=s.versioned&&s.week<c.week?'v1':'v2';const field=version==='v1'?'name':s.change==='rename'?'display_name':'name';const expects=s.week>=c.week&&s.versioned&&s.change==='rename'?'display_name':c.field;return {version,ok:!(version==='v1'&&s.retired)&&field===expects};}
export const model={note:'Model: three consumers, each sending 100 calls/week. Renaming a required field breaks old parsers. Versioned clients migrate on agreed weeks 2, 4 and 6; retirement rejects any remaining v1 calls. The schedule is an assumption, not a prediction of adoption.',
 controls:[select('change','API change',[['add','Add optional field'],['rename','Rename required name field']]),toggle('versioned','Keep a v1 contract'),button('week','Advance one week'),button('retire','Retire v1 now')],
 initial:()=>({change:'rename',versioned:false,week:0,retired:false,event:0,message:'A required field changed. Check each consumer, then keep v1 and migrate them before retiring it.'}),
 update(s,a,v){s={...s,event:s.event+1};if(a==='week')s.week++;else if(a==='retire')s.retired=true;else s[a]=v;const states=consumers.map(c=>compatibility(s,c));s.message=`Week ${s.week}: ${states.filter(c=>!c.ok).length} broken consumers. ${states.filter(c=>c.version==='v1').length*100} v1 calls remain this week${s.retired?'; v1 is retired':''}.`;return s;},
 view(s){const checks=consumers.map(c=>compatibility(s,c));return {svg:consumers.map((c,i)=>box(12,12+i*75,336,60,c.name,`${checks[i].version} · ${checks[i].ok?'100 calls work':'100 calls break'}`,checks[i].ok?'is-good':'is-bad')+packet(c.name,s.week>=c.week&&s.versioned?310:190,48+i*75,190,48+i*75)).join(''),caption:s.message,stats:{'broken consumers':checks.filter(c=>!c.ok).length,'v1 weekly calls':checks.filter(c=>c.version==='v1').length*100,'week':s.week}};}
};
export const mountFigure=(h,c,s)=>mount(h,c,s,model);
