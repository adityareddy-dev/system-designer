// Every embedded editor opens a readable palette without clipped names in both layouts and themes.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { lessons } from '../content/lessons/index.js';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage();
 await page.evaluateOnNewDocument(()=>{localStorage.setItem('hotpath.v1.seenIntro','true');localStorage.setItem('hotpath.v1.settings',JSON.stringify({soundMuted:true,reducedMotion:'reduce'}));});
 await page.goto(process.argv[2]||'http://localhost:8765/'); await page.waitForFunction(()=>!!window.__game);
 let count=0;
 for(const width of [1366,390]) for(const theme of ['light','dark']) {
  await page.setViewport({width,height:844,isMobile:width===390,hasTouch:width===390});
  await page.waitForFunction(()=>!!window.__game);
  await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  for(const lesson of lessons) for(const [step,spec] of lesson.steps.entries()) if(spec.kind==='demo') {
   await page.evaluate(({id,step})=>__game.loadLesson(id,step),{id:lesson.id,step});
   await page.$eval('.pl-tb-grab',b=>b.click());
   const measured=await page.$eval('.pl-toolbar',el=>({width:el.getBoundingClientRect().width,clipped:[...el.querySelectorAll('.pl-tb-name,.pl-tb-desc,.pl-tb-title')].filter(e=>e.checkVisibility()&&(e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1)).map(e=>e.textContent),close:el.querySelector('.pl-tb-grab').getBoundingClientRect().width}));
   assert(measured.width>=279,`${lesson.id} readable palette at ${width}`); assert(measured.close>=44); assert.deepEqual(measured.clipped,[],`${lesson.id} ${width} ${theme}`); count++;
  }
 }
 console.log(`${count} embedded palettes checked across both sizes and themes.`);
} finally {await browser.close();}
