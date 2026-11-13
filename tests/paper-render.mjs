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
        layer.sync({nodes:catalog.elements.map((el,i)=>({id:el.id,type:el.id,x:i*320,y:0})),edges:[]});layer.update(1000,0,0);
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
        return {headers:[...layer.views.values()].map(n=>{const b=n.paperTitle.getLocalBounds();return {x:n.paperTitle.x+b.x*n.paperTitle.scale.x,y:n.paperTitle.y+b.y*n.paperTitle.scale.y,width:b.width*n.paperTitle.scale.x,height:b.height*n.paperTitle.scale.y};}),body:PAPER.body,duplicateName:v.labelT.visible,arc:v.retryG.visible,pile:v.pile.visible,reading:v.paperReading?.text,wideHit:layer.hit(v.x+110,v.y)?.id===v.id,edgeHit:layer.hit(v.x+43,v.y)?.id===v.id,ghost,glyphs,count:layer.views.size,states,ready,pixel,look:svg.dataset.look,classic:classic.dataset.look||'classic',
          wires:[...svg.querySelectorAll('path[stroke-dasharray]')].map(e=>({d:e.getAttribute('d'),width:e.getAttribute('stroke-width'),dash:e.getAttribute('stroke-dasharray'),ink:e.getAttribute('stroke')})),type:v.labelT.style.fontFamily,title:v.paperTitle.style.fontFamily,bar:PAPER.bar};
      }finally{layer.destroy();parent.destroy();kit.destroy();}
    });
    for(const h of result.headers){assert(h.x>=-114&&h.x+h.width<=114,'every catalog name fits the paper header');assert(h.y>=-59&&h.y+h.height<=-17,'every catalog name stays above its bar');}
    assert(result.body.width >= 220 && result.body.height >= 110, 'wide paper cards match the approved mock'); assert.equal(result.duplicateName,false,'no second name below the card'); assert.equal(result.arc,false,'no retry arc over paper headers'); assert.equal(result.pile,false,'no legacy input dots'); assert.equal(result.wideHit,true,'wide card edges stay clickable');
    assert.equal(result.edgeHit,true,'the paper card edge remains clickable');assert.deepEqual(result.ghost,{paper:true,alpha:.45,size:22});assert.equal(result.count,99);assert.equal(result.glyphs,99);assert.deepEqual(result.pixel,[255,252,244,255]);
    assert.deepEqual(result.states.map(s=>s.status),['healthy','healthy','overloaded','down']);
    assert.deepEqual(result.states.slice(0,3).map(s=>s.color),[0x2d5bff,0xffc93c,0xff5b3a]);
    assert.equal(result.states[2].rejected,false);assert.equal(result.states[3].down,true);assert.equal(result.ready,'ready');
    assert.equal(result.look,'paper');assert.equal(result.classic,'classic');assert(result.wires.length>0);
    for(const w of result.wires){assert.match(w.d,/C/);assert.equal(w.width,'2.5');assert.equal(w.dash,'6 10');assert.equal(w.ink,'#141414');}
    assert.match(result.type,/Space Grotesk/);assert.match(result.title,/Space Grotesk/);assert.deepEqual(errors,[]);
    await page.close();
  });
  await test('paper connection previews start outside wide cards and outline their target',async()=>{
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.setRequestInterception(true);
    page.on('request',async request=>{
      if(new URL(request.url()).pathname==='/render/scene.js'){
        const response=await fetch(request.url()),source=await response.text();
        return request.respond({contentType:'text/javascript',body:source.replace('  // ---- state ----','  window.paperEditing={ui,band,target}; // ---- state ----')});
      }
      request.continue();
    });
    await page.goto(site.base+'#/settings');
    const result=await page.evaluate(async()=>{
      const {loadPixi}=await import('./ui/shell/playhost.js');await loadPixi();
      const {loadCatalog}=await import('./sim/catalog.js'),{createScene}=await import('./render/scene.js');
      const host=document.createElement('div');host.style.cssText='position:fixed;inset:0';document.body.append(host);
      const scene=await createScene(host,{catalog:await loadCatalog(),look:'paper',reducedMotion:true});
      try {
        const {ui,band,target}=window.paperEditing,source={id:'source',x:0,y:0};
        ui.drawBand(source,220,0,null,true);const free=band.context.bounds.minX;
        ui.drawBand(source,400,0,{id:'target',x:400,y:0},true);const snapped=band.context.bounds;
        return {free,snappedStart:snapped.minX,snappedEnd:snapped.maxX,oldTarget:target.visible};
      }finally{scene.destroy();host.remove();}
    });
    assert(result.free>=113,'a loose preview clears the source card');
    assert(result.snappedStart>=113,'a snapped preview clears the source card');
    assert(result.snappedEnd>=515,'the target outline spans the wide card: '+JSON.stringify(result));
    assert.equal(result.oldTarget,false,'the old square target never covers card text');
    assert.deepEqual(errors,[]);await page.close();
  });
}finally{await browser.close();await site.close();}
