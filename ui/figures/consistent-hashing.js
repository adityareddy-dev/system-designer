// Key placement and a write ledger for a single migrating range.
import {mount,hash,range,select,button,toggle,text,line,box,dot,packet} from './bench.js';
export const keys=Array.from({length:48},(_,i)=>'user:'+i);
export function owners(n,vnodes=1){return Array.from({length:n},(_,i)=>Array.from({length:vnodes},(_,v)=>({owner:i,at:hash(`owner:${i}/v:${v}`)}))).flat().sort((a,b)=>a.at-b.at);}
export function placement(key,n,vnodes,mode){const h=hash(key);if(mode==='mod')return h%n;const ring=owners(n,vnodes);return (ring.find(p=>p.at>=h)||ring[0]).owner;}
export const model={
  note:'Model: 48 equal-sized records, no replicas. FNV-derived 32-bit hashes are real; this small sample need not be balanced. Migration uses one append-only range and an authoritative fence checked by every write.',
  controls:[select('mode','Placement',[['ring','Hash ring'],['mod','Hash mod N'],['migration','Move a live range']]),range('n','Owners',2,6,3),range('vnodes','Positions per owner',1,16,1),toggle('hot','Make user:0 hot'),button('write','Write to range'),button('staleWrite','Write using old route'),button('snapshot','Take snapshot'),button('replay','Replay writes'),button('fence','Fence old owner'),button('route','Route to new owner'),button('unsafe','Unsafe cutover'),button('diagnose','Check writes')],
  initial:view=>({mode:view==='migration'?'migration':'ring',n:3,vnodes:view==='spread'?8:1,hot:false,previous:null,old:[1,2],target:[],log:[1,2],ack:[1,2],next:3,fenced:false,routed:false,snapshot:false,message:'The old owner has writes 1 and 2.',event:0}),
  update(s,a,v){s=structuredClone(s);s.event++;if(['mode','n','vnodes','hot'].includes(a)){s.previous={n:s.n,vnodes:s.vnodes,mode:s.mode};s[a]=v;return s;}
    s.mode='migration';
    if(a==='write'||a==='staleWrite'){const id=s.next++,oldRoute=a==='staleWrite'||!s.routed;if(!oldRoute)s.target.push(id);else if(!s.fenced){s.old.push(id);s.log.push(id);}else {s.next--;s.message='The old owner rejected the write. Retry after routing.';return s;}s.ack.push(id);s.message=`Acknowledged write ${id} at the ${oldRoute?'old':'new'} owner.`;}
    if(a==='snapshot'){s.target=[...s.old];s.snapshot=true;s.message=`Copied ${s.target.length} writes from a snapshot.`;}
    if(a==='replay'){s.target=[...new Set([...s.target,...s.log])].sort((a,b)=>a-b);s.message=`Replayed through write ${Math.max(0,...s.log)}.`;}
    if(a==='fence'){s.fenced=true;s.message='The old owner now rejects all writes. Replay once more before routing.';}
    if(a==='route'||a==='unsafe'){s.routed=true;s.message=a==='unsafe'?'Routing switched without a readiness check. Try a write, then check both owners.':'Routing switched. The ledger below checks whether the order was safe.';}
    if(a==='diagnose'){const missing=s.ack.filter(x=>!s.target.includes(x));s.message=`${missing.length} acknowledged writes missing at the new owner: ${missing.join(', ')||'none'}. ${!s.fenced?'Old ownership is still writable.':'Old ownership is fenced.'}`;}
    return s;
  },
  view(s){if(s.mode==='migration'){const missing=s.ack.filter(x=>!s.target.includes(x));return {svg:box(12,10,336,75,'Old owner',s.fenced?'Fenced: reject writes':'Writable: accepts old routes',s.fenced?'is-bad':'')+box(12,153,336,75,'New owner',s.routed?'Current route':'Not serving yet',s.routed?'is-good':'')+line(180,85,180,153)+s.old.slice(-10).map((id,i)=>dot('w'+id,30+i*30,s.target.includes(id)?215:72,String(id))).join('')+s.target.filter(id=>!s.old.includes(id)).slice(-5).map((id,i)=>packet('w'+id,200+i*28,215,180,110,String(id))).join(''),caption:s.message,stats:{'missing writes':missing.length,'new writes':s.target.length,'ownership version':s.fenced?2:1}};}
    const assigned=keys.map(k=>placement(k,s.n,s.vnodes,s.mode));const old=s.previous&&s.previous.mode!=='migration'?keys.map(k=>placement(k,s.previous.n,s.previous.vnodes,s.previous.mode)):assigned;
    const moved=assigned.filter((v,i)=>v!==old[i]).length;const counts=Array.from({length:s.n},(_,i)=>assigned.filter(v=>v===i).length);let svg='';
    if(s.mode==='ring'){svg='<circle class="fg-ring" cx="180" cy="78" r="56"/>'+owners(s.n,s.vnodes).map(p=>{const angle=p.at/2**32*Math.PI*2-Math.PI/2;return dot('owner'+p.owner+'-'+p.at,180+56*Math.cos(angle),78+56*Math.sin(angle),'','fg-owner-'+p.owner);}).join('')+text(12,23,'Clockwise')+text(12,46,'next owner','fg-small')+text(12,85,`${s.vnodes} virtual`,'fg-small')+text(12,106,'positions each','fg-small');}
    else svg=box(30,30,300,80,'Hash modulo N',`owner = hash(key) % ${s.n}`);
    const seen=Array(s.n).fill(0);
    svg+=counts.map((n,i)=>text(15+i*(336/s.n),159,`${i}: ${n}`,'fg-small')).join('');
    svg+=assigned.map((owner,i)=>{const j=seen[owner]++,cols=Math.floor((336/s.n-12)/11);const x=18+owner*(336/s.n)+(j%cols)*11,y=180+Math.floor(j/cols)*10;return dot(keys[i],x,y,'',old[i]!==owner?'is-good':'fg-owner-'+owner).replace('<circle',`<title>${keys[i]} · hash ${hash(keys[i])} · owner ${owner}</title><circle`);}).join('');
    const hotOwner=assigned[0];return {svg,caption:`${moved} of 48 keys changed owner. Columns label owner: key count; green keys moved. ${s.hot?`user:0 sends 100 requests to owner ${hotOwner}; it is still one key.`:'Each key sends one request.'}`,stats:{'keys moved':moved,'largest owner':Math.max(...counts),'requests at hot key':s.hot?100:1}};
  }
};
model.controls=model.controls.map(c=>({...c,when:s=>c.id==='mode'||(['n','vnodes','hot'].includes(c.id)?s.mode!=='migration':s.mode==='migration')}));
export const mountFigure=(host,ctx,step)=>mount(host,ctx,step,model);
