// Static reference canvas. It uses the same native assets as the playable scene.
let uid = 0;
const sources = new Map();
function siteImage(image) {
  const file = image.getAttribute('href');
  if (!sources.has(file)) sources.set(file, fetch(file).then(r => {
    if (!r.ok) throw new Error('Could not load e08 preview: ' + file);
    return r.text();
  }).catch(error => { sources.delete(file); throw error; }));
  const tokens = getComputedStyle(document.documentElement);
  const card = tokens.getPropertyValue('--card').trim() || '#fffcf4';
  const ink = tokens.getPropertyValue('--ink').trim() || '#141414';
  // External SVG images cannot inherit page tokens. Resolve them before display.
  image.removeAttribute('href');
  sources.get(file).then(source => {
    const svg = source.replaceAll('var(--card, #fffcf4)', card.toLowerCase()).replace('#f3eee0', ink.toLowerCase());
    image.setAttribute('href', 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  }).catch(error => console.error(error));
}
export function e08DesignDiagram(design, catalog) {
  const NS='http://www.w3.org/2000/svg';
  const el=(tag,attrs={})=>{const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;};
  const nodes=design.graph.nodes;
  const minX=Math.min(...nodes.map(n=>n.x)),maxX=Math.max(...nodes.map(n=>n.x));
  const minY=Math.min(...nodes.map(n=>n.y)),maxY=Math.max(...nodes.map(n=>n.y));
  const width=maxX-minX+180,height=maxY-minY+180;
  const svg=el('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':`Diagram of ${design.name}`,'data-look':'e08',style:`width:${width*.8}px;display:block;background:var(--canvas)`});
  const id='e08-grid-'+ ++uid;
  const defs=el('defs'),pattern=el('pattern',{id,width:20,height:20,patternUnits:'userSpaceOnUse'});
  pattern.append(el('circle',{cx:1,cy:1,r:1,fill:'var(--grid-dot)'}));defs.append(pattern);svg.append(defs,el('rect',{width:'100%',height:'100%',fill:`url(#${id})`}));
  const pos=new Map(nodes.map(n=>[n.ref,{x:n.x-minX+90,y:n.y-minY+70,n}]));
  for(const [from,to] of design.graph.edges){
    const a=pos.get(from),b=pos.get(to);if(!a||!b)continue;
    const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d;
    const x=b.x-ux*40,y=b.y-uy*40;
    svg.append(el('path',{d:`M${a.x+ux*40} ${a.y+uy*40} L${x} ${y}`,fill:'none',stroke:'var(--edge-idle)','stroke-width':3}));
    svg.append(el('path',{d:`M${x} ${y} l${-ux*9-uy*4.5} ${-uy*9+ux*4.5} l${uy*9} ${-ux*9}Z`,fill:'var(--edge-idle)'}));
  }
  for(const {x,y,n} of pos.values()){
    const category=catalog.elementById.get(n.type)?.category||'compute';
    svg.append(el('image',{href:`assets/e08/bodies/${category}-ok.svg`,x:x-50,y:y-50,width:100,height:100}),
      el('image',{href:`assets/e08/glyphs/${n.type}.svg`,x:x-19.56,y:y-19.56,width:39.12,height:39.12}),
      el('rect',{x:x-30.43,y:y+26.09,width:60.87,height:4.35,rx:2.17,fill:'var(--border)'}),
      el('circle',{cx:x+31.52,cy:y-31.52,r:5.43,fill:'#4ade80',stroke:'var(--ink)','stroke-width':1.63}));
    const label=el('text',{x,y:y+62,'text-anchor':'middle',fill:'var(--text)','font-family':'system-ui,sans-serif','font-size':14,'font-weight':700});
    label.textContent=(n.units>1?`${n.units}× `:'')+(catalog.elementById.get(n.type)?.name||n.type);svg.append(label);
    const ref=el('text',{x,y:y+79,'text-anchor':'middle',fill:'var(--text-2)','font-family':'system-ui,sans-serif','font-size':12});ref.textContent=n.ref;svg.append(ref);
  }
  svg.querySelectorAll('image').forEach(siteImage);
  return svg;
}
