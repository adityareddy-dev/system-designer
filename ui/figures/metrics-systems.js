// Cartesian label sets, samples through a storage path and a split-query cache.
import {mount,range,button,toggle,box,packet,text} from './bench.js';
export const seriesFor=(hosts,paths,users)=>Array.from({length:hosts},(_,h)=>Array.from({length:paths},(_,p)=>Array.from({length:users},(_,u)=>`h${h}/p${p}/u${u}`))).flat(2);
export const model={note:'Model: all combinations of host, path and optional user labels exist. One 16-byte sample per series per tick, excluding index and compression overhead. Query cache keys include the time slice and storage generation; each query has four equal slices and one read per uncached slice. Queries cover sealed blocks; active WAL reads bypass this cache.',
 controls:[range('hosts','Hosts',1,8,3),range('paths','Paths',1,6,2),range('users','User label values',1,20,1),button('ingest','Ingest one tick'),button('block','Seal a block'),button('compact','Compact blocks'),button('query','Run split query'),button('advance','Query next time range')],
 initial:view=>({hosts:3,paths:2,users:view==='cardinality'?10:1,wal:0,blocks:[],writes:0,generation:0,cache:[],offset:0,hits:0,ticks:0,message:'Each distinct label tuple is a series. Add a label before ingesting a tick.',event:0}),
 update(s,a,v){s=structuredClone(s);s.event++;if(['hosts','paths','users'].includes(a)){s[a]=v;s.message=`Now ${seriesFor(s.hosts,s.paths,s.users).length} series, one per label tuple.`;}
 if(a==='ingest'){const n=seriesFor(s.hosts,s.paths,s.users).length;s.wal+=n;s.writes+=n;s.ticks++;s.message=`${n} samples appended to the log. ${s.wal} samples waiting for a block.`;}
 if(a==='block'){if(s.wal){s.blocks.push(s.wal);s.writes+=s.wal;s.wal=0;s.generation++;}s.message=`${s.blocks.length} immutable blocks sealed.`;}
 if(a==='compact'){const n=s.blocks.reduce((a,b)=>a+b,0);s.blocks=n?[n]:[];s.writes+=n;s.generation++;s.message=`Merged blocks containing ${n} samples. Retention is unchanged.`;}
 if(a==='advance'){s.offset++;s.message='Query range moved forward by one slice. Three slices can be reused.';}
 if(a==='query'){s.hits=0;for(let i=s.offset;i<s.offset+4;i++){const key=`${s.generation}:${i}`;if(s.cache.includes(key))s.hits++;else s.cache.push(key);}s.message=`Split into 4 slices: ${s.hits} cache hits, ${4-s.hits} storage reads.`;}
 return s;},
 view(s){const series=seriesFor(s.hosts,s.paths,s.users).length;return {svg:box(12,12,336,60,'Label combinations',`${s.hosts} × ${s.paths} × ${s.users} = ${series}`)+box(12,96,160,60,'Write log',`${s.wal} samples`)+box(188,96,160,60,'Blocks',s.blocks.join(' + ')||'empty')+box(12,180,336,60,'Query: four slices',`${s.hits} cached · ${4-s.hits} read`)+packet('samples',s.blocks.length?310:80,s.blocks.length?140:130,80,50),caption:s.message,stats:{'active series':series,'bytes per tick':series*16,'sample writes':s.writes,'cache hits':s.hits}};}
};
export const mountFigure=(h,c,s)=>mount(h,c,s,model);
