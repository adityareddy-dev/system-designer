// A finite interview clock makes unfinished decisions explicit without grading conversation style.
import {mount,button,range,bars,packet,text} from './bench.js';
const phases=['scope','numbers','design','depth'];
export const model={note:'Model: a rehearsal clock, not a hiring score. The illustrative plan reserves 10 minutes for scope, 10 for numbers, 20 for design and 20 for depth. Change the plan to fit the prompt; time spent does not prove the quality of an answer.',
 controls:[range('spend','Minutes per turn',1,20,5),...phases.map(p=>button(p,'Spend on '+p))],
 initial:()=>({spend:5,scope:0,numbers:0,design:0,depth:0,message:'You have 60 minutes. Spend deliberately and leave time to test one failure.',event:0}),
 update(s,a,v){s={...s,event:s.event+1};if(a==='spend')s.spend=v;else{const used=phases.reduce((n,p)=>n+s[p],0),spent=Math.min(s.spend,60-used);s[a]+=spent;const remaining=60-used-spent;const missing=phases.filter(p=>s[p]===0);s.message=`Spent ${spent} minutes on ${a}; ${remaining} remain. ${missing.length?'Untouched: '+missing.join(', ')+'.':'All four areas have time.'}${remaining===0&&missing.length?' The clock ended before those decisions were discussed.':''}`;}return s;},
 view(s){const used=phases.reduce((n,p)=>n+s[p],0);return {svg:bars(phases.map(p=>[p,s[p]]),60)+text(12,198,`${60-used} minutes left`)+packet('minute',20+used/60*320,225,20,225),caption:s.message,stats:{'minutes used':used,'minutes left':60-used,'areas untouched':phases.filter(p=>!s[p]).length}};}
};
export const mountFigure=(h,c,s)=>mount(h,c,s,model);
