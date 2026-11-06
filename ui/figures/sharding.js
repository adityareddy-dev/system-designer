// Real keys hashed into shards versus a deliberately skewed country key.
import {mount,hash,range,select,bars,dot} from './bench.js';
export const records=Array.from({length:40},(_,i)=>({id:'user:'+i,country:i<24?'large':'country'+i%4}));
export function counts(s){return records.reduce((ns,r)=>{ns[hash(r[s.key])%s.n]++;return ns;},Array(s.n).fill(0));}
export const model={note:'Model: 40 equal-sized users, 24 from one country. Every row is hashed by the selected field. A cross-shard query contacts all shards; the model does not estimate query latency.',controls:[range('n','Shard count',2,6,4),select('key','Partition field',[['id','User id'],['country','Country']])],initial:()=>({n:4,key:'id',event:0}),update:(s,a,v)=>({...s,[a]:v,event:s.event+1}),view(s){const ns=counts(s);return {svg:bars(ns.map((n,i)=>['Shard '+i,n]),40)+records.map((r,i)=>dot(r.id,140+(i%8)*20,12+(hash(r[s.key])%s.n)*37)).join(''),caption:`${ns.join(', ')} records per shard. The largest holds ${Math.max(...ns)} of 40. Searching across all users needs ${s.n} shard queries.`,stats:{'largest shard':Math.max(...ns),'cross-shard queries':s.n}};}};
export const mountFigure=(h,c,s)=>mount(h,c,s,model);
