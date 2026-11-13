// Reference diagrams share the live paper card, bar and wire values. Static views never animate.
import { PAPER, paperPalette, paperBodySvg, paperGlyph, paperStatus } from './paper.js';
import { resolvePalette, hexStr } from './theme.js';
let uid=0;
export function paperDesignDiagram(design,catalog) {
  const NS='http://www.w3.org/2000/svg',P=paperPalette(resolvePalette());
  const el=(tag,attrs={})=>{const e=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;};
  const nodes=design.graph.nodes,minX=Math.min(...nodes.map(n=>n.x)),maxX=Math.max(...nodes.map(n=>n.x)),minY=Math.min(...nodes.map(n=>n.y)),maxY=Math.max(...nodes.map(n=>n.y));
  const width=maxX-minX+180,height=maxY-minY+180,ink=hexStr(P.ink),id='paper-grid-'+ ++uid;
  const svg=el('svg',{viewBox:`0 0 ${width} ${height}`,role:'img','aria-label':`Diagram of ${design.name}`,'data-look':'paper',style:`width:${width*.8}px;display:block;background:${hexStr(P.card)}`});
  const defs=el('defs'),pattern=el('pattern',{id,width:20,height:20,patternUnits:'userSpaceOnUse'});pattern.append(el('circle',{cx:1,cy:1,r:1,fill:ink,opacity:.2}));defs.append(pattern);svg.append(defs,el('rect',{width:'100%',height:'100%',fill:`url(#${id})`}));
  const pos=new Map(nodes.map(n=>[n.ref,{x:n.x-minX+90,y:n.y-minY+70,n}]));
  for(const[from,to]of design.graph.edges){
    const a=pos.get(from),b=pos.get(to);if(!a||!b)continue;
    const sign=b.x>=a.x?1:-1,x=a.x+sign*PAPER.wire.port,end=b.x-sign*PAPER.wire.port,h=Math.max(30,Math.abs(end-x)*.5);
    svg.append(el('path',{d:`M${x} ${a.y}C${x+sign*h} ${a.y} ${end-sign*h} ${b.y} ${end} ${b.y}`,fill:'none',stroke:ink,'stroke-width':PAPER.wire.width,'stroke-dasharray':`${PAPER.wire.dash} ${PAPER.wire.gap}`}));
    svg.append(el('path',{d:`M${end} ${b.y}l${-sign*PAPER.wire.arrowLength} ${-PAPER.wire.arrowHalf}v${2*PAPER.wire.arrowHalf}Z`,fill:ink}));
  }
  for(const{x,y,n}of pos.values()){
    const category=catalog.elementById.get(n.type)?.category||'compute',g=el('g',{transform:`translate(${x} ${y})`});
    const source=new DOMParser().parseFromString(paperBodySvg(P,category),'image/svg+xml');
    g.append(...[...source.documentElement.children].map(child=>document.importNode(child,true)));
    const title=el('text',{x:PAPER.title.x,y:PAPER.title.y+PAPER.title.size,'text-anchor':'middle',fill:ink,'font-family':PAPER.type.label,'font-size':PAPER.title.size,'font-weight':700});title.textContent=catalog.elementById.get(n.type)?.name||n.type;g.append(title);
    const icon=el('image',{x:PAPER.icon.x-PAPER.icon.size/2,y:-PAPER.icon.size/2,width:PAPER.icon.size,height:PAPER.icon.size});
    paperGlyph(n.type).then(source=>icon.setAttribute('href','data:image/svg+xml;charset=utf-8,'+encodeURIComponent(source.replace('#f3eee0',ink)))).catch(e=>console.error(e));g.append(icon);
    const status=el('text',{x:PAPER.status.x,y:PAPER.status.y+PAPER.status.size/3,'text-anchor':'middle',fill:hexStr(P.text2),'font-family':PAPER.type.mono,'font-size':PAPER.status.size,'font-weight':700});status.textContent=paperStatus(false,false,0);g.append(status);
    const b=PAPER.bar;g.append(el('rect',{x:b.x,y:b.y,width:b.width,height:b.height,fill:hexStr(P.paper),stroke:ink,'stroke-width':b.stroke}));
    const label=el('text',{x:0,y:62,'text-anchor':'middle',fill:ink,'font-family':PAPER.type.label,'font-size':PAPER.type.captionSize,'font-weight':700});label.textContent=(n.units>1?`${n.units}× `:'')+(catalog.elementById.get(n.type)?.name||n.type);g.append(label);
    const ref=el('text',{x:0,y:79,'text-anchor':'middle',fill:hexStr(P.text2),'font-family':PAPER.type.mono,'font-size':12});ref.textContent=n.ref;g.append(ref);svg.append(g);
  }
  return svg;
}
