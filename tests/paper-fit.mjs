import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {test} from 'node:test';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer-core';
import {serveGame} from './browser-server.js';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,''),out=process.env.FIT_OUT;
const site=await serveGame(),browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const log={errors:[],scenes:[],insertions:[]},sleep=ms=>new Promise(r=>setTimeout(r,ms));
const save=()=>{if(process.env.FIT_OUT)fs.writeFileSync(out+'/regression-results.json',JSON.stringify(log,null,2));};
async function page(width=1440){
 const c=await browser.createBrowserContext(),p=await c.newPage();await p.setViewport({width,height:1000,isMobile:width===390,hasTouch:width===390,deviceScaleFactor:1});
 p.on('pageerror',e=>log.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')log.errors.push(m.text());});
 await p.evaluateOnNewDocument(()=>{localStorage.setItem('hotpath.v1.seenIntro','true');localStorage.setItem('hotpath.v1.warmups',JSON.stringify({'url-shortener':true,'bank-ledger':true}));localStorage.setItem('hotpath.v1.settings',JSON.stringify({soundMuted:true,reducedMotion:'reduce',quality:'high'}));});
 await p.setRequestInterception(true);p.on('request',r=>{const f=new URL(r.url()).pathname;if(['/ui/play/play.js','/render/nodes.js','/render/edges.js','/render/scene.js','/render/camera.js','/render/fit.js'].includes(f)){let s=process.env.FIT_REVISION?execFileSync('git',['show',process.env.FIT_REVISION+':'+f.slice(1)],{cwd:root}).toString():fs.readFileSync(root+f,'utf8');s=s.replace('  return controller;','  window.review={controller,scene,loadDesign}; return controller;');s=s.replace('  return {\n    views,',f.includes('/nodes')?'  return window.reviewNodes={\n    views,':'  return window.reviewEdges={\n    views,');return r.respond({contentType:'text/javascript',body:s});}r.continue();});
 await p.goto(site.base+'#/practice/url-shortener');await p.waitForFunction(()=>!!window.review);await p.evaluate(()=>document.fonts.ready);return p;
}
async function inspect(p){
 const pt=await p.evaluate(()=>{const v=window.reviewNodes.views.values().next().value,b=document.querySelector('.pl-stage canvas').getBoundingClientRect();return{x:v.c.worldTransform.tx+b.left,y:v.c.worldTransform.ty+b.top};});
 await p.mouse.click(pt.x,pt.y);await p.waitForSelector('.pl-inspector',{visible:true});await sleep(600);
}
async function fit(p){await p.click('[aria-label="Fit to screen (F)"]');await sleep(450);}
async function capture(p,key){await p.mouse.move(0,0);await sleep(120);const m=await p.evaluate(()=>{
 const vs=[...window.reviewNodes.views.values()],stage=document.querySelector('.pl-stage canvas').getBoundingClientRect(),box=t=>{const b=t.getBounds();return{x:b.x,y:b.y,width:b.width,height:b.height};},hit=(a,b)=>a.x<b.x+b.width-.1&&a.x+a.width>b.x+.1&&a.y<b.y+b.height-.1&&a.y+a.height>b.y+.1;
 const cards=vs.map(v=>{const r=v.paperBox,a=v.c.toGlobal({x:r.x,y:r.y}),b=v.c.toGlobal({x:r.x+r.width,y:r.y+r.height});return{id:v.id,x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y};});
 const texts=vs.flatMap(v=>['paperTitle','paperStatus','paperReading','paperWaiting','evidenceT'].filter(k=>v[k].visible&&v[k].renderable&&v[k].text).map(k=>({id:v.id,key:k,text:v[k].text,box:box(v[k]),px:v[k].style.fontSize*Math.abs(v[k].worldTransform.a)})));
 const viewport={x:0,y:0,width:stage.width,height:stage.height};
 const ui=[...document.querySelectorAll('.pl-stepper,.pl-toptools,.pl-toolbar,.pl-hud,.pl-req-card,.pl-overview,.pl-add-btn,.pl-palette-toggle')].filter(e=>e.checkVisibility()).map(e=>{const b=e.getBoundingClientRect();return{selector:e.className,x:b.x-stage.x,y:b.y-stage.y,width:b.width,height:b.height};});
 const visibleTexts=texts.filter(t=>hit(t.box,viewport));
 const clippedTexts=visibleTexts.filter(t=>t.box.x<0||t.box.y<0||t.box.x+t.box.width>stage.width||t.box.y+t.box.height>stage.height);
 const uiCovered=visibleTexts.flatMap(t=>ui.filter(b=>hit(t.box,b)).map(b=>({id:t.id,key:t.key,text:t.text,box:t.box,ui:b})));
 return{state:window.__game.getState(),cards,texts,overlaps:cards.flatMap((a,i)=>cards.slice(i+1).filter(b=>hit(a,b)).map(b=>[a.id,b.id])),covered:texts.flatMap(t=>cards.filter(b=>b.id!==t.id&&hit(t.box,b)).map(b=>[t.id,t.key,b.id])),clippedTexts,uiCovered,oldOverlays:vs.filter(v=>['labelT','pile','retryG','lead','pulse','rejected','badge'].some(k=>v[k].visible)).map(v=>v.id),viewport:viewport,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,notes:vs.filter(v=>v.evidenceT.visible&&v.evidenceT.renderable).map(v=>({id:v.id,text:v.evidenceT.text})),wireWidths:[...new Set([...window.reviewEdges.views.values()].flatMap(v=>v.g.context.instructions.filter(i=>i.action==='stroke').map(i=>i.data.style.width)))]};
 });if(process.env.FIT_OUT)await p.screenshot({path:out+'/'+key+'.png'});save();console.log(key,'overlap',m.overlaps.length,'covered',m.covered.length,'clipped',m.clippedTexts.map(t=>t.text),'UI',m.uiCovered.map(t=>t.text));return{key,...m};}
async function load(p,kind){return p.evaluate(async kind=>{const prob=(await import('./content/problems/index.js')).problemById.get('url-shortener');let d=prob.editorial.designs[0];if(kind==='spike')d={name:'Reviewer three-server evening spike',graph:{nodes:[...prob.starter.nodes,{ref:'lb',type:'regional-lb',x:-220,y:0,units:10,tier:'XL'},...[-180,0,180].map((y,i)=>({ref:'api'+i,type:'vm-fleet',x:20,y,units:1,tier:'S'})),{ref:'cache',type:'cache',x:300,y:-140,units:24,tier:'XL'},{ref:'db',type:'sql-primary',x:300,y:140,units:24,tier:'XL'}],edges:[['users','lb'],['app','lb'],...['api0','api1','api2'].flatMap(a=>[['lb',a],[a,'cache']]),['cache','db']]}};window.review.loadDesign(d);window.__game.startTraffic();window.__game.pause();window.__game.step(kind==='spike'?(19*60+40)*60000:14*3600000);return window.__game.getState();},kind);}
try{
 for(const id of ['bank-ledger','video-upload-pipeline'])await test(`desktop ${id} Fit with inspector keeps cards separate`,async()=>{
 const p=await page();try{
 await p.evaluate(id=>window.__game.loadProblem(id),id);
 await p.evaluate(async id=>window.review.loadDesign((await import('./content/problems/index.js')).problemById.get(id).editorial.designs[0]),id);
 await fit(p);await inspect(p);await fit(p);const m=await capture(p,`regression-${id}`);log.scenes.push(m);save();assert.deepEqual(m.overlaps,[]);assert.deepEqual(m.clippedTexts,[]);
 }finally{await p.browserContext().close();}
 });
 await test('desktop insertion with the inspector open leaves all paper cards separate',async()=>{
  const p=await page();
  try{
   await p.evaluate(async()=>{window.review.loadDesign((await import('./content/problems/index.js')).problemById.get('url-shortener').editorial.designs[0]);const g=window.review.controller.state.sim.getGraph(),a=g.nodes.find(n=>n.type==='regional-lb'),b=g.nodes.find(n=>n.type==='vm-fleet'),e=g.edges.find(e=>e.from===a.id&&e.to===b.id);window.__game.placeComponent('api-gateway',(a.x+b.x)/2,(a.y+b.y)/2,e.id,{select:false});});await fit(p);await inspect(p);await fit(p);const m=await capture(p,'regression-insertion');log.insertions.push(m);save();assert.deepEqual(m.overlaps,[]);
  }finally{await p.browserContext().close();}
 });
 for(const kind of ['reference','spike'])await test(`phone ${kind} Fit leaves every visible card and name complete`,async()=>{
  const p=await page(390);
  try{
   await load(p,kind);await fit(p);const m=await capture(p,'regression-phone-'+kind);log.scenes.push(m);save();assert.deepEqual(m.clippedTexts,[]);
   const hit=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
   assert.deepEqual(m.cards.filter(c=>hit(c,m.viewport)&&(c.x<0||c.y<0||c.x+c.width>m.viewport.width||c.y+c.height>m.viewport.height)),[],'visible cards fully inside canvas');
  }finally{await p.browserContext().close();}
 });
 assert.deepEqual(log.errors,[],'no console or page errors');
}finally{save();await browser.close();await site.close();}
