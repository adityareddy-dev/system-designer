import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';
import puppeteer from 'puppeteer-core';
import {serveGame} from './browser-server.js';

const root=new URL('../',import.meta.url),site=await serveGame();
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const errors=[],sleep=ms=>new Promise(r=>setTimeout(r,ms));
try {
 for(const width of [1440,390])for(const id of ['bank-ledger','video-upload-pipeline','url-shortener'])await test(`${id} at ${width}: wheel, trackpad, touch and keyboard respect Fit separation`,async()=>{
  const context=await browser.createBrowserContext(),p=await context.newPage();
  try {
   await p.setViewport({width,height:1000,hasTouch:true,isMobile:width===390});
   p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
   await p.evaluateOnNewDocument(()=>{localStorage.setItem('hotpath.v1.seenIntro','true');localStorage.setItem('hotpath.v1.settings',JSON.stringify({soundMuted:true,reducedMotion:'reduce',quality:'high'}));});
   await p.setRequestInterception(true);p.on('request',r=>{
    const f=new URL(r.url()).pathname;
    if(['/ui/play/play.js','/render/nodes.js'].includes(f))return r.respond({contentType:'text/javascript',body:fs.readFileSync(new URL('.'+f,root),'utf8').replace('  return controller;','  window.review={scene,loadDesign}; return controller;').replace('  return {\n    views,','  return window.reviewNodes={\n    views,')});
    r.continue();
   });
   await p.goto(site.base+'#/practice/'+id);await p.waitForFunction(()=>!!window.review);await p.evaluate(()=>document.fonts.ready);
   await p.evaluate(async id=>window.review.loadDesign((await import('./content/problems/index.js')).problemById.get(id).editorial.designs[0]),id);await sleep(250);
   const results=[];
   for(const method of ['wheel','trackpad','touch','keyboard','wheel from above','eased wheel']) {
    await p.evaluate(()=>window.review.scene.setReducedMotion(true));
    await p.click('[aria-label="Fit to screen (F)"]');await sleep(450);
    const initial=await p.evaluate(()=>window.review.scene.stats().zoom);
    if(!['wheel','keyboard'].includes(method)){await p.evaluate(()=>window.review.scene.zoomBy(2));await sleep(200);}
    const point=await p.$eval('.pl-stage canvas',c=>{const b=c.getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2};});
    if(method==='keyboard'){await p.keyboard.press('+');await sleep(400);const enlarged=await p.evaluate(()=>window.review.scene.stats().zoom);results.push({method:'keyboard zoom in',initial,zoom:initial,overlaps:enlarged>initial+.001?[]:['keyboard did not zoom'],covered:[]});for(let i=0;i<25;i++)await p.keyboard.press('-');}
    else if(method==='touch')await p.evaluate(({x,y})=>{
     const c=document.querySelector('.pl-stage canvas');
     const send=(type,id,x)=>c.dispatchEvent(new PointerEvent(type,{pointerId:id,pointerType:'touch',clientX:x,clientY:y,bubbles:true,button:0}));
     send('pointerdown',1,x-100);send('pointerdown',2,x+100);send('pointermove',1,x-2);send('pointermove',2,x+2);send('pointerup',1,x-2);send('pointerup',2,x+2);
    },point);
    else {
     if(method==='eased wheel')await p.evaluate(()=>window.review.scene.setReducedMotion(false));
     await p.mouse.move(point.x,point.y);
     if(method==='trackpad')await p.evaluate(({x,y})=>document.querySelector('.pl-stage canvas').dispatchEvent(new WheelEvent('wheel',{clientX:x,clientY:y,deltaY:1600,ctrlKey:true,bubbles:true,cancelable:true})),point);
     else await p.mouse.wheel({deltaY:1600});
    }
    await sleep(850);
    const m=await p.evaluate(()=>{
     window.review.scene.renderNow(0);
     const hit=(a,b)=>a.x<b.x+b.width-.1&&a.x+a.width>b.x+.1&&a.y<b.y+b.height-.1&&a.y+a.height>b.y+.1;
     const vs=[...window.reviewNodes.views.values()];
     const cards=vs.map(v=>{const r=v.paperBox,a=v.c.toGlobal({x:r.x,y:r.y}),b=v.c.toGlobal({x:r.x+r.width,y:r.y+r.height});return{id:v.id,x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y};});
     return {zoom:window.review.scene.stats().zoom,overlaps:cards.flatMap((a,i)=>cards.slice(i+1).filter(b=>hit(a,b)).map(b=>[a.id,b.id])),uiCovered:vs.filter(v=>{if(!v.c.visible)return false;const b=v.paperTitle.getBounds(),a=window.__game.getState().view.free;return b.x<a.l||b.y<a.t||b.x+b.width>a.w-a.r||b.y+b.height>a.h-a.b||(a.blocks||[]).some(r=>hit(b,r));}).map(v=>v.id),covered:vs.flatMap(v=>cards.filter(c=>c.id!==v.id&&hit(v.paperTitle.getBounds(),c)).map(c=>[v.id,c.id]))};
    });
    console.log(id,width,method,JSON.stringify({initial,...m}));
    results.push({method,initial,...m});
   }
   assert.deepEqual(results.filter(m=>m.overlaps.length||m.covered.length||m.uiCovered?.length),[], 'every zoom input keeps cards and names separate');
   assert(results.every(m=>m.zoom<=m.initial+.001),'zoom out does not enlarge Fit');
  } finally {await context.close();}
 });
 assert.deepEqual(errors,[],'zero browser errors');
} finally {await browser.close();await site.close();}
