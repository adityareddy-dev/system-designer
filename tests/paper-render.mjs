import assert from 'node:assert/strict';
import { test } from 'node:test';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';

const site=await serveGame();
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
  await test('paper cards, states and reference diagrams share home-demo values',async()=>{
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(site.base+'#/settings');
    const result=await page.evaluate(async()=>{
      const {loadPixi}=await import('./ui/shell/playhost.js');await loadPixi();
      const {loadCatalog}=await import('./sim/catalog.js'),{createKit}=await import('./render/textures.js');
      const {PAPER,paperPalette}=await import('./render/paper.js'),{resolvePalette}=await import('./render/theme.js');
      const {createNodeLayer,makeMini,refreshMini}=await import('./render/nodes.js'),{designDiagram}=await import('./ui/play/editorial.js');
      const {problemById}=await import('./content/problems/index.js');
      const catalog=await loadCatalog(),kit=await createKit(PIXI,paperPalette(resolvePalette()),catalog,1),parent=new PIXI.Container();
      const layer=createNodeLayer(PIXI,parent,{kit:()=>kit,element:t=>catalog.elementById.get(t),shapeOf:()=> 'rounded-square',reduced:()=>true,zoom:()=>1,regionShort:()=>''});
      try {
        layer.sync({nodes:catalog.elements.map((el,i)=>({id:el.id,type:el.id,x:i*160,y:0})),edges:[]});layer.update(1000,0,0);
        const glyphs=new Set([...layer.views.values()].map(v=>v.icon.texture.uid)).size;
        const v=layer.views.get('vm-fleet');
        const states=[.4,.9,1.3,0].map((load,i)=>{layer.setLive(v,true,load,i===3?4:i===2?3:0);layer.update(1000,0,0);
          return {status:v.paperStatus.text,color:v.drawnColor,down:v.down,rejected:v.rejected.visible};});
        layer.setLive(v,false);layer.update(1000,0,0);
        const mini=makeMini(PIXI,kit,{element:t=>catalog.elementById.get(t),shapeOf:()=> 'rounded-square'},'vm-fleet',{faint:true});refreshMini(kit,mini);
        const ghost={paper:mini.__body.texture===kit.bodyTex.compute,alpha:mini.__body.alpha,size:mini.__icon.width};mini.destroy({children:true});
        const ready=v.paperStatus.text,source=kit.bodyTex.compute.source.resource,ctx=source.getContext('2d');
        const pixel=[...ctx.getImageData(100,100,1,1).data];
        const svg=designDiagram(problemById.get('url-shortener').editorial.designs[0],catalog,'paper');
        const classic=designDiagram(problemById.get('chat-app').editorial.designs[0],catalog);
        await Promise.all([...svg.querySelectorAll('image')].map(img=>new Promise((resolve,reject)=>{let n=0;const poll=()=>img.getAttribute('href')?.startsWith('data:')?resolve():++n>100?reject(new Error('preview glyph timeout')):setTimeout(poll,20);poll();})));
        return {edgeHit:layer.hit(v.x+43,v.y)?.id===v.id,ghost,glyphs,count:layer.views.size,states,ready,pixel,look:svg.dataset.look,classic:classic.dataset.look||'classic',
          wires:[...svg.querySelectorAll('path[stroke-dasharray]')].map(e=>({d:e.getAttribute('d'),width:e.getAttribute('stroke-width'),dash:e.getAttribute('stroke-dasharray'),ink:e.getAttribute('stroke')})),type:v.labelT.style.fontFamily,title:v.paperTitle.style.fontFamily,bar:PAPER.bar};
      }finally{layer.destroy();parent.destroy();kit.destroy();}
    });
    assert.equal(result.edgeHit,true,'the paper card edge remains clickable');assert.deepEqual(result.ghost,{paper:true,alpha:.45,size:24});assert.equal(result.count,99);assert.equal(result.glyphs,99);assert.deepEqual(result.pixel,[255,252,244,255]);
    assert.deepEqual(result.states.map(s=>s.status),['60% spare','10% spare','overloaded','down']);
    assert.deepEqual(result.states.slice(0,3).map(s=>s.color),[0x2d5bff,0xffc93c,0xff5b3a]);
    assert.equal(result.states[2].rejected,true);assert.equal(result.states[3].down,true);assert.equal(result.ready,'ready');
    assert.equal(result.look,'paper');assert.equal(result.classic,'classic');assert(result.wires.length>0);
    for(const w of result.wires){assert.match(w.d,/C/);assert.equal(w.width,'2.5');assert.equal(w.dash,'6 10');assert.equal(w.ink,'#141414');}
    assert.match(result.type,/Space Grotesk/);assert.match(result.title,/Space Grotesk/);assert.deepEqual(errors,[]);
    await page.close();
  });
}finally{await browser.close();await site.close();}
