// The first-limit sticky note and readable card headers stay clear at desktop and phone fit.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
const site=await serveGame();
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
 await test('paper headers are single, bounded names and first-limit notes clear every card',async()=>{
  const page=await browser.newPage();await page.goto(site.base+'#/settings');
  const results=await page.evaluate(async()=>{
   const {loadPixi}=await import('./ui/shell/playhost.js');await loadPixi();
   const {loadCatalog}=await import('./sim/catalog.js'),{createKit}=await import('./render/textures.js');
   const {createNodeLayer}=await import('./render/nodes.js'),{paperPalette}=await import('./render/paper.js'),{resolvePalette}=await import('./render/theme.js');
   const catalog=await loadCatalog(),kit=await createKit(PIXI,paperPalette(resolvePalette()),catalog,1),parent=new PIXI.Container();let zoom=1;
   const layer=createNodeLayer(PIXI,parent,{kit:()=>kit,element:t=>catalog.elementById.get(t),shapeOf:()=> 'rounded-square',reduced:()=>true,zoom:()=>zoom,regionShort:()=>''});
   try {
    layer.sync({nodes:[-180,0,180].map((y,i)=>({id:'api'+i,type:'vm-fleet',x:0,y})),edges:[]});
    const v=layer.views.get('api0');v.telemetry={retryRps:7300};layer.setLead(v.id);
    return [1,.3].flatMap(z=>{zoom=z;layer.setLabelScale(z);return [11600,1160000000,0].map(rate=>{
     for(const node of layer.views.values())layer.setLive(node,true,rate?1.4:.4,rate?3:0,0,.5,-1,rate);
     const camera={zoom:z,size:{w:390,h:800},worldToScreen:(x,y)=>({x:195+x*z,y:350+y*z})};layer.update(1000,0,0);layer.layoutLabels(camera);
     const note=v.factCaption?{x:v.x+v.factCaption.x,y:v.y+v.factCaption.y,width:v.factCaption.width,height:v.factCaption.height}:null;
     return {z,rate,note,text:v.evidenceT.text,shown:v.evidenceT.visible&&v.evidenceT.renderable,overlays:[...layer.views.values()].some(n=>n.rejected.visible||n.pile.visible||n.retryG.visible||n.labelT.visible),headers:[...layer.views.values()].map(n=>{const b=n.paperTitle.getLocalBounds();return{x:n.paperTitle.x+b.x*n.paperTitle.scale.x,y:n.paperTitle.y+b.y*n.paperTitle.scale.y,width:b.width*n.paperTitle.scale.x,height:b.height*n.paperTitle.scale.y,card:n.paperCompact?n.paperBox:{x:-115,y:-59,width:230,height:42}};}),cards:[...layer.views.values()].map(n=>({x:n.x+n.paperBox.x,y:n.y+n.paperBox.y,width:n.paperBox.width,height:n.paperBox.height}))};
    });});
   }finally{layer.destroy();parent.destroy();kit.destroy();}
  });
  for(const r of results){assert.equal(r.overlays,false);assert(r.shown,'first-limit sticky note remains visible');assert.match(r.text,/First limit\..*retry/);for(const c of r.cards)assert(!(r.note.x<c.x+c.width&&r.note.x+r.note.width>c.x&&r.note.y<c.y+c.height&&r.note.y+r.note.height>c.y),'sticky note clears every card');for(const h of r.headers){assert(h.x>=h.card.x&&h.x+h.width<=h.card.x+h.card.width,'header name stays inside card');assert(h.y>=h.card.y&&h.y+h.height<=h.card.y+h.card.height,'header text clears load bar');}}
  await page.close();
 });
}finally{await browser.close();await site.close();}
