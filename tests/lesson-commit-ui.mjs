// Prediction first, sizing and hints second, including direct links and return navigation.
import { commitChoicePrediction } from './lesson-prediction.js';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
import { lessons } from '../content/lessons/index.js';
const site=await serveGame();
const base=site.base;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--no-sandbox']});
try{
 const page=await browser.newPage();
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
 await page.evaluateOnNewDocument(()=>{localStorage.setItem('hotpath.v1.seenIntro','true');localStorage.setItem('lesson-estimate-sentinel','keep');});
 for(const lesson of lessons.filter(l=>l.id!=='intro'))for(const [i,s]of lesson.steps.entries())if(s.kind==='demo'){
  // Reload to test the first visit rather than an in-memory prediction.
  await page.goto(base+`#/learn/${lesson.id}?step=${i}`,{waitUntil:'domcontentloaded'});await page.reload({waitUntil:'networkidle0'});
  await page.waitForSelector('.sh-estimate-form');
  const before=await page.evaluate(()=>({stage:document.querySelector('.sh-demo-stage').getClientRects().length,workbenches:document.querySelectorAll('.sh-play-host').length,hints:[...document.querySelectorAll('.sh-lp-nav button')].filter(b=>b.innerText==='Hint'&&b.getClientRects().length).length,advice:/About \d+ servers for the peak/.test(document.body.innerText)}));
  assert.deepEqual(before,{stage:0,workbenches:0,hints:0,advice:false},lesson.id+' waits to mount the workbench until commitment');
  assert(await page.$eval('[data-demo-instructions]',e=>!e.getClientRects().length),'worked instructions wait for a prediction');
  assert(await page.$eval('[data-prediction-brief]',e=>e.innerText.trim().length>25),'the prediction has workload facts');
  assert(await page.$eval('[data-prediction-brief]',e=>e.scrollHeight<=e.clientHeight+1),'all workload facts fit without a nested scroll');
  const input=await page.$('.sh-estimate-form input,.sh-estimate-form textarea');
  await input.type(s.estimate?'9':'I expect the downstream limit to dominate. I would measure queue age and useful completions before adding capacity.');
  await page.click('.sh-estimate-form button[type=submit]');
  assert(await page.$eval('.sh-demo-stage',e=>e.getClientRects().length>0));
  await page.waitForFunction(()=>window.__game.getState().mode==='lesson'&&window.__game.getState().view?.zoom>0);
  assert.equal(await page.$$eval('.sh-play-host',els=>els.length),1,'commit mounts one workbench');
  assert(await page.$eval('.sh-estimate-form',e=>e.getClientRects().length===0));
  assert(await page.$eval('[data-demo-instructions]',e=>e.getClientRects().length>0));
  assert.match(await page.$eval('.sh-estimate-receipt',e=>e.innerText),s.estimate?/9 servers/:/downstream limit/);
  assert(await page.$eval('.sh-lp-hint',e=>e.getClientRects().length===0),'hint still needs its own request');
 }
 await page.setViewport({width:1366,height:800});
 await page.goto(base+'#/learn/load-balancing?step=1',{waitUntil:'networkidle0'});
 const formWidth=await page.$eval('.sh-estimate-form',el=>({form:el.getBoundingClientRect().width,card:el.parentElement.getBoundingClientRect().width}));
 assert(Math.abs(formWidth.form-formWidth.card)<2,'the prediction form spans both desktop columns');
 await page.type('.sh-estimate-form textarea','I expect the server pool to saturate before the database.');
 await page.click('.sh-estimate-form button[type=submit]');
 await page.waitForFunction(()=>!!document.querySelector('.sh-play-host canvas'));
 const layout=await page.evaluate(()=>{
  const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
  return {stage:rect('.sh-demo-stage'),pool:rect('.sh-allocation'),receipt:rect('.sh-estimate-receipt'),nav:rect('.sh-lp-nav')};
 });
 assert(Math.abs(layout.stage.top-layout.pool.top)<2,'pool and canvas share the same row');
 assert(layout.pool.left>=layout.stage.right,'the pool sits beside the canvas');
 assert(layout.receipt.bottom<=layout.stage.top,'the receipt precedes the demo');
 assert(layout.nav.top>=Math.max(layout.stage.bottom,layout.pool.bottom),'navigation follows the demo');
 assert(layout.nav.top-Math.max(layout.stage.bottom,layout.pool.bottom)<20,'navigation has no extra pool row');
 await page.click('.sh-lp-nav button:first-child');
 await page.waitForSelector('.sh-lp-card:not(.sh-lp-card--demo)');
 await page.evaluate(()=>history.back());
 await page.waitForSelector('.sh-play-host canvas');
 assert(await page.$eval('.sh-estimate-form',el=>el.hidden),'returning to a committed demo mounts it immediately');
 const hooked=await page.evaluate(()=>window.__game.loadLesson('caching'));
 assert.equal(hooked.mode,'lesson','the explicit testing hook still opens a workbench');
 assert(await page.$eval('.sh-estimate-receipt',el=>el.hidden),'testing never invents a learner prediction');
 const n=lessons.find(l=>l.id==='back-of-envelope');
 await page.goto(base+`#/learn/${n.id}?step=${n.steps.length}`,{waitUntil:'networkidle0'});
 await page.waitForSelector('.sh-quiz-result');
 assert(!await page.$eval('.sh-quiz-result',e=>e.innerText));
 await commitChoicePrediction(page);
 const choices=await page.$$('.sh-choice');await choices[2].click();
 await page.type('input[type=number]','5.7');await page.click('form:not(.sh-prediction-form) button[type=submit]');
 assert(await page.$eval('.sh-lp-nav .sh-btn--primary',e=>e.disabled),'fractional relays do not finish a whole-relay transfer');
 await page.$eval('input[type=number]',e=>e.value='6');await page.click('form:not(.sh-prediction-form) button[type=submit]');
 assert.match(await page.$eval('.sh-quiz-result',e=>e.innerText),/Prediction checked/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('lesson-estimate-sentinel')),'keep');
 console.log('Every lesson demo collects a prediction before sizing or hints; bandwidth transfer passed.');
}finally{await browser.close();await site.close();}
