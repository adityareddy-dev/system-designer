// Measure actual Pixi transforms after the real Fit control, including every editorial alternative.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';

const revision=process.env.READABILITY_REVISION, out=process.env.READABILITY_OUT;
const root=new URL('../',import.meta.url), site=await serveGame();
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/classic-fit-labels.json',import.meta.url)));
const rows=[],errors=[],delay=ms=>new Promise(r=>setTimeout(r,ms));
if(out)fs.mkdirSync(out,{recursive:true});
try {
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.evaluateOnNewDocument(()=>{localStorage.setItem('hotpath.v1.seenIntro','true');localStorage.setItem('hotpath.v1.settings',JSON.stringify({soundMuted:true,reducedMotion:'reduce',quality:'high'}));});
 await page.setRequestInterception(true);page.on('request',r=>{
  const url=new URL(r.url()),file=url.pathname.slice(1);
  if(url.origin===new URL(site.base).origin&&(/\.(js|css|html|json|svg)$/.test(file)||file==='')){
   let body;
   try{body=revision?execFileSync('git',['show',`${revision}:${file||'index.html'}`],{cwd:root,stdio:['ignore','pipe','ignore']}).toString():fs.readFileSync(new URL(file||'index.html',root),'utf8');}catch{return r.continue();}
   if(file==='ui/play/play.js')body=body.replace('  return controller;','  window.readability={scene,controller,loadDesign}; return controller;');
   if(file==='render/nodes.js')body=body.replace('  return {\n    views,','  return window.readabilityNodes={\n    views,');
   const contentType=({'js':'text/javascript','css':'text/css','html':'text/html','json':'application/json','svg':'image/svg+xml'})[file.split('.').at(-1)]||'text/html';
   return r.respond({contentType,body});
  }r.continue();
 });
 await page.goto(site.base+'#/practice/url-shortener');await page.waitForFunction(()=>!!window.readability);await page.evaluate(()=>document.fonts.ready);
 const problems=await page.evaluate(async()=>[...(await import('./content/problems/index.js')).problemById.values()].map(p=>({id:p.id,names:p.editorial.designs.map(d=>d.name)})));
 for(const p of problems){
  await page.evaluate(id=>window.__game.loadProblem(id),p.id);
  for(let i=0;i<p.names.length;i++){
   await page.evaluate(async({id,i})=>{const p=(await import('./content/problems/index.js')).problemById.get(id);window.readability.loadDesign(p.editorial.designs[i]);window.__game.startTraffic();window.__game.pause();window.__game.step(21*60000);},{id:p.id,i});
   await page.click('[aria-label="Fit to screen (F)"]');await delay(180);
   const m=await page.evaluate(()=>{
    const {scene,controller}=window.readability;scene.renderNow(1000);
    const vs=[...window.readabilityNodes.views.values()],z=scene.stats().zoom,paper=document.querySelector('.pl-stage canvas').dataset.look==='paper';
    const rect=b=>({x:b.x,y:b.y,width:b.width,height:b.height});
    const box=(v,b)=>{const a=v.c.toGlobal({x:b.x,y:b.y}),c=v.c.toGlobal({x:b.x+b.width,y:b.y+b.height});return{id:v.id,x:a.x,y:a.y,width:c.x-a.x,height:c.y-a.y};};
    const cards=vs.map(v=>box(v,paper?(v.paperBox||{x:-116.25,y:-60.25,width:238.5,height:124.5}):{x:-38,y:-38,width:76,height:76}));
    const hit=(a,b)=>a.x<b.x+b.width-.01&&a.x+a.width>b.x+.01&&a.y<b.y+b.height-.01&&a.y+a.height>b.y+.01;
    const names=vs.map(v=>{const t=paper?v.paperTitle:v.labelT;return{id:v.id,text:t.text,shown:v.c.visible&&t.visible&&t.renderable,px:t.style.fontSize*Math.abs(t.worldTransform.a),box:rect(t.getBounds())};});
    const glyphs=vs.map(v=>{
     const b=v.icon.getBounds();let ink=1;
     if(paper){
      const t=v.icon.texture,cache=window.readabilityInk||(window.readabilityInk=new Map());
      if(!cache.has(t.uid)){
       const c=t.source.resource,ctx=c.getContext('2d'),a=ctx.getImageData(0,0,c.width,c.height).data;
       let left=c.width,top=c.height,right=0,bottom=0;
       for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)if(a[(y*c.width+x)*4+3]>64){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
       cache.set(t.uid,Math.max((right-left)/c.width,(bottom-top)/c.height));
      }ink=cache.get(t.uid);
     }
     return{id:v.id,px:b.width*ink,framePx:b.width,shown:v.icon.visible};
    });
    const covered=vs.flatMap(v=>(paper?['paperTitle','paperStatus','paperReading','paperWaiting','evidenceT']:['labelT','evidenceT']).filter(k=>v[k].visible&&v[k].renderable&&v[k].text).flatMap(k=>cards.filter(b=>b.id!==v.id&&hit(v[k].getBounds(),b)).map(b=>[v.id,k,b.id])));
    const paintOrder=paper?vs.every(v=>v.c.getChildIndex(v.paperCard||v.body)<v.c.getChildIndex(v.icon)&&v.c.getChildIndex(v.paperCard||v.body)<v.c.getChildIndex(v.paperTitle)):true;
    const headerOverflow=paper?names.filter(n=>{const b=cards.find(b=>b.id===n.id);return n.box.x<b.x-.1||n.box.y<b.y-.1||n.box.x+n.box.width>b.x+b.width+.1||n.box.y+n.box.height>b.y+b.height+.1;}).map(n=>n.id):[];
    const overlaps=cards.flatMap((a,i)=>cards.slice(i+1).filter(b=>hit(a,b)).map(b=>[a.id,b.id]));
    const texts=vs.flatMap(v=>(paper?['paperTitle','paperStatus','paperReading','paperWaiting','evidenceT']:['labelT','evidenceT']).filter(k=>v.c.visible&&v[k].visible&&v[k].renderable&&v[k].text).map(k=>({id:v.id,key:k,box:rect(v[k].getBounds())})));
    const textOverlaps=paper?texts.flatMap((a,i)=>texts.slice(i+1).filter(b=>hit(a.box,b.box)).map(b=>[a.id,a.key,b.id,b.key])):[];
    const free=window.__game.getState().view.free;
    const uiCovered=paper?texts.filter(t=>t.box.x<free.l||t.box.x+t.box.width>canvasWidth() -free.r||t.box.y<free.t||t.box.y+t.box.height>canvasHeight()-free.b||(free.blocks||[]).some(b=>hit(t.box,b))).map(t=>[t.id,t.key]):[];
    function canvasWidth(){return document.querySelector('.pl-stage canvas').getBoundingClientRect().width;}
    function canvasHeight(){return document.querySelector('.pl-stage canvas').getBoundingClientRect().height;}
    const chrome=[...document.querySelectorAll('.pl-stepper,.pl-toptools,.pl-toolbar,.pl-hud,.pl-req-card')].filter(e=>e.getClientRects().length).map(e=>rect(e.getBoundingClientRect()));
    const canvas=document.querySelector('.pl-stage canvas').getBoundingClientRect(),offscreen=names.filter(n=>n.box.x<0||n.box.y<0||n.box.x+n.box.width>canvas.width||n.box.y+n.box.height>canvas.height).map(n=>n.id);
    return{textOverlaps,uiCovered,paintOrder,zoom:z,parts:vs.length,names,glyphs,minNamePx:Math.min(...names.map(n=>n.px)),minGlyphPx:Math.min(...glyphs.map(n=>n.px)),cards,overlaps,covered,headerOverflow,offscreen,gameErrors:window.__game.getState().errors,model:controller.state.sim.getGraph().nodes.map(n=>({id:n.id,type:n.type,x:n.x,y:n.y})),chrome};
   });
   const row={id:p.id,index:i,name:p.names[i],...m};rows.push(row);
   if(out){fs.writeFileSync(path.join(out,'results.json'),JSON.stringify({revision:revision||'working',errors,rows},null,2));if(process.env.READABILITY_SHOTS)await page.screenshot({path:path.join(process.env.READABILITY_SHOTS,p.id+(i?`-${i+1}`:'')+'.png')});}
   console.log(p.id,i+1,p.names.length,'name',m.minNamePx.toFixed(2),'glyph',m.minGlyphPx.toFixed(2),'overlaps',m.overlaps.length,'covered',m.covered.length);
  }
 }
 assert.equal(rows.length,93);assert.deepEqual(errors,[]);
 if(!revision||process.env.READABILITY_ASSERT)for(const r of rows){assert(r.paintOrder,r.id+' text and glyph paint above card');const classic=baseline.rows.find(b=>b.id===r.id&&b.index===r.index);assert(r.minNamePx>=classic.minNamePx-.01,`${r.id}/${r.index}: paper ${r.minNamePx} < classic ${classic.minNamePx}`);assert(r.minNamePx>=12-.01,`${r.id}/${r.index}: name ${r.minNamePx}px`);assert(r.minGlyphPx>=14-.01,`${r.id}: glyph ${r.minGlyphPx}px`);assert(r.names.every(n=>n.shown),`${r.id}: hidden name`);assert.deepEqual(r.overlaps,[],r.id+' overlaps');assert.deepEqual(r.covered,[],r.id+' covered');assert.deepEqual(r.headerOverflow,[],r.id+' header overflow');assert.deepEqual(r.textOverlaps,[],r.id+' text overlap');assert.deepEqual(r.uiCovered,[],r.id+' UI covers text');assert.deepEqual(r.offscreen,[],r.id+' cropped');assert.deepEqual(r.gameErrors,[],r.id+' game errors');}
 if(!revision||process.env.READABILITY_ASSERT){
  await page.evaluate(id=>window.__game.loadProblem(id),'bank-ledger');
  const transition=await page.evaluate(async()=>{
   const p=(await import('./content/problems/index.js')).problemById.get('bank-ledger');
   const {scene,controller,loadDesign}=window.readability;loadDesign(p.editorial.designs[0]);
   const model=JSON.stringify(controller.state.sim.getGraph());
   const read=()=>{scene.renderNow(1000);return [...window.readabilityNodes.views.values()].map(v=>({compact:v.paperCompact,body:v.body.visible,name:v.paperTitle.style.fontSize*Math.abs(v.paperTitle.scale.x*v.c.scale.x*scene.stats().zoom),glyph:v.icon.width*Math.abs(v.c.scale.x*scene.stats().zoom)}));};
   scene.fit(80,false,{maxZ:.3});const compact=read();scene.zoomBy(4);const full=read();scene.zoomBy(.25);const back=read();
   const v=window.readabilityNodes.views.values().next().value;
   const hit=window.readabilityNodes.hit(v.x+v.renderWidth/2-1,v.y)?.id===v.id;
   const clear=!window.readabilityNodes.hit(v.x,v.y-v.renderHeight/2-10);
   return{compact,full,back,hit,clear,unchanged:model===JSON.stringify(controller.state.sim.getGraph())};
  });
  assert(transition.compact.every(v=>v.compact&&!v.body&&v.name>=13.99&&v.glyph>=15.99));
  assert(transition.full.every(v=>!v.compact&&v.body&&v.name>=13),'zoom restores the full card');
  assert(transition.back.every(v=>v.compact&&!v.body&&v.name>=13.99&&v.glyph>=15.99));
  assert(transition.hit&&transition.clear,'hit targets follow the compact header');assert(transition.unchanged,'zoom and Fit leave the saved graph unchanged');
  if(out)fs.writeFileSync(path.join(out,'transitions.json'),JSON.stringify(transition,null,2));
  console.log('Compact/full/compact transition, header hit bounds and saved coordinates passed.');
 }
}finally{await browser.close();await site.close();}
