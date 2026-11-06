// Physical timestamps, vector dominance and an idempotent state-based G-counter.
import {mount,range,button,select,box,packet,text} from './bench.js';
export const dominates=(a,b)=>a.every((v,i)=>v>=b[i])&&a.some((v,i)=>v>b[i]);
export const merge=(a,b)=>a.map((v,i)=>Math.max(v,b[i]));
export const model={note:'Model: two named participants, whole-second clock offsets, a single title register and a grow-only counter. The counter merges increments, not arbitrary text or a global stock invariant.',
 controls:[range('drift','Laptop clock ahead (seconds)',-10,10,5),button('a','Laptop edits or increments'),button('b','Phone edits or increments'),button('deliver','Phone receives laptop edit'),select('mode','Merge rule',[['lww','Last write wins'],['vector','Vector clock'],['counter','Counter CRDT']]),button('merge','Merge both devices')],
 initial:view=>({drift:5,time:0,mode:view==='counter'?'counter':'lww',a:null,b:null,va:[0,0],vb:[0,0],ca:[0,0],cb:[0,0],message:view==='counter'?'Increment each device, merge, then merge the same state again.':'Edit on both devices, then merge. Advance the phone causally with Receive.',event:0}),
 update(s,a,v){s=structuredClone(s);s.event++;if(a==='drift'||a==='mode'){s[a]=v;return s;}
 if(a==='a'||a==='b'){s.time++;const laptop=a==='a';const vector=laptop?s.va:s.vb;vector[laptop?0:1]++;(laptop?s.ca:s.cb)[laptop?0:1]++;s[a]={title:`${laptop?'Laptop':'Phone'} edit ${s.time}`,stamp:s.time+(laptop?s.drift:0),at:s.time,vector:[...vector]};s.message=`${laptop?'Laptop':'Phone'} writes at real t=${s.time}, clock=${s[a].stamp}, vector=[${vector}].`;}
 if(a==='deliver'&&s.a){s.vb=merge(s.vb,s.va);s.b=s.a;s.message=`Phone receives the laptop version. Its causal history is [${s.vb}].`;}
 if(a==='merge'){if(s.mode==='counter'){const merged=merge(s.ca,s.cb);s.ca=[...merged];s.cb=[...merged];s.message=`Merge by component maximum [${merged}], total ${merged[0]+merged[1]}. Repeating merge adds nothing.`;}
 else if(!s.a||!s.b)s.message='Make an edit on both devices first.';
 else if(s.mode==='vector'){const conflict=!dominates(s.a.vector,s.b.vector)&&!dominates(s.b.vector,s.a.vector)&&s.a.title!==s.b.title;s.message=conflict?`Conflict: [${s.a.vector}] and [${s.b.vector}] are concurrent. Keep both titles.`:`One history contains the other. Keep ${dominates(s.a.vector,s.b.vector)?s.a.title:s.b.title}.`;}
 else {const winner=s.a.stamp>s.b.stamp?s.a:s.b;const newest=s.a.at>s.b.at?s.a:s.b;s.message=`Kept ${winner.title} at clock ${winner.stamp}. ${winner===newest?'The later edit survived.':'The causally or physically later edit was silently lost.'}`;}}
 return s;},
 view(s){return {svg:box(12,12,336,65,'Laptop',s.mode==='counter'?`[${s.ca}]`:s.a?`clock ${s.a.stamp} · [${s.a.vector}]`:'No edit')+box(12,155,336,65,'Phone',s.mode==='counter'?`[${s.cb}]`:s.b?`clock ${s.b.stamp} · [${s.b.vector}]`:'No edit')+packet('a',80,s.a?60:110,180,110)+packet('b',260,s.b?205:110,180,110)+text(12,127,s.mode==='counter'?'Merge: maximum per component':s.mode==='vector'?'Compare every vector component':'Compare device timestamps','fg-small'),caption:s.message,stats:{'real seconds':s.time,'laptop increments':s.ca[0],'phone increments':s.cb[1]}};}
};
export const mountFigure=(h,c,s)=>mount(h,c,s,model);
