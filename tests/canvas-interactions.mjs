// Canvas gestures and crowded layouts retain positions and readable, collision-free facts.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
const site=await serveGame();
const base=site.base;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader']});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const settle = async page => page.waitForFunction(async () => {
 const read = () => {
  const view = __game.getState().view;
  return { view, key: JSON.stringify([view.zoom, view.screen, view.diagram.parts, view.diagram.labels], (key, value) => typeof value === 'number' ? Math.round(value * 1000) / 1000 : value) };
 };
 const before = read();
 await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
 const after = read();
 return before.key === after.key && after.view.diagram.parts.every(part => {
  const target = after.view.screen.find(point => point.id === part.id);
  return Math.abs(part.x + part.width / 2 - target.x) < 1e-8 && Math.abs(part.y + part.height / 2 - target.y) < 1e-8;
 });
});
const types=['web-browser','mobile-app','regional-lb','vm-fleet','cache','sql-primary','object-storage','queue','worker-pool','third-party-api','metrics','logs','alerting','backups','cdn'];
const graph={nodes:types.map((type,i)=>({id:'n'+i,type,x:i%5*260,y:Math.floor(i/5)*240,units:3})),edges:[[0,14],[14,2],[1,2],[2,3],[3,4],[4,5],[3,6],[3,7],[7,8],[8,9],[10,3],[11,3],[12,10],[5,13]].map(([a,b])=>({id:`n${a}>n${b}`,from:'n'+a,to:'n'+b,kind:'flow'}))};
const crowded={nodes:['web-browser','mobile-app','vm-fleet','sql-primary','regional-lb','cache','queue','worker-pool','object-storage','search-index','metrics','logs','alerting','backups','cdn'].map((type,i)=>({id:'n'+i,type,x:i%5*260,y:Math.floor(i/5)*240,units:3})),edges:[[0,2],[1,2],[0,7],[5,2],[14,4],[4,2],[2,3],[2,8],[2,9],[2,6],[6,7],[7,3],[7,14],[3,13],[10,2,'observe'],[11,2,'observe'],[12,10,'observe']].map(([a,b,kind='flow'])=>({id:`n${a}>n${b}`,from:'n'+a,to:'n'+b,kind}))};
const errors=[];
try{
 for(const fixture of [graph,crowded])for(const width of [1366,390])for(const theme of ['light','dark'])for(const motion of ['full','reduce']){
  const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.stack));
  await p.setViewport({width,height:width===390?844:800,isMobile:width===390,hasTouch:width===390});
  await p.evaluateOnNewDocument((graph,theme,motion)=>{localStorage.setItem('hotpath.v1.seenIntro','true');localStorage.setItem('hotpath.v1.settings',JSON.stringify({theme,soundMuted:true,reducedMotion:motion}));localStorage.setItem('hotpath.v1.draft.sandbox.sandbox',JSON.stringify({graph,traffic:{rps:{read:7900000,write:100},curve:'flat',regions:{us:1}}}));},fixture,theme,motion);
  await p.goto(base+'#/sandbox');await p.waitForFunction(()=>window.__game?.getState().nodes.length===15);await sleep(700);
  const saved=await p.evaluate(()=>__game.getState().nodes.map(({id,x,y})=>({id,x,y})));
  assert.deepEqual(saved,fixture.nodes.map(({id,x,y})=>({id,x,y})),'entry preserves saved positions');
  await p.evaluate(()=>[...document.querySelectorAll('summary')].find(e=>e.textContent==='Diagram tools').click());
  await p.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent==='Tidy request paths').click());await sleep(800);
  const check=async()=>{await settle(p);const v=await p.evaluate(()=>__game.getState().view);assert(v.labelPx>=12.99);for(const key of ['labelOverlaps','labelPartOverlaps','wirePartCrossings','wireLabelCrossings','labelPanelOverlaps'])assert.equal(v.diagram[key],0,`${width} ${theme} ${key}`);};
  await check();
  const openingCamera=await p.evaluate(()=>{const v=__game.getState().view;return {zoom:v.zoom,screen:v.screen};});
  await p.evaluate(()=>{__game.startTraffic();__game.pause();__game.step(120000);});await sleep(700);await check();
  assert.deepEqual(await p.evaluate(()=>{const v=__game.getState().view;return {zoom:v.zoom,screen:v.screen};}),openingCamera,'starting traffic preserves the player camera');
  // while a day runs on a phone the speed buttons wrap onto their own row, so the bar is taller than when the design was fitted: fit again
  if(width===390){await p.click('[aria-label="Fit to screen (F)"]');await sleep(700);}
  assert(await p.evaluate(()=>__game.getState().view.diagram.labels.some(l=>l.text.startsWith('First limit'))),'paused overload identifies its first bottleneck');
  const before=await p.evaluate(()=>__game.getState().view.diagram.labels.filter(l=>l.kind==='failure').map(({id,x,y})=>({id,x,y})));
  await p.evaluate(()=>__game.step(120000));await check();
  const after=await p.evaluate(()=>__game.getState().view.diagram.labels.filter(l=>l.kind==='failure').map(({id,x,y})=>({id,x,y})));
  assert.deepEqual(after.map(v=>v.id),before.map(v=>v.id));
  for(let i=0;i<after.length;i++)for(const axis of ['x','y'])assert(Math.abs(after[i][axis]-before[i][axis])<.1,'changing failure counts do not move caption lanes');await p.close();
 }
 for(const touch of [false,true]){
  const p=await browser.newPage();await p.setViewport({width:touch?390:1366,height:touch?844:800,isMobile:touch,hasTouch:touch});
  await p.evaluateOnNewDocument(()=>{localStorage.clear();localStorage.setItem('hotpath.v1.seenIntro','true');localStorage.setItem('hotpath.v1.settings',JSON.stringify({soundMuted:true}));});
  await p.goto(base+'#/sandbox');await p.waitForFunction(()=>window.__game?.getState().nodes.length===4);await sleep(700);
  await p.evaluate(()=>__game.placeComponent('cache',520,260));await sleep(600);
  await p.$eval('.pl-tool--fit',b=>b.click());await settle(p);
  const data=await p.evaluate(()=>{const s=__game.getState(),r=document.querySelector('.pl-stage').getBoundingClientRect();return {s,r:{x:r.x,y:r.y}};});
  const app=data.s.nodes.find(n=>n.id==='app'),target=data.s.nodes.find(n=>n.type==='cache');
  const point=id=>{const n=data.s.view.screen.find(n=>n.id===id);return{x:n.x+data.r.x,y:n.y+data.r.y};};
  const face=data.s.view.diagram.parts.find(n=>n.id===app.id);
  const a=point(app.id),b=point(target.id),port={x:a.x+face.width/2+20,y:a.y};
  if(touch){const c=await p.createCDPSession();await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[port]});await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[b]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else {await p.mouse.move(port.x,port.y);await p.mouse.down();await p.mouse.move(b.x,b.y,{steps:12});await p.mouse.up();}
  await sleep(350);let state=await p.evaluate(()=>__game.getState());assert(state.edges.some(e=>e.from===app.id&&e.to===target.id),`dragging the visible ${touch?'touch':'mouse'} output port connects`);assert.equal(state.nodes.find(n=>n.id===app.id).x,app.x,'connecting never moves the source');
  if(touch){const c=await p.createCDPSession();await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x-50,y:a.y+45}]});await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  else {await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move(a.x-50,a.y+45,{steps:12});await p.mouse.up();}
  await sleep(350);state=await p.evaluate(()=>__game.getState());assert.notEqual(state.nodes.find(n=>n.id===app.id).x,app.x,'dragging the body moves the part');
  await p.evaluate(()=>__game.loadLesson('back-of-envelope',2));await p.waitForSelector('.pl-root[data-mode=lesson]');
  await p.$eval('.pl-tb-grab',b=>b.click());
  assert(await p.$eval('.pl-toolbar',e=>e.classList.contains('pl-toolbar--open')),'embedded palette opens');
  await p.$eval('.pl-tb-grab',b=>b.click());
  assert(await p.$eval('.pl-toolbar',e=>!e.classList.contains('pl-toolbar--open')&&e.classList.contains('pl-toolbar--folded')),'embedded palette closes again');
  await p.close();
 }
 const recovery=await browser.newPage();
 await recovery.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
 await recovery.evaluateOnNewDocument(()=>{
  localStorage.clear();localStorage.setItem('hotpath.v1.seenIntro','true');
  localStorage.setItem('hotpath.v1.settings',JSON.stringify({soundMuted:true}));
  const graph={nodes:[{id:'u',type:'web-browser',x:0,y:0},{id:'app',type:'vm-fleet',x:260,y:0,units:1},{id:'db',type:'sql-primary',x:520,y:0}],edges:[['u','app'],['app','db']]};
  localStorage.setItem('hotpath.v1.draft.sandbox.sandbox',JSON.stringify({graph,traffic:{rps:{read:30000},curve:'flat',regions:{us:1}}}));
 });
 await recovery.goto(base+'#/sandbox');await recovery.waitForFunction(()=>__game.getState().nodes.length===3);await sleep(500);
 await recovery.evaluate(()=>{__game.startTraffic();__game.pause();__game.step(60000);});await sleep(500);
 const first=()=>recovery.evaluate(()=>__game.getState().view.diagram.labels.find(l=>l.text.startsWith('First limit'))?.id);
 assert.equal(await first(),'app');
 await recovery.evaluate(()=>{__game.setKnob('app','units',100);__game.step(60000);});await sleep(1800);
 assert.equal(await first(),'db','fixing the first limit reveals the next bottleneck');await recovery.close();
 assert.deepEqual(errors,[]);console.log('Saved positions, 15-part tidy and overload collisions, stable failure lanes, mouse ports and bodies, and touch ports and bodies passed.');
}finally{await browser.close();await site.close();}
