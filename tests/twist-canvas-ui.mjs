// The crowded-layout measurements and edit gate apply to twist days as well as Sandbox.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader']});
const base=process.argv[2]||'http://localhost:8765/';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try {
 for(const width of [1366,390]) for(const theme of ['light','dark']) {
  const page=await browser.newPage();
  await page.setViewport({width,height:width===390?844:900,isMobile:width===390,hasTouch:width===390});
  await page.evaluateOnNewDocument(theme=>{
   localStorage.setItem('hotpath.v1.seenIntro','true'); localStorage.setItem('hotpath.v1.settings',JSON.stringify({theme,soundMuted:true,reducedMotion:'reduce'}));
   const types=['web-browser','mobile-app','regional-lb','vm-fleet','cache','sql-primary','object-storage','queue','worker-pool','third-party-api','metrics','logs','alerting','backups','cdn'];
   const graph={nodes:types.map((type,i)=>({id:'n'+i,type,x:i%5*260,y:Math.floor(i/5)*240,units:3})),edges:[[0,14],[14,2],[1,2],[2,3],[3,4],[4,5],[3,6],[3,7],[7,8],[8,9],[10,3],[11,3],[12,10],[5,13]].map(([a,b])=>({from:'n'+a,to:'n'+b}))};
   localStorage.setItem('hotpath.v1.draft.practice.url-shortener',JSON.stringify({graph}));
  },theme);
  await page.goto(base+'#/practice/url-shortener');
  await page.waitForFunction(()=>!!window.__game);
  await page.evaluate(()=>__game.loadProblem('url-shortener'));
  const click=text=>page.evaluate(text=>{const b=[...document.querySelectorAll('button')].find(b=>b.checkVisibility()&&b.textContent.trim()===text);if(!b)throw Error(text);b.click();},text);
  await page.evaluate(()=>{__game.startTraffic();__game.step(86400000);}); await page.waitForSelector('.pl-debrief'); await click('New twist');
  await page.$eval('.pl-diagram-options summary',e=>e.click()); await click('Tidy request paths'); await sleep(500);
  const positions=()=>page.evaluate(()=>__game.getState().nodes.map(({id,x,y})=>({id,x,y})));
  const tidy=await positions(); await page.$eval('[aria-label="Undo (Ctrl+Z)"]',e=>e.click());
  assert.notDeepEqual(await positions(),tidy); await page.$eval('[aria-label="Redo (Ctrl+Shift+Z)"]',e=>e.click()); assert.deepEqual(await positions(),tidy);
  const measure=async()=>{
   const diagram=await page.evaluate(()=>__game.getState().view.diagram);
   for(const key of ['labelOverlaps','labelPartOverlaps','wirePartCrossings','wireLabelCrossings','labelPanelOverlaps']) assert.equal(diagram[key],0,`${width} ${theme} twist ${key}`);
  };
  await measure(); await page.evaluate(()=>{__game.setKnob('n3','units',1);__game.startTraffic();__game.pause();__game.step(120000);}); await sleep(300); await measure();
  await page.evaluate(()=>__game.step(86400000)); await page.waitForSelector('.pl-transfer-reflection');
  const before=await page.evaluate(()=>({nodes:__game.getState().nodes,view:__game.getState().view,overview:document.querySelector('.pl-overview').innerHTML}));
  await page.evaluate(()=>__game.reset()); await page.$$eval('.pl-diagram-options button',buttons=>buttons.find(b=>b.textContent==='Tidy request paths').click());
  await page.keyboard.down('Control'); await page.keyboard.press('z'); await page.keyboard.up('Control');
  const after=await page.evaluate(()=>({nodes:__game.getState().nodes,view:__game.getState().view,overview:document.querySelector('.pl-overview').innerHTML}));
  assert.deepEqual(after,before,'refused reset, tidy and undo preserve canvas, flow facts and overview');
  assert(await page.$eval('.pl-transfer-reflection',e=>e.checkVisibility())); await page.close();
 }
 console.log('15-part twist layouts have zero overlaps and wire crossings; refused reset, tidy and undo preserve canvas and overview.');
} finally {await browser.close();}
