// The home bench's paper, ink and sketch-pen language, shared by live and reference drawings.
import { hexStr, CATEGORY_IDS } from './theme.js';
import { parts } from '../assets/e08/manifest.js';
import { lutAt } from './geom.js';
import { routedLut } from './routing.js';

export const PAPER = Object.freeze({
  card: 0xfffcf4, paper: 0xfff4e0, ink: 0x141414, blue: 0x2d5bff, yellow: 0xffc93c,
  mint: 0x7fd9a8, tomato: 0xff5b3a, bad: 0xb3261e, down: 0xe2e5e9,
  body: { textureSize: 250, x: -115, y: -59, width: 230, height: 118, radius: 8, stroke: 2.5, shadowX: 6, shadowY: 4 },
  bar: { x: -100, y: 1, width: 200, height: 16, stroke: 2 },
  wire: { width: 2.5, dash: 6, gap: 10, travel: 32, period: 1200, radius: 16, port: 117, arrowLength: 9, arrowHalf: 4.5 },
  type: { label: 'Space Grotesk, Arial, sans-serif', mono: 'Space Mono, monospace', weight: '700', captionSize: 14 },
  title: { x: -72, y: -38, size: 16, width: 174 },
  status: { x: -100, y: 37, size: 11 },
  fit: { top: 125, bottom: 90 },
  spread: { x: 3.5, y: 2.25 },
  preview: { padX: 135, padY: 80, widthPad: 280, heightPad: 180, scale: .8 },
  icon: { x: -96, y: -38, size: 22 },
});
// Projection belongs to rendering: saved designs, placement and simulation retain their coordinates.
export function paperPoint(x, y, inverse = false) {
  return inverse ? { x: x / PAPER.spread.x, y: y / PAPER.spread.y }
    : { x: x * PAPER.spread.x, y: y * PAPER.spread.y };
}
export function paperGraph(graph) {
  return graph && { ...graph, nodes: graph.nodes.map(n => ({ ...n, ...paperPoint(n.x, n.y) })) };
}
export const cardLook = look => look === 'e08' || look === 'paper';
export function paperPalette(base) {
  return { ...base, look: 'paper', ...Object.fromEntries(['card','paper','ink','blue','yellow','mint','tomato','bad'].map(k => [k,PAPER[k]])),
    canvas: PAPER.card, bg: PAPER.paper, surfaceSolid: PAPER.card, text: PAPER.ink,
    edgeIdle: PAPER.ink, edgeFlow: PAPER.ink };
}
export const paperBarColor = load => load > 1 ? PAPER.tomato : load >= .9 ? PAPER.yellow : PAPER.blue;
export function paperStatus(live, down, load) {
  return down ? 'down' : !live ? 'ready' : load > 1 ? 'overloaded' : 'healthy';
}
// Full category header, cream body and hard shadow use the approved mock's proportions.
export function paperBodySvg(P, category, down = false) {
  const b=PAPER.body, ink=hexStr(P.ink), fill=hexStr(down ? PAPER.down : P.card), band=hexStr(down ? P.text3 : category==='balancer'?P.yellow:P.cat[category]);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-125 -125 250 250"><defs><clipPath id="card"><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${b.radius}"/></clipPath></defs><rect x="${b.x+b.shadowX}" y="${b.y+b.shadowY}" width="${b.width}" height="${b.height}" rx="${b.radius}" fill="${ink}"/><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${b.radius}" fill="${fill}"/><path d="M-115 -59H115V-17H-115Z" fill="${band}" clip-path="url(#card)"/><path d="M-115 -17H115" stroke="${ink}" stroke-width="${b.stroke}"/><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${b.radius}" fill="none" stroke="${ink}" stroke-width="${b.stroke}"/></svg>`;
}
async function raster(PIXI, svg, size) {
  const img=new Image();
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Invalid paper SVG'));img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);});
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;canvas.getContext('2d').drawImage(img,0,0,size,size);
  return new PIXI.Texture({source:new PIXI.CanvasSource({resource:canvas,autoGenerateMipmaps:true})});
}
const glyphSources=new Map();
export async function paperGlyph(type) {
  if(!glyphSources.has(type)) glyphSources.set(type,fetch(new URL(`assets/e08/glyphs/${type}.svg`,document.baseURI)).then(r=>{
    if(!r.ok)throw new Error('Could not load paper glyph: '+type);return r.text();
  }).catch(e=>{glyphSources.delete(type);throw e;}));
  return glyphSources.get(type);
}
export async function addPaperTextures(PIXI,kit) {
  const owned=[];
  const bake=async(svg,size)=>{const t=await raster(PIXI,svg,size);owned.push(t);return t;};
  try {
    const states=Object.fromEntries(await Promise.all([...CATEGORY_IDS,'balancer'].map(async cat=>[cat,await Promise.all([false,true].map(d=>bake(paperBodySvg(kit.P,cat,d),Math.round(200*kit.res))))])));
    const glyphs=new Map(await Promise.all(parts.map(async p=>[p.id,await bake((await paperGlyph(p.id)).replace('#f3eee0','#ffffff'),Math.round(96*kit.res))])));
    const icons=kit.icons,destroy=kit.destroy;
    kit.look='paper';kit.bodyFor=(cat,status=0,type='')=>states[type.endsWith('-lb')?'balancer':cat]?.[status===4?1:0]||states.compute[0];
    kit.bodyTex=Object.fromEntries(CATEGORY_IDS.map(cat=>[cat,states[cat][0]]));
    kit.icons={...icons,get:(id,color)=>id.startsWith('el.')?glyphs.get(id.slice(3)):icons.get(id,color)};
    kit.destroy=()=>{owned.forEach(t=>t.destroy(true));destroy();};
    return kit;
  } catch(e) {owned.forEach(t=>t.destroy(true));kit.destroy();throw e;}
}
export function drawPaperLoad(v,kit) {
  const P=kit.P,b=PAPER.bar,g=v.busy,load=v.live&&!v.down?Math.max(0,Math.min(1,v.du)):0;
  const compact=v.paperCompact, headerInk=v.type.endsWith('-lb') ? P.ink : P.card;
  v.body.width=v.body.height=PAPER.body.textureSize;v.body.texture=kit.bodyFor(v.cat,v.status,v.type);
  g.clear().roundRect(b.x,b.y,b.width,b.height,3).fill({color:P.paper});
  if(load>0)g.roundRect(b.x,b.y,b.width*load,b.height,3).fill({color:paperBarColor(v.du)});
  g.roundRect(b.x,b.y,b.width,b.height,3).stroke({color:P.ink,width:b.stroke});
  if(v.down)g.moveTo(86,27).lineTo(99,43).moveTo(99,27).lineTo(86,43).stroke({color:P.bad,width:3});
  v.drawnU=v.du;v.drawnColor=paperBarColor(v.du);
  // Paper replaces the old decoration layers, including the duplicated outside label.
  for(const key of ['labelT','labelBg','leader','statusG','retryG','pile','pulse','lead','rejected','chip','badge','pool','poolT'])v[key].visible=false;
  v.paperTitle.visible=true;v.paperStatus.visible=v.paperReading.visible=!compact;
  v.paperTitle.anchor.set(0,.5);v.paperTitle.position.set(PAPER.title.x,PAPER.title.y);
  v.paperTitle.scale.set(1);v.paperTitle.style.wordWrap=!compact;
  v.paperTitle.text=compact?v.paperShortName:v.label;v.paperTitle.style.fill=headerInk;
  v.paperTitle.style.fontSize=compact?30:PAPER.title.size;v.paperTitle.style.lineHeight=compact?32:18;
  v.paperTitle.style.wordWrapWidth=PAPER.title.width;
  if(v.paperTitle.height>38)v.paperTitle.text=v.paperShortName;
  if(v.paperTitle.width>PAPER.title.width)v.paperTitle.scale.set(PAPER.title.width/v.paperTitle.width);else v.paperTitle.scale.set(1);
  v.paperStatus.anchor.set(0,.5);v.paperStatus.position.set(PAPER.status.x,PAPER.status.y);
  v.paperStatus.text=v.cat==='clients'&&v.live?'sending':v.type.endsWith('-lb')&&v.live&&!v.down&&v.du<=1?'routing':paperStatus(v.live,v.down,v.du);
  v.paperStatus.style.fill=v.down||v.du>1?P.bad:P.ink;
  v.paperReading.anchor.set(1,.5);v.paperReading.position.set(100,PAPER.status.y);
  v.paperReading.text=v.down?'':v.live&&v.failRps>.5?`${Math.round(v.failRps).toLocaleString('en-US')}/s rejected`:v.cat==='clients'&&v.live?`${countRate(v.outRps||0)}/s`:v.units>1?`×${v.units}`:v.live?`${Math.max(0,Math.round((1-v.du)*100))}% headroom`:'';
  v.paperReading.scale.set(1);const room=192-v.paperStatus.width-8;v.paperReading.scale.set(Math.min(1,Math.max(0,room)/Math.max(1,v.paperReading.width)));
  v.paperReading.style.fill=P.ink;
  v.icon.position.set(PAPER.icon.x,PAPER.icon.y);v.icon.width=v.icon.height=PAPER.icon.size;v.icon.tint=headerInk;
  v.valid.position.set(124,37);v.lock.position.set(-132,37);v.regionC.position.set(0,-74);
  const o=v.paperOutline;o.clear();
  if(v.status>=3||v.paperSelected)o.roundRect(-115,-59,230,118,8).stroke({color:v.paperSelected?P.ink:P.tomato,width:3});
  v.paperWaiting.visible=!compact&&v.live&&v.queue>1;
  if(v.paperWaiting.visible){v.paperWaiting.text=`${Math.round(v.queue).toLocaleString('en-US')} waiting`;v.paperWaiting.position.set(-100,75);const w=v.paperWaiting.width+12;o.roundRect(-106,64,w,22,4).fill({color:P.card}).stroke({color:P.ink,width:2});}
}
function countRate(n){return n>=1000?`${(n/1000).toFixed(1)}K`:String(Math.round(n));}

// Only the first-limit reading needs an outside caption. Reserve its full ink box for wires.
export function layoutPaperLabels(list,camera,area,P) {
  const z=camera.zoom,free={x:area?.l||8,y:area?.t||8,right:camera.size.w-(area?.r||8),bottom:camera.size.h-(area?.b||8)};
  const bodies=list.map(v=>{const p=camera.worldToScreen(v.x,v.y);return{x:p.x-119*z,y:p.y-63*z,width:240*z,height:(v.queue>1&&!v.paperCompact?151:126)*z};});
  const occupied=[...bodies,...(area?.blocks||[])];let changed=false;
  for(const v of list){
    const previous=JSON.stringify(v.captionBoxes),p=camera.worldToScreen(v.x,v.y);
    v.renderHalf=PAPER.body.width/2;v.renderWidth=PAPER.body.width;v.renderHeight=PAPER.body.height;v.portHalf=PAPER.wire.port;
    v.labelT.visible=false;v.nameCaption=null;v.captionBoxes=[];v.factCaption=null;v.evidenceBg.clear();v.leader.clear();
    const t=v.evidenceT;t.visible=v.live&&(v.isLead||t.text.startsWith('First limit'));t.renderable=false;
    if(t.visible){
      const text=t.text.replace(/^First limit(?:[.\n]\s*)?/,'').replace(/[×↶]/g,'').trim().split('\n').map(s=>s.trim());
      t.text='First limit. '+text.join(', ');t.style.fontSize=12;t.style.fill=P.ink;t.style.wordWrap=true;t.style.wordWrapWidth=Math.min(350,free.right-free.x-24);t.style.align='left';t.style.lineHeight=16;t.scale.set(1/z);t.anchor.set(0,0);
      const width=t.width*z+20,height=t.height*z+14;
      const base={x:Math.max(free.x,Math.min(free.right-width,p.x-115*z)),y:p.y-59*z-height-14,width,height};
      const xs=[base.x,free.x,free.right-width,...occupied.flatMap(b=>[b.x-width-8,b.x+b.width+8])];
      const ys=[base.y,...occupied.flatMap(b=>[b.y-height-12,b.y+b.height+12]),free.y];
      let box=null,best=Infinity;
      for(const y of ys)for(const x of xs){const r={x,y,width,height},d=Math.abs(y-base.y)+Math.abs(x-base.x);if(x>=free.x&&y>=free.y&&x+width<=free.right&&y+height<=free.bottom&&!occupied.some(b=>x<b.x+b.width&&x+width>b.x&&y<b.y+b.height&&y+height>b.y)&&d<best){box=r;best=d;}}
      if(box){
        t.renderable=true;t.position.set((box.x-p.x+10)/z,(box.y-p.y+7)/z);
        const x=(box.x-p.x)/z,y=(box.y-p.y)/z,w=width/z,h=height/z;
        v.evidenceBg.roundRect(x+3/z,y+2/z,w,h,6/z).fill({color:P.ink}).roundRect(x,y,w,h,6/z).fill({color:P.tomato}).stroke({color:P.ink,width:2/z});v.evidenceBg.visible=true;
        v.factCaption={x,y,width:w,height:h};v.captionBoxes=[{id:v.id,x:v.x+x-3/z,y:v.y+y-3/z,width:w+6/z,height:h+6/z}];occupied.push(box);
      }
    }
    if(previous!==JSON.stringify(v.captionBoxes))changed=true;
  }
  return changed;
}

// Round the existing obstacle route, using a sampled quadratic at each bend. All consumers
// (dashes, particles, hit testing) get the same arc-length lookup instead of sharp corners.
export function paperRoute(lut,points,obstacles=[],from=null,to=null) {
  // Prefer the bench's flowing S curve when it has a clear corridor.
  const a=points[0],b=points.at(-1),sign=b[0]>=a[0]?1:-1,h=Math.max(36,Math.abs(b[0]-a[0])*.5);
  const curve=[];
  for(let i=0;i<=64;i++){const t=i/64,u=1-t;curve.push([u*u*u*a[0]+3*u*u*t*(a[0]+sign*h)+3*u*t*t*(b[0]-sign*h)+t*t*t*b[0],u*u*u*a[1]+3*u*u*t*a[1]+3*u*t*t*b[1]+t*t*t*b[1]]);}
  const blocked=curve.some(([x,y])=>obstacles.some(r=>!(r.body&&(r.id===from||r.id===to))&&x>r.x-3&&x<r.x+r.width+3&&y>r.y-3&&y<r.y+r.height+3));
  if(obstacles.length&&!blocked)return routedLut(lut,curve);

  const simple=points.filter((p,i)=>!i||i===points.length-1||(p[0]-points[i-1][0])*(points[i+1][1]-p[1])!==(p[1]-points[i-1][1])*(points[i+1][0]-p[0]));
  const out=[simple[0]];
  for(let i=1;i<simple.length-1;i++){
    const a=simple[i-1],b=simple[i],c=simple[i+1],ab=Math.hypot(b[0]-a[0],b[1]-a[1]),bc=Math.hypot(c[0]-b[0],c[1]-b[1]);
    const r=Math.min(PAPER.wire.radius,ab/2,bc/2);if(!r)continue;
    const start=[b[0]+(a[0]-b[0])*r/ab,b[1]+(a[1]-b[1])*r/ab],end=[b[0]+(c[0]-b[0])*r/bc,b[1]+(c[1]-b[1])*r/bc];
    out.push(start);
    for(let k=1;k<=12;k++){const t=k/12,u=1-t;out.push([u*u*start[0]+2*u*t*b[0]+t*t*end[0],u*u*start[1]+2*u*t*b[1]+t*t*end[1]]);}
  }
  out.push(simple.at(-1));return routedLut(lut,out);
}
export function drawPaperEdge(v,env,highlighted) {
  const g=v.g,lut=v.lut,P=env.kit().P,w=PAPER.wire;g.clear();if(!v.ok)return;
  const moving=v.rps>.01&&v.carries&&!env.reduced();
  const pace=1+Math.min(1,Math.log10(1+v.rps)/4);
  const offset=moving?(env.visualTime()/w.period*w.travel*pace)%(w.dash+w.gap):0;
  const a={};
  for(let s=-w.dash-w.gap+offset;s<lut.len;s+=w.dash+w.gap){
    const start=Math.max(0,s),end=Math.min(lut.len,s+w.dash);if(end<=start)continue;
    lutAt(lut,start,a);g.moveTo(a.x,a.y);
    for(let d=start+1;d<end;d+=1){lutAt(lut,d,a);g.lineTo(a.x,a.y);}
    lutAt(lut,end,a);g.lineTo(a.x,a.y);
  }
  g.stroke({color:P.ink,width:w.width,cap:'butt',join:'round'});
  lutAt(lut,lut.len,a);const nx=-a.ty,ny=a.tx;
  g.poly([a.x,a.y,a.x-a.tx*w.arrowLength+nx*w.arrowHalf,a.y-a.ty*w.arrowLength+ny*w.arrowHalf,a.x-a.tx*w.arrowLength-nx*w.arrowHalf,a.y-a.ty*w.arrowLength-ny*w.arrowHalf]).fill({color:P.ink});
  // Focus adds small endpoint rings without changing the wire's weight.
  if(highlighted&&g.circle)g.circle(lut.p0x,lut.p0y,4).stroke({color:P.ink,width:w.width});
  v.drawnTime=env.visualTime();v.drawnHi=highlighted;v.drawnRps=v.rps;v.drawnBand=v.band;
}
