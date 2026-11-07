// Tidy gives the complete phone diagram room even when a tall inspector is open.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage(); await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
 await page.evaluateOnNewDocument(()=>{localStorage.setItem('hotpath.v1.seenIntro','true');localStorage.setItem('hotpath.v1.settings',JSON.stringify({soundMuted:true}));});
 await page.goto((process.argv[2]||'http://localhost:8765/')+'#/sandbox'); await page.waitForFunction(()=>window.__game?.getState().nodes.length===4);
 await page.evaluate(()=>{
  const types=['dns','cdn','waf','api-gateway','regional-lb','cache','queue','worker-pool','object-storage','metrics','email-provider'],ids={};
  types.forEach((type,i)=>ids[type]=__game.placeComponent(type,i%5*260,220+Math.floor(i/5)*240));
  __game.connect('app',ids.queue);__game.connect(ids.queue,ids['worker-pool']);__game.connect(ids['worker-pool'],ids['email-provider']);__game.connect('app',ids['object-storage']);__game.connect('app',ids.metrics);__game.connect(ids.cache,'db');
 });
 await page.$eval('.pl-diagram-options summary',e=>e.click());
 await page.$$eval('.pl-diagram-options button',buttons=>buttons.find(b=>b.textContent==='Tidy request paths').click());
 await new Promise(r=>setTimeout(r,900));
 const view=await page.evaluate(()=>__game.getState().view);
 for(const key of ['labelOverlaps','labelPartOverlaps','wirePartCrossings','wireLabelCrossings','labelPanelOverlaps']) assert.equal(view.diagram[key],0,key);
 assert(view.free.h-view.free.t-view.free.b>200,'tidy leaves a useful canvas height');
 console.log('Tidy folds the selected inspector and fits 15 parts without caption or wire collisions.');
} finally {await browser.close();}
