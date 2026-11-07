// Obstacle-aware orthogonal routes, sampled into the same lookup used by request particles.
import { LUT_SEGS } from './geom.js';
export const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
export function crossesRect(ax, ay, bx, by, r) {
  let lo = 0, hi = 1;
  const dx = bx - ax, dy = by - ay;
  for (const [p, q] of [[-dx, ax-r.x], [dx, r.x+r.width-ax], [-dy, ay-r.y], [dy, r.y+r.height-ay]]) {
    if (!p) { if (q <= 0) return false; }
    else { const t=q/p; if (p<0) lo=Math.max(lo,t); else hi=Math.min(hi,t); }
  }
  return lo < hi && hi > 0 && lo < 1;
}
export function routePoints(a, b, obstacles) {
  const clear = (p,q) => !obstacles.some(r=>crossesRect(p[0],p[1],q[0],q[1],r));
  for (const points of [[a,[b[0],a[1]],b],[a,[a[0],b[1]],b]]) {
    if (points.slice(1).every((p,i)=>clear(points[i],p))) return points;
  }
  const unique = values => [...new Set(values.map(v=>Math.round(v*10)/10))].sort((a,b)=>a-b);
  const xs=unique([a[0],b[0],...obstacles.flatMap(r=>[r.x-8,r.x+r.width+8])]);
  const ys=unique([a[1],b[1],...obstacles.flatMap(r=>[r.y-8,r.y+r.height+8])]);
  const W=xs.length, start=ys.indexOf(Math.round(a[1]*10)/10)*W+xs.indexOf(Math.round(a[0]*10)/10), end=ys.indexOf(Math.round(b[1]*10)/10)*W+xs.indexOf(Math.round(b[0]*10)/10);
  const scores=new Float64Array(W*ys.length).fill(Infinity), prev=new Int32Array(scores.length).fill(-1), closed=new Uint8Array(scores.length), open=[start];scores[start]=0;
  const pt=i=>[xs[i%W],ys[Math.floor(i/W)]];
  while(open.length) {
    let best=0, priority=Infinity;
    for(let i=0;i<open.length;i++){const p=pt(open[i]),f=scores[open[i]]+Math.abs(p[0]-b[0])+Math.abs(p[1]-b[1]);if(f<priority){priority=f;best=i;}}
    const u=open.splice(best,1)[0]; if(u===end){const path=[];for(let i=end;i>=0;i=prev[i])path.push(pt(i));return path.reverse();}
    if(closed[u])continue;closed[u]=1;
    const x=u%W,y=Math.floor(u/W),p=pt(u);
    for(const v of [x?u-1:-1,x<W-1?u+1:-1,y?u-W:-1,y<ys.length-1?u+W:-1]) {
      if(v<0||closed[v])continue;const q=pt(v);if(!clear(p,q))continue;
      const turn=prev[u]>=0 && ((prev[u]%W===x)!==(v%W===x))?18:0;
      const cost=scores[u]+Math.abs(p[0]-q[0])+Math.abs(p[1]-q[1])+turn;
      if(cost<scores[v]){scores[v]=cost;prev[v]=u;open.push(v);}
    }
  }
  return [a,b];
}
export function routedLut(lut, points) {
  // Keep every corner exactly, so a particle never cuts across an obstacle.
  const simple=points.filter((p,i)=>!i||i===points.length-1||(p[0]-points[i-1][0])*(points[i+1][1]-p[1])!==(p[1]-points[i-1][1])*(points[i+1][0]-p[0]));
  const count=Math.max(LUT_SEGS,simple.length-1);
  if(lut.xs.length<count+1){lut.xs=new Float32Array(count+1);lut.ys=new Float32Array(count+1);lut.cum=new Float32Array(count+1);}
  let idx=0,len=0;
  simple.forEach((p,i)=>{
    if(!i){lut.xs[0]=p[0];lut.ys[0]=p[1];lut.cum[0]=0;return;}
    const a=simple[i-1],n=i===simple.length-1?count-idx:Math.max(1,Math.floor(count/(simple.length-1)));
    for(let k=1;k<=n;k++){const x=a[0]+(p[0]-a[0])*k/n,y=a[1]+(p[1]-a[1])*k/n;len+=Math.hypot(x-lut.xs[idx],y-lut.ys[idx]);idx++;lut.xs[idx]=x;lut.ys[idx]=y;lut.cum[idx]=len;}
  });
  lut.segs=count;lut.len=len;lut.points=simple;lut.p0x=simple[0][0];lut.p0y=simple[0][1];lut.p3x=simple.at(-1)[0];lut.p3y=simple.at(-1)[1];lut.ver++;return lut;
}
export function inkPath(g,lut){g.moveTo(lut.xs[0],lut.ys[0]);for(let i=1;i<=(lut.segs||LUT_SEGS);i++)g.lineTo(lut.xs[i],lut.ys[i]);return g;}
