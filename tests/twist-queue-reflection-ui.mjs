// A failed queue twist carries measured waiting evidence into a visible, focused reflection.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { problemById } from '../content/problems/index.js';
const graph=structuredClone(problemById.get('job-scheduler').editorial.designs[0].graph);
graph.nodes.find(n=>n.type==='worker-pool').units=1;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
 for(const width of [1366,390]) {
  const page=await browser.newPage(); await page.setViewport({width,height:844,isMobile:width===390,hasTouch:width===390});
  await page.evaluateOnNewDocument(graph=>{localStorage.setItem('hotpath.v1.seenIntro','true');localStorage.setItem('hotpath.v1.settings',JSON.stringify({soundMuted:true,reducedMotion:'reduce'}));localStorage.setItem('hotpath.v1.draft.practice.job-scheduler',JSON.stringify({graph}));},graph);
  await page.goto((process.argv[2]||'http://localhost:8765/')+'#/practice/job-scheduler'); await page.waitForFunction(()=>window.__game?.getState().nodes.length===13);
  await page.evaluate(()=>{__game.startTraffic();__game.step(86400000);}); await page.waitForSelector('.pl-debrief');
  await page.$$eval('button',bs=>bs.find(b=>b.textContent==='New twist').click());
  await page.evaluate(()=>{__game.startTraffic();__game.step(86400000);}); await page.waitForSelector('.pl-transfer-reflection');
  assert.match(await page.$eval('.pl-transfer-reflection',e=>e.textContent),/Waiting evidence.*waiting deadline/s);
  assert.match(await page.$eval('.pl-transfer-reflection label',e=>e.textContent),/reserve.*waiting deadline/);
  assert(await page.$eval('.pl-transfer-reflection h2',e=>e===document.activeElement&&e.checkVisibility()),'reflection focus lands on the visible heading');
  assert.match(await page.$eval('.pl-run-evidence',e=>e.textContent),/wait|deadline/);
  await page.close();
 }
 console.log('Failed queue twists show measured waiting deadlines and focus the visible reflection on both sizes.');
} finally {await browser.close();}
