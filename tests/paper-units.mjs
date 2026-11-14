import assert from 'node:assert/strict';
import {test} from 'node:test';
import puppeteer from 'puppeteer-core';
import {serveGame} from './browser-server.js';
const site=await serveGame(),browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
 await test('multi-unit paper cards retain a separate chip without covering any catalog name',async()=>{
  const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.goto(site.base+'#/settings');
  const rows=await p.evaluate(async()=>{
   const {loadPixi}=await import('./ui/shell/playhost.js');await loadPixi();await document.fonts.ready;
   const {loadCatalog}=await import('./sim/catalog.js'),{createKit}=await import('./render/textures.js'),{paperPalette}=await import('./render/paper.js'),{resolvePalette}=await import('./render/theme.js'),{createNodeLayer}=await import('./render/nodes.js');
   const catalog=await loadCatalog(),kit=await createKit(PIXI,paperPalette(resolvePalette()),catalog,1),parent=new PIXI.Container();let zoom=1;
   const layer=createNodeLayer(PIXI,parent,{kit:()=>kit,element:t=>catalog.elementById.get(t),shapeOf:()=> 'rounded-square',reduced:()=>true,zoom:()=>zoom,regionShort:()=>''}),rows=[];
   try {
    for(const units of [3,12345,1]) {
     layer.sync({nodes:catalog.elements.map((el,i)=>({id:el.id,type:el.id,x:i*320,y:0,units})),edges:[]});
     for(const z of [1,.5])for(const state of ['idle','overloaded','down']){
      zoom=z;layer.setLabelScale(z);
      for(const v of layer.views.values())layer.setLive(v,state!=='idle',1.3,state==='down'?4:3,0,0,-1,state==='overloaded'?1200:0);
      layer.update(1000,0,0);
      for(const v of layer.views.values()){
       const box=t=>{const b=t.getBounds();return{x:b.x,y:b.y,width:b.width,height:b.height};};
       rows.push({id:v.id,units,z,state,compact:v.paperCompact,chip:v.paperUnits?.visible?{text:v.paperUnits.text,box:box(v.paperUnits),outline:box(v.paperUnitsBg)}:null,title:box(v.paperTitle),status:v.paperStatus.text,reading:v.paperReading.text,card:{x:v.x+v.paperBox.x,y:v.y+v.paperBox.y,width:v.paperBox.width,height:v.paperBox.height}});
      }
     }
    }
    return rows;
   }finally{layer.destroy();parent.destroy();kit.destroy();}
  });
  const hit=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
  for(const r of rows){
   if(r.units===1){assert.equal(r.chip,null,'one unit has no chip');continue;}
   assert(r.chip,`${r.id} ${r.state} zoom ${r.z}: units chip stays visible`);
   assert.equal(r.chip.text,'×'+r.units);assert(!hit(r.title,r.chip.outline),`${r.id}: name clears the outlined chip`);
   for(const b of [r.chip.outline,r.title])assert(b.x>=r.card.x-.1&&b.y>=r.card.y-.1&&b.x+b.width<=r.card.x+r.card.width+.1&&b.y+b.height<=r.card.y+r.card.height+.1,`${r.id}: chip and name stay inside card`);
   if(!r.compact&&r.state==='overloaded')assert.match(r.reading,/rejected/,'status reading stays independent of units');
  }
  assert.deepEqual(errors,[]);await p.close();
 });
 await test('paper reference cards reserve header space for the units chip',async()=>{
  const p=await browser.newPage();await p.goto(site.base+'#/settings');
  const rows=await p.evaluate(async()=>{
   await document.fonts.ready;
   const {paperDesignDiagram}=await import('./render/paper-preview.js'),{loadCatalog}=await import('./sim/catalog.js');
   const catalog=await loadCatalog(),rows=[];
   for(const e of catalog.elements){
    const svg=paperDesignDiagram({name:e.name,graph:{nodes:[{ref:e.id,type:e.id,x:0,y:0,units:3}],edges:[]}},catalog);
    document.body.append(svg);
    const g=svg.querySelector('g[transform]'),chip=g.querySelector('[data-units]'),title=g.querySelector('text'),outline=chip?.previousElementSibling;
    rows.push({name:title.textContent,chip:chip?.textContent,clear:!!chip&&title.getBBox().x+title.getBBox().width<outline.getBBox().x});svg.remove();
   }
   return rows;
  });
  assert.equal(rows.length,99);
  for(const r of rows){assert.equal(r.chip,'×3');assert(r.clear,'reference name clears units '+JSON.stringify(r));}
  await p.close();
 });
}finally{await browser.close();await site.close();}
