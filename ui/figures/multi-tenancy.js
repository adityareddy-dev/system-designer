// Counted requests assigned to workers with admission, fair dispatch and small shuffle shards.
import {mount,range,toggle,button,bars,packet,text} from './bench.js';
export const shards=[[0,1],[2,3],[0,2],[1,3],[2,3],[0,3]];
export function dispatch(s){const queues=Array.from({length:6},(_,i)=>Array.from({length:i===0?s.flood:4},()=>i));const jobs=s.fair?Array.from({length:Math.max(...queues.map(q=>q.length))},(_,r)=>queues.flatMap(q=>q[r]===undefined?[]:[q[r]])).flat():queues.flat();const used=[0,0,0,0],served=Array(6).fill(0),admitted=Array(6).fill(0);for(const t of jobs){if(s.quota&&admitted[t]>=8)continue;admitted[t]++;const eligible=s.shuffle?shards[t]:[0,1,2,3];const worker=eligible.toSorted((a,b)=>used[a]-used[b]||a-b)[0];if(used[worker]<8){used[worker]++;served[t]++;}}return {served,used,hurt:served.slice(1).filter(n=>n<4).length};}
export const model={note:'Model: six tenants, four workers with eight slots per round. Quiet tenants need four slots. The noisy tenant arrives first; fair dispatch cycles tenants, quotas admit eight each, and fixed two-worker shuffle shards isolate some overlap. Real quotas also need byte and time budgets.',
 controls:[range('flood','Noisy tenant requests',4,100,60),toggle('quota','Per-tenant quota'),toggle('fair','Fair queueing'),toggle('shuffle','Shuffle sharding'),button('run','Dispatch one round')],
 initial:()=>({flood:60,quota:false,fair:false,shuffle:false,round:0,event:0}),
 update(s,a,v){return {...s,...(a==='run'?{round:s.round+1}:{[a]:v}),event:s.event+1};},
 view(s){const r=dispatch(s);return {svg:bars(r.served.map((n,i)=>[i?'Tenant '+String.fromCharCode(65+i):'Noisy A',n,i&&n<4?'is-bad':'']),32)+r.used.map((n,i)=>packet('worker'+i,135+n*4.5,18+i*37,135,18+i*37)).join(''),caption:`Round ${s.round}: ${r.hurt} of 5 quiet tenants received fewer than 4 slots. Noisy A got ${r.served[0]} of ${s.flood}; ${r.used.reduce((a,b)=>a+b,0)} of 32 worker slots used.`,stats:{'other tenants hurt':r.hurt,'noisy requests served':r.served[0],'quiet requests served':r.served.slice(1).reduce((a,b)=>a+b,0)}};}
};
export const mountFigure=(h,c,s)=>mount(h,c,s,model);
