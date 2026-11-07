// Small, deterministic lesson instruments with shared controls and interruptible motion.
import { styles } from './styles.js';
export const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const sum = xs => xs.reduce((a,b) => a+b, 0);
export const hash = key => { let h = 2166136261; for (const c of String(key)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return h >>> 0; };
export const text = (x,y,label,cls='') => `<text x="${x}" y="${y}" class="${cls}">${esc(label)}</text>`;
export const line = (x,y,x2,y2,cls='') => `<path d="M${x} ${y}L${x2} ${y2}" class="fg-wire ${cls}"/>`;
const shorten=(value,n)=>String(value).length>n?String(value).slice(0,n-1)+'…':String(value);
export const box = (x,y,w,h,label,sub='',cls='') => `<g class="fg-box ${cls}" aria-label="${esc(label+' '+sub)}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5"/>${text(x+10,y+24,shorten(label,Math.floor((w-20)/9.5)))}${sub ? text(x+10,y+46,shorten(sub,Math.floor((w-20)/8)),'fg-small') : ''}</g>`;
export const dot = (id,x,y,label='',cls='') => `<g data-key="${esc(id)}" data-x="${x}" data-y="${y}" class="fg-mark ${cls}"><circle cx="${x}" cy="${y}" r="5"/></g>${label ? text(x+9,y+5,label,'fg-small') : ''}`;
export const packet = (id,x,y,fromX,fromY,label='',cls='') => dot(id,x,y,label,cls).replace('data-key=',`data-packet="true" data-from-x="${fromX}" data-from-y="${fromY}" data-key=`);
// A stored copy keeps its own identity. Updating another copy never moves this one.
export const stored = (id,version,x,y,fromX=x,fromY=y) => packet(id+':'+version,x,y,fromX,fromY);
export const bars = (items,max=Math.max(1,...items.map(x=>x[1]))) => items.map(([label,value,cls=''],i) => {const y=28+i*37,x=130+Math.max(0,value)/max*155;return text(12,y,label,'fg-small')+`<rect class="fg-bar ${cls}" x="130" y="${y-15}" width="${Math.max(0,value)/max*155}" height="20" rx="2"/>`+dot('bar:'+label,x,y-5,'',cls)+text(295,y,value,'fg-small');}).join('');
export const lanes = items => items.map(([label,value,cls=''],i) => box(12,12+i*70,336,60,label,value,cls)).join('');
export const range = (id,label,min,max,value,step=1) => ({id,label,type:'range',min,max,value,step});
export const select = (id,label,options) => ({id,label,type:'select',options});
export const button = (id,label) => ({id,label,type:'button'});
export const toggle = (id,label) => ({id,label,type:'checkbox'});

export function mount(host, ctx, step, model) {
  if (!document.querySelector('style[data-figures]')) {
    const css = document.createElement('style'); css.textContent=styles; css.dataset.figures=''; document.head.append(css);
  }
  let state=model.initial(step.view), destroyed=false, animations=[], visible=true, paused=false, revision=0;
  const root=document.createElement('figure'); root.className='fg-bench'; root.dataset.figure=step.figure; root.dataset.view=step.view||'main';
  const controls=document.createElement('div'); controls.className='fg-controls'; controls.setAttribute('role','group'); controls.setAttribute('aria-label','Figure controls');
  const drawing=document.createElementNS('http://www.w3.org/2000/svg','svg'); drawing.setAttribute('viewBox','0 0 360 250'); drawing.setAttribute('role','img'); drawing.classList.add('fg-drawing');
  const stats=document.createElement('div'); stats.className='fg-stats';
  const caption=document.createElement('figcaption'); caption.className='fg-caption'; caption.setAttribute('role','status'); caption.setAttribute('aria-live','polite');
  const note=document.createElement('p'); note.className='fg-note'; note.textContent=model.note;
  const motion=document.createElement('button'); motion.type='button'; motion.className='sh-btn sh-btn--ghost fg-motion'; motion.textContent='Pause motion'; motion.setAttribute('aria-pressed','false');
  const reduced=()=>!!ctx.reducedMotion?.() || document.documentElement.dataset.motion==='reduce';
  function syncMotion() {
    root.dataset.motion=reduced()?'reduce':'full';
    for(const animation of animations) { if(reduced()) animation.finish(); else if(!visible || paused || document.hidden) {if(animation.playState==='running')animation.pause();} else if(animation.playState==='paused') animation.play(); }
    motion.textContent=reduced()?'Still states':paused?'Resume motion':'Pause motion'; motion.disabled=reduced(); motion.setAttribute('aria-pressed',String(paused));
  }
  function draw(animate=false) {
    const before=new Map([...drawing.querySelectorAll('[data-key]')].map(el=>[el.dataset.key,[+el.dataset.x,+el.dataset.y]]));
    for(const a of animations) a.cancel(); animations=[];
    const v=model.view(state); drawing.innerHTML=v.svg; drawing.setAttribute('aria-label',v.caption); caption.textContent=v.caption;
    stats.replaceChildren(...Object.entries(v.stats||{}).map(([label,value])=>{const el=document.createElement('span'); const strong=document.createElement('strong'); strong.textContent=value; el.append(strong,document.createTextNode(' '+label));return el;}));
    root.dataset.revision=String(++revision);
    for(const c of model.controls) {const input=controls.querySelector(`[data-control="${c.id}"]`);input.parentElement.hidden=!!c.when&&!c.when(state);if(c.type==='checkbox') input.checked=!!state[c.id];else if(c.type!=='button'){input.value=state[c.id]??c.value??'';const out=input.parentElement.querySelector('output');if(out) out.textContent=input.value;}}
    if(animate && !reduced()) for(const el of drawing.querySelectorAll('[data-key]')) {
      const p=before.get(el.dataset.key), x=+el.dataset.x,y=+el.dataset.y;
      const moved=p&&(p[0]!==x||p[1]!==y);
      // A retained packet is already delivered. Only a new event may send it again.
      if(el.dataset.packet&&p&&!moved) continue;
      const dx=moved?p[0]-x:Number(el.dataset.fromX??x)-x,dy=moved?p[1]-y:Number(el.dataset.fromY??y)-y;
      const via=Number(el.dataset.viaX);
      const frames=el.dataset.viaX&&!moved?
        [{transform:`translate(${dx}px, ${dy}px)`},{transform:`translate(${via-x}px, ${dy}px)`,offset:.2},{transform:`translate(${via-x}px, 0px)`,offset:.8},{transform:'translate(0px, 0px)'}]:
        [{transform:`translate(${dx}px, ${dy}px)`},{transform:'translate(0px, 0px)'}];
      if(dx||dy) animations.push(el.animate(frames,{duration:1000,easing:'cubic-bezier(.25,.6,.35,1)',fill:'both'}));
    }
    syncMotion();
  }
  function act(id,value) {if(destroyed)return;state=model.update(state,id,value);draw(true);}
  for(const c of model.controls) {
    const label=document.createElement(c.type==='button'?'span':'label');label.className='fg-control';
    const input=document.createElement(c.type==='button'?'button':c.type==='select'?'select':'input');input.dataset.control=c.id;
    if(c.type==='button'){input.type='button';input.textContent=c.label;input.className='sh-btn';input.addEventListener('click',()=>act(c.id));}
    else {const name=document.createElement('span');name.textContent=c.label;label.append(name);
      if(c.type==='select') for(const option of c.options){const el=document.createElement('option');const [value,title]=Array.isArray(option)?option:[option,option];el.value=value;el.textContent=title;input.append(el);}
      else {input.type=c.type;for(const key of ['min','max','step'])if(c[key]!==undefined)input[key]=c[key];}
      input.setAttribute('aria-label',c.label);input.addEventListener(c.type==='range'?'input':'change',()=>act(c.id,c.type==='checkbox'?input.checked:c.type==='range'?+input.value:input.value));
    }
    label.append(input);if(c.type==='range'){const output=document.createElement('output');label.append(output);}controls.append(label);
  }
  const reset=document.createElement('button');reset.type='button';reset.className='sh-btn sh-btn--ghost';reset.textContent='Reset figure';reset.dataset.control='reset';reset.addEventListener('click',()=>{state=model.initial(step.view);draw(true);});controls.append(reset);
  motion.addEventListener('click',()=>{paused=!paused;syncMotion();});
  root.append(drawing,stats,caption,controls,motion,note);host.append(root);draw();
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;syncMotion();});observer.observe(root);
  const settingsOff=ctx.bus?.on('settings',syncMotion);
  const mutation=new MutationObserver(syncMotion);mutation.observe(document.documentElement,{attributes:true,attributeFilter:['data-motion']});
  document.addEventListener('visibilitychange',syncMotion);
  return {destroy(){destroyed=true;for(const a of animations)a.cancel();observer.disconnect();mutation.disconnect();settingsOff?.();document.removeEventListener('visibilitychange',syncMotion);root.remove();}};
}
