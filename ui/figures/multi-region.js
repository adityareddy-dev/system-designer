// An asynchronous regional standby exposes the acknowledged-write failover gap.
import {mount,button,box,packet,stored} from './bench.js';
const missing = s => s.down ? s.missing : Math.max(0,s.primary-s.standby);
export const model={
 note:'Model: two regions, one asynchronous standby, and promotion only after the old region is fenced. Version counters are local. New writes do not recover writes acknowledged only in the failed region. There is no automatic conflict merge.',
 controls:[button('write','Write primary region'),button('replicate','Catch up standby'),button('fail','Fail and fence primary'),button('promote','Promote standby')],
 initial:()=>({primary:0,standby:0,missing:0,down:false,promoted:false,event:0,message:'Write, replicate some versions, then fail the primary before its last write arrives.'}),
 update(s,a){
  s={...s,event:s.event+1};
  if(a==='write'){
   if(s.down&&!s.promoted)s.message='No writable primary.';
   else if(s.promoted){s.standby++;s.message=`Standby accepted local v${s.standby}. Missing old-region versions: ${missing(s)}.`;}
   else{s.primary++;s.message=`Primary acknowledged v${s.primary}.`;}
  }
  if(a==='replicate'&&!s.down)s.standby=s.primary;
  if(a==='fail'){
   s.missing=missing(s);s.down=true;
   s.message=`Primary is down and fenced; ${missing(s)} acknowledged versions did not replicate.`;
  }
  if(a==='promote'){
   if(!s.down)s.message='Fence the old region before promotion.';
   else{s.promoted=true;s.message=`Standby promoted at local v${s.standby}. Missing old-region versions: ${missing(s)}.`;}
  }
  return s;
 },
 view(s){return {svg:box(12,12,336,65,'Primary region',`v${s.primary} · ${s.down?'× fenced':'writable'}`,'is-'+(s.down?'bad':'good'))+box(12,170,336,65,'Standby region',`v${s.standby} · ${s.promoted?'writable':'read only'}`)+stored('primary',s.primary,300,55)+stored('standby',s.standby,300,210,300,s.promoted?210:55),caption:s.message,stats:{'primary version':s.primary,'standby version':s.standby,'unreplicated versions':missing(s)}};}
};
export const mountFigure=(h,c,s)=>mount(h,c,s,model);
