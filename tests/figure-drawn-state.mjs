// Independent checks of visible entities and destinations after every control step.
import assert from 'node:assert/strict';
import { lessons } from '../content/lessons/index.js';
import { hash } from '../ui/figures/bench.js';
const number = n => String(n);
const checks = {
 'requests-and-latency': (s,d) => d.has('p50 (ms)', 'p99 (ms)', `Request ${s.sent}:`),
 'back-of-envelope': (s,d) => d.has(`${s.people}M × ${s.requests}`, ((s.people*1e6*s.requests/86400)*s.peak).toFixed(1)),
 'load-balancing': (s,d) => s.jobs.forEach((jobs,i)=>d.bar('Server '+(i+1), jobs.length)),
 caching: (s,d) => {d.has(`v${s.origin}`,s.cached===null?'empty':'v'+s.cached);d.mark('origin:'+s.origin,310,55);if(s.cached!==null)d.mark('cached:'+s.cached,310,210);},
 cdn: (s,d) => {d.has(s.bytes.toLocaleString('en-US'));d.mark('origin:1',300,50);for(const site of s.cached)d.mark('edge:'+site+':1',site==='west'?150:320,210);},
 autoscaling: (s,d) => d.has(`${s.servers} × 100`, `${s.load}/minute`, s.pending.length?'ready at':'none'),
 'replication-lag': (s,d) => {d.mark('primary:'+s.primary,300,65);d.mark('replica:'+s.replica,300,210);d.has('v'+s.primary,'v'+s.replica);},
 sharding: (s,d) => {for(let i=0;i<40;i++)assert(d.keys.includes('user:'+i));assert.equal(d.keys.length,40);},
 'hot-keys': (s,d) => d.mark('hot',140+Math.min(150,((s.cache?1:s.hot)+Array.from({length:20},(_,i)=>hash('cold'+i)%s.n).filter(n=>n===hash('popular')%s.n).length)/120*155),13+(hash('popular')%s.n)*37),
 'search-indexing': (s,d) => {d.has(s.db[1],s.index[1]);d.mark('database:'+s.db[1],300,65);d.mark('index:'+s.index[1],300,210);},
 'storage-tiers': (s,d) => d.mark('object',300,35+(s.age<7?0:s.age<30?1:s.age<90?2:3)*58),
 'queues-backpressure': (s,d) => {d.has(s.queue.length+' waiting');s.queue.slice(0,48).forEach((q,i)=>d.mark('job'+q.id,25+i%16*20,100+Math.floor(i/16)*35));assert.equal(d.keys.length,Math.min(48,s.queue.length));},
 fanout: (s,d) => {d.has(s.posts+' posts');if(s.posts){d.mark('author',320,45);for(const key of d.keys.filter(k=>/^(copy|read):/.test(k)))assert.equal(d.marks[key][1],s.mode==='on write'?229:65);}},
 'realtime-connections': (s,d) => d.has(s.connected?'Open · 64 KB':'Closed · 0 KB',s.time<s.expires?'Online':'Offline'),
 consistency: (s,d) => {d.mark('primary:'+s.primary,300,55);d.mark('replica:'+s.replica,300,210);if(s.lastRead)d.mark('answer:'+s.lastRead.id,180,120);},
 'idempotency-retries': (s,d) => {d.has(s.charges+' charges');if(s.last==='pay')assert(!d.keys.some(k=>k.startsWith('receipt:')));if(s.last==='retry')d.mark('receipt:'+s.event,220,55);},
 'rate-limiting': (s,d) => {d.has(s.tokens+'/10 tokens',s.accepted+' allowed');assert.equal(d.keys.filter(k=>k.startsWith('token')).length,s.tokens);if(s.last==='send')for(let i=0;i<4;i++)d.mark('batch:'+s.event+':'+i,240+i*25,i<s.batch?210:135);},
 'circuit-breakers': (s,d) => {d.has('Breaker: '+s.state,s.upstream+' calls reached');if(s.last==='call')d.mark('call:'+s.event,300,s.reached?210:130);},
 'multi-region': (s,d) => {d.mark('primary:'+s.primary,300,55);d.mark('standby:'+s.standby,300,210);d.has(s.down?'× fenced':'writable',s.promoted?'writable':'read only');},
 observability: (s,d) => d.has(s.repair+' minutes',(s.ran?((s.alerts?1:30)+s.repair)*100:0)+' failed'),
 cost: (s,d) => {const n=Math.ceil(Math.max(s.peak,s.quiet)/100);d.bar('Peak servers',n);d.bar('Quiet servers',s.scale?Math.ceil(s.quiet/100):n);},
 'security-compliance': (s,d) => d.has(...['read orders','write orders','read profiles','delete backups'].map(a=>(!s.least||a==='read orders'?'✓':'×')+' '+a)),
 'ai-serving': (s,d) => d.has((10-s.hits)*s.tokens+' tokens',((10-s.hits)*s.tokens/(s.units*100)).toFixed(2)+' seconds'),
 'consistent-hashing': (s,d) => {if(s.mode==='migration'){for(const [i,id]of s.old.slice(-10).entries())d.mark('old:'+id,30+i*30,72);for(const [i,id]of s.target.slice(-10).entries())d.mark('new:'+id,30+i*30,215);d.has(s.fenced?'Fenced: reject':'Writable: accepts',s.routed?'Current route':'Not serving yet');}else for(let i=0;i<48;i++)assert(d.keys.includes('user:'+i));},
 'copies-quorums': (s,d) => {for(let i=0;i<s.n;i++){d.has(String.fromCharCode(65+i)+'  v'+s.values[i]);if(s.deliveries.includes(i))d.mark('reply'+i,s.direction==='read'?270+i*12:310,s.direction==='read'?35:83+i*34);}},
 'leader-consensus': (s,d) => {if(s.focus==='fence')d.has('Highest token '+s.storedToken);else {for(let i=0;i<5;i++)d.has(String.fromCharCode(65+i)+' t'+s.terms[i]);if(s.leader!==null)d.mark('crown',320,26+s.leader*36);} },
 'consistency-models': (s,d) => {if(s.mode==='snapshot')d.has(s.doctors.reduce((a,b)=>a+b,0)+' on call');else{d.mark('primary:'+s.primary,150,55);d.mark('replica:'+s.replica,320,55);for(const [i,r]of s.reads.slice(-4).entries())d.mark('read'+r.id,30+i*80,r.client==='A'?120:210);}},
 'storage-engine': (s,d) => {if(s.focus==='read'){for(let i=0;i<Math.min(3,s.files.length);i++)d.has('SSTable '+(i+1));}else d.has(s.log.length+' log records',Object.keys(s.mem).join(' ')||'empty',s.leaves.map(l=>'['+l.join(' ')+']').join(' '));},
 'work-across-services': (s,d) => {if(s.mode==='saga')for(const name of ['reserve','charge','ship'])d.has(name,s.done.includes(name)?'Done':s.undone.includes(name)?'Compensated':s.failed&&name===s.fail?'Failed':'Waiting');else d.has(+s.order+' orders',s.outbox.length+' outbox',s.consumed.length+' unique effects');},
 'ordering-time': (s,d) => {d.has('Laptop','Phone');if(s.mode==='counter')d.has('['+s.ca+']','['+s.cb+']');else{if(s.a)d.has('clock '+s.a.stamp);if(s.b)d.has('clock '+s.b.stamp);}},
 'device-sync': (s,d) => d.has(s.a.length+' pending deltas',s.b.length+' pending deltas',s.synced?'Connected: exchanged':'Offline: independent'),
 'privacy-design': (s,d) => {for(const [i,id]of ['heart','route','summary'].entries())d.mark(id,s.uploaded&&s[id]!=='local'?320:230,45+i*70);},
 'metrics-systems': (s,d) => d.has(`${s.hosts} × ${s.paths} × ${s.users}`,s.wal+' samples',s.blocks.join(' + ')||'empty',s.hits+' cached'),
 'logs-traces': (s,d) => {if(s.experiment==='traces'){assert.equal(d.keys.filter(k=>k.startsWith('head')).length,s.head.length);assert.equal(d.keys.filter(k=>k.startsWith('tail')).length,s.tail.length);assert.equal(d.keys.filter(k=>k.startsWith('stream')).length,100);}else d.has('Index: '+s.index,'Matching document ids');},
 'slos-error-budgets': (s,d) => {d.has(s.error+'% errors for '+s.duration);d.mark('clock',20+s.minute/720*320,210);},
 'multi-tenancy': (s,d) => {for(let i=0;i<6;i++)d.has(i?'Tenant '+String.fromCharCode(65+i):'Noisy A');assert.equal((d.svg.match(/class="fg-bar/g)||[]).length,6);},
 'lead-interview': (s,d) => {for(const p of ['scope','numbers','design','depth'])d.bar(p,s[p]);d.has((60-s.scope-s.numbers-s.design-s.depth)+' minutes left');},
 'simplest-design': (s,d) => {if(s.focus==='timeline'){
  d.has('Write ceiling','Restore ceiling');assert(s.start+s.lead<=36,'the full plan fits the measured horizon');
  const x=m=>20+m/36*320;d.mark('start',x(s.start),172);d.mark('finish',x(s.start+s.lead),172);
  const write=Array.from({length:37},(_,m)=>600*s.growth**(m/12)).findIndex(n=>n>=s.ceiling);
  if(write>=0)d.mark('write-limit',x(write),76);
  const restore=Math.ceil((s.recovery-10)/2);if(restore<=36)d.mark('restore-limit',x(restore),121);
 }else d.has('Buy, 3 years','Build, 3 years',s.load+' RPS');},
 'running-migrations': (s,d) => {d.has(s.stage+'/6');for(const [i,r]of s.rows.entries())d.has(`Row ${i+1}: ${r.old??'dropped'}`,`New: ${r.new??'not copied'}`);},
 'team-boundaries': (s,d) => {for(const name of ['Mobile','Billing','Export'])d.has(name);assert.equal((d.svg.match(/<text[^>]*>[^<]*100 calls/g)||[]).length,3);},
};
function drawn(svg){
 const labels=[...svg.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map(m=>m[1].replaceAll('&amp;','&').replaceAll('&#39;',"'").replaceAll('&lt;','<'));
 const marks=Object.fromEntries([...svg.matchAll(/data-key="([^"]+)" data-x="([^"]+)" data-y="([^"]+)"/g)].map(m=>[m[1],[+m[2],+m[3]]]));
 return {svg,marks,keys:Object.keys(marks),has(...parts){for(const p of parts)assert(labels.some(l=>l.includes(p)),'Visible label: '+p+' in '+labels.join(' | '));},mark(id,x,y){assert.deepEqual(marks[id],[x,y],id+' drawn destination');},bar(label,value){const i=labels.indexOf(label);assert(i>=0,label);assert.equal(labels[i+1],number(value));}};
}
for(const lesson of lessons.filter(l=>l.id!=='intro')){
 const m=(await import(`../ui/figures/${lesson.id}.js`)).model;
 assert(checks[lesson.id],lesson.id+' has an independent drawing assertion');
 for(const step of lesson.steps.filter(s=>s.kind==='figure')){
  let s=m.initial(step.view);const check=()=>checks[lesson.id](s,drawn(m.view(s).svg));check();
  // Run two rounds, including altered knobs, blocked operations, repeats and reads.
  for(let round=0;round<2;round++)for(const c of m.controls){
   const v=c.type==='range'?(round?c.min:c.max):c.type==='checkbox'?!s[c.id]:c.type==='select'?(Array.isArray(c.options.at(-1))?c.options.at(-1)[0]:c.options.at(-1)):undefined;
   s=m.update(s,c.id,v);check();
  }
 }
 console.log('DRAWN',lesson.id);
}
// A snapshot and replay are copies even while the source is still writable.
const {model:m}=await import('../ui/figures/consistent-hashing.js');let s=m.initial('migration');
for(const a of ['write','snapshot','write','replay','fence','replay','route','staleWrite','write']){s=m.update(s,a);checks['consistent-hashing'](s,drawn(m.view(s).svg));}
