// Prediction first, sizing and hints second, including direct links and return navigation.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { lessons } from '../content/lessons/index.js';
const base=process.argv[2]||'http://localhost:8765/';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--no-sandbox']});
try{
 const page=await browser.newPage();
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
 await page.evaluateOnNewDocument(()=>{localStorage.setItem('hotpath.v1.seenIntro','true');localStorage.setItem('lesson-estimate-sentinel','keep');});
 for(const lesson of lessons.filter(l=>l.id!=='intro'))for(const [i,s]of lesson.steps.entries())if(s.kind==='demo'){
  // Reload to test the first visit rather than an in-memory prediction.
  await page.goto(base+`#/learn/${lesson.id}?step=${i}`,{waitUntil:'domcontentloaded'});await page.reload({waitUntil:'networkidle0'});
  await page.waitForSelector('.sh-estimate-form');
  const before=await page.evaluate(()=>({stage:document.querySelector('.sh-demo-stage').getClientRects().length,hints:[...document.querySelectorAll('.sh-lp-nav button')].filter(b=>b.innerText==='Hint'&&b.getClientRects().length).length,advice:/About \d+ servers for the peak/.test(document.body.innerText)}));
  assert.deepEqual(before,{stage:0,hints:0,advice:false},lesson.id+' hides sizing and hints before commitment');
  assert(await page.$eval('[data-demo-instructions]',e=>!e.getClientRects().length),'worked instructions wait for a prediction');
  assert(await page.$eval('[data-prediction-brief]',e=>e.innerText.trim().length>25),'the prediction has workload facts');
  assert(await page.$eval('[data-prediction-brief]',e=>e.scrollHeight<=e.clientHeight+1),'all workload facts fit without a nested scroll');
  const input=await page.$('.sh-estimate-form input,.sh-estimate-form textarea');
  await input.type(s.estimate?'9':'I expect the downstream limit to dominate. I would measure queue age and useful completions before adding capacity.');
  await page.click('.sh-estimate-form button[type=submit]');
  assert(await page.$eval('.sh-demo-stage',e=>e.getClientRects().length>0));
  await page.waitForFunction(()=>window.__game.getState().mode==='lesson'&&window.__game.getState().view?.zoom>0.2);
  assert(await page.$eval('.sh-estimate-form',e=>e.getClientRects().length===0));
  assert(await page.$eval('[data-demo-instructions]',e=>e.getClientRects().length>0));
  assert.match(await page.$eval('.sh-estimate-receipt',e=>e.innerText),s.estimate?/9 servers/:/downstream limit/);
  assert(await page.$eval('.sh-lp-hint',e=>e.getClientRects().length===0),'hint still needs its own request');
 }
 const n=lessons.find(l=>l.id==='back-of-envelope');
 await page.goto(base+`#/learn/${n.id}?step=${n.steps.length}`,{waitUntil:'networkidle0'});
 await page.waitForSelector('.sh-quiz-result');
 assert(!await page.$eval('.sh-quiz-result',e=>e.innerText));
 const choices=await page.$$('.sh-choice');await choices[2].click();
 await page.type('input[type=number]','6');await page.click('button[type=submit]');
 assert.match(await page.$eval('.sh-quiz-result',e=>e.innerText),/Prediction checked/);
 assert.equal(await page.evaluate(()=>localStorage.getItem('lesson-estimate-sentinel')),'keep');
 console.log('Every lesson demo collects a prediction before sizing or hints; bandwidth transfer passed.');
}finally{await browser.close();}
