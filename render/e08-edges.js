// e08 p05 wire weights, colours and moving dashes, on the game's existing routed paths.
import { lutAt } from './geom.js';
import { inkPath } from './routing.js';

export function drawE08Edge(v, env, highlighted) {
  const g = v.g, lut = v.lut, P = env.kit().P;
  g.clear();
  if (!v.ok) return;
  const flowing = v.rps > .01;
  const color = highlighted ? P.text : flowing ? P.edgeFlow : P.edgeIdle;
  const width = highlighted ? 5 : v.kind === 'tap' ? 1.5 : flowing && v.carries ? 7 : 3;
  if (v.band > 0) inkPath(g,lut).stroke({color:v.bandColor,width:16,alpha:.35,cap:'round'});
  inkPath(g,lut).stroke({color,width,cap:'round',join:'round'});
  const a={},b={};
  if (!highlighted && (flowing || !v.carries) && !env.reduced()) {
    const offset = (env.visualTime()/800*18)%18;
    for(let s=-18+offset;s<lut.len;s+=18) {
      lutAt(lut,Math.max(0,s),a);lutAt(lut,Math.min(lut.len,s+10),b);
      g.moveTo(a.x,a.y).lineTo(b.x,b.y);
    }
    g.stroke({color:P.canvas,width:3,cap:'butt'});
  }
  if(v.kind === 'replication') {
    for(let s=20;s<lut.len-12;s+=40){lutAt(lut,s,a);g.poly([a.x,a.y-5,a.x+5,a.y,a.x,a.y+5,a.x-5,a.y]).fill({color:P.edgeFlow});}
  } else if ((!flowing || highlighted) && lut.len > 12) {
    lutAt(lut,lut.len,a);
    const nx=-a.ty,ny=a.tx;
    g.poly([a.x,a.y,a.x-a.tx*9+nx*4.5,a.y-a.ty*9+ny*4.5,a.x-a.tx*9-nx*4.5,a.y-a.ty*9-ny*4.5]).fill({color});
  }
  v.drawnTime=env.visualTime();
  v.drawnHi=highlighted;v.drawnRps=v.rps;v.drawnBand=v.band;
}
