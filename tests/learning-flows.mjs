// Browser regressions for saved sandbox workloads, attempt-gated hints and paths beyond the basics.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--no-sandbox','--enable-unsafe-swiftshader'] });
const base = process.argv[2] || 'http://localhost:8765/';
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.evaluateOnNewDocument(() => { localStorage.setItem('hotpath.v1.seenIntro','true'); localStorage.setItem('hotpath.v1.settings',JSON.stringify({soundMuted:true,reducedMotion:'reduce'})); });
  const click = text => page.evaluate(text => { const b=[...document.querySelectorAll('button')].find(b=>b.checkVisibility()&&b.textContent.trim()===text); assertButton(b,text); function assertButton(b,text) { if(!b)throw Error('Missing '+text); b.click(); } },text);
  const route = async hash => { await page.evaluate(hash=>{location.hash=hash;},hash); await page.waitForFunction(hash=>location.hash===hash,{},hash); };
  await page.goto(base+'#/sandbox');await page.waitForSelector('.pl-traffic');
  await page.evaluate(()=>{const g=window.__game;g.setKnob(g.getState().nodes.find(n=>n.type==='vm-fleet').id,'units',20);});
  await page.$eval('[aria-label="Read requests per second"]',el=>{el.value='51';el.dispatchEvent(new Event('input'));});
  await page.$eval('[aria-label="Traffic over the day"]',el=>{el.value='flat';el.dispatchEvent(new Event('change'));});
  await route('#/settings');await page.waitForSelector('.sh-page');
  await route('#/sandbox');await page.waitForSelector('.pl-traffic');
  assert.equal(await page.$eval('[aria-label="Traffic over the day"]',el=>el.value),'flat');
  assert.equal(await page.$eval('[aria-label="Read requests per second"]',el=>el.value),'51');
  assert.equal(await page.evaluate(()=>window.__game.getState().nodes.find(n=>n.type==='vm-fleet').units),20);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('hotpath.v1.draft.sandbox.sandbox')).traffic.peakRps),100100);
  await click('Slots');await page.waitForSelector('.sh-slots');
  await page.$eval('.sh-slot button',el=>el.click());
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('hotpath.v1.sandbox.slots'))[0].traffic.peakRps),100100);
  await click('Close');await route('#/practice/job-scheduler');await page.waitForFunction(()=>window.__game.getState().problemId==='job-scheduler');
  await page.evaluate(()=>window.__game.loadProblem('job-scheduler'));
  await page.keyboard.press('h');await page.waitForSelector('.pl-hints:not([hidden])');await click('Show hint 1');
  const first = await page.$eval('.pl-hints-list',el=>el.textContent);
  assert.match(first,/Run a day first/);assert.doesNotMatch(first,/Background workers|idempotency store|SQL database/);
  await page.click('[aria-label="Close hints"]');await page.evaluate(()=>{window.__game.startTraffic();window.__game.step(86400000);});
  await click('Hints');await page.waitForSelector('.pl-hints:not([hidden])');
  assert.equal(await page.$eval('.pl-hints-foot button',el=>el.disabled),false,'more specific hints open after trying');
  for(const hash of ['#/learn','#/']) {
    await route(hash);await page.waitForSelector('[aria-label="After the basics"]');
    const hrefs = await page.$$eval('[aria-label="After the basics"] a',es=>es.map(e=>e.getAttribute('href')));
    assert.deepEqual(hrefs,['#/learn/consistent-hashing','#/learn/lead-interview','#/practice?d=Medium','#/practice?d=Hard']);
  }
  assert.deepEqual(errors,[]);
  console.log('Learning flows: sandbox draft and slot workloads, delayed hints, and deeper-track navigation passed.');
} finally { await browser.close(); }
