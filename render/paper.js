// The home bench's paper, ink and sketch-pen language, shared by live and reference drawings.
import { hexStr, CATEGORY_IDS } from './theme.js';
import { parts } from '../assets/e08/manifest.js';
import { lutAt } from './geom.js';
import { routedLut } from './routing.js';

export const PAPER = Object.freeze({
  card: 0xfffcf4, paper: 0xfff4e0, ink: 0x141414, blue: 0x2d5bff, yellow: 0xffc93c,
  mint: 0x7fd9a8, tomato: 0xff5b3a, bad: 0xb3261e, down: 0xe2e5e9,
  body: { x: -44, y: -38, width: 88, height: 76, radius: 8, stroke: 2.5, shadowX: 6, shadowY: 4 },
  bar: { x: -34, y: 21, width: 68, height: 9, stroke: 2 },
  wire: { width: 2.5, dash: 6, gap: 10, travel: 32, period: 1200, radius: 16, port: 46, arrowLength: 9, arrowHalf: 4.5 },
  type: { label: 'Space Grotesk, Arial, sans-serif', mono: 'Space Mono, monospace', weight: '700', captionSize: 14 },
  title: { x: 0, y: -33, size: 8.5, width: 76 },
  status: { x: 12, y: 2, size: 6.8 },
  icon: { x: -23, y: 0, size: 24 },
});
export const cardLook = look => look === 'e08' || look === 'paper';
export function paperPalette(base) {
  return { ...base, look: 'paper', ...Object.fromEntries(['card','paper','ink','blue','yellow','mint','tomato','bad'].map(k => [k,PAPER[k]])),
    canvas: PAPER.card, bg: PAPER.paper, surfaceSolid: PAPER.card, text: PAPER.ink,
    edgeIdle: PAPER.ink, edgeFlow: PAPER.ink };
}
export const paperBarColor = load => load > 1 ? PAPER.tomato : load >= .9 ? PAPER.yellow : PAPER.blue;
export function paperStatus(live, down, load) {
  return down ? 'down' : !live ? 'ready' : load > 1 ? 'overloaded' : `${Math.max(0,Math.round((1-load)*100))}% spare`;
}
// Narrow category band uses the site's category colours. The cream body and load bar stay distinct.
export function paperBodySvg(P, category, down = false) {
  const b=PAPER.body, ink=hexStr(P.ink), fill=hexStr(down ? PAPER.down : P.card);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-50 -50 100 100"><rect x="${b.x+b.shadowX}" y="${b.y+b.shadowY}" width="${b.width}" height="${b.height}" rx="${b.radius}" fill="${ink}"/><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${b.radius}" fill="${fill}" stroke="${ink}" stroke-width="${b.stroke}"/><path d="M-34 -15H34" stroke="${hexStr(down ? P.text3 : P.cat[category])}" stroke-width="5"/></svg>`;
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
    const states=Object.fromEntries(await Promise.all(CATEGORY_IDS.map(async cat=>[cat,await Promise.all([false,true].map(d=>bake(paperBodySvg(kit.P,cat,d),Math.round(200*kit.res))))])));
    const glyphs=new Map(await Promise.all(parts.map(async p=>[p.id,await bake((await paperGlyph(p.id)).replace('#f3eee0','#ffffff'),Math.round(96*kit.res))])));
    const icons=kit.icons,destroy=kit.destroy;
    kit.look='paper';kit.bodyFor=(cat,status=0)=>states[cat]?.[status===4?1:0]||states.compute[0];
    kit.bodyTex=Object.fromEntries(CATEGORY_IDS.map(cat=>[cat,states[cat][0]]));
    kit.icons={...icons,get:(id,color)=>id.startsWith('el.')?glyphs.get(id.slice(3)):icons.get(id,color)};
    kit.destroy=()=>{owned.forEach(t=>t.destroy(true));destroy();};
    return kit;
  } catch(e) {owned.forEach(t=>t.destroy(true));kit.destroy();throw e;}
}
export function drawPaperLoad(v,kit) {
  const P=kit.P,b=PAPER.bar,g=v.busy,load=v.live&&!v.down?Math.max(0,Math.min(1,v.du)):0;
  g.clear().rect(b.x,b.y,b.width,b.height).fill({color:P.paper});
  if(load>0)g.rect(b.x,b.y,b.width*load,b.height).fill({color:paperBarColor(v.du)});
  g.rect(b.x,b.y,b.width,b.height).stroke({color:P.ink,width:b.stroke});
  if(v.down)g.moveTo(18,-6).lineTo(30,6).moveTo(30,-6).lineTo(18,6).stroke({color:P.bad,width:3});
  v.drawnU=v.du;v.drawnColor=paperBarColor(v.du);
  v.statusG.clear();
  v.paperTitle.visible=v.paperStatus.visible=true;
  v.paperTitle.text=v.label;v.paperTitle.style.fill=P.ink;
  v.paperStatus.text=paperStatus(v.live,v.down,v.du);v.paperStatus.style.fill=v.down?P.bad:P.text2;
  v.icon.position.set(PAPER.icon.x,PAPER.icon.y);v.icon.width=v.icon.height=PAPER.icon.size;
  v.rejected.visible=v.live&&v.status===3;
  if(v.rejected.visible){v.rejectedT.text=`${Math.round(v.failRps||0)}/s`;v.rejectedT.style.fill=P.ink;
    const w=Math.max(48,v.rejectedT.width+16);
    v.rejectedG.clear().roundRect(-w/2,-10,w,20,6).fill({color:P.card}).stroke({color:P.bad,width:2});}
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
