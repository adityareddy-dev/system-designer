import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { lessons } from '../content/lessons/index.js';
import { transferFor } from '../content/transfers.js';

const base = process.argv[2] || 'http://localhost:8765/';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('hotpath.v1.seenIntro','true');
    localStorage.setItem('hotpath.v1.settings',JSON.stringify({soundMuted:true,reducedMotion:'reduce'}));
    // Existing progress must survive completion of the new tracks.
    localStorage.setItem('staff-progress-sentinel','old progress survives');
  });
  for (const [width,theme] of [[1280,'light'],[1280,'dark'],[390,'light'],[390,'dark']]) {
    await page.setViewport({width,height:900,isMobile:width<500,hasTouch:width<500});
    for (const lesson of lessons.slice(-17)) {
      await page.goto(base+'#/learn/'+lesson.id, {waitUntil:'domcontentloaded'});
      await page.waitForSelector('.sh-lp-card');
      assert.equal(await page.$eval('html',el=>el.dataset.motion),'reduce');
      await page.evaluate(theme => { document.documentElement.dataset.theme=theme; },theme);
      if (process.env.QA_SHOTS && ['consistent-hashing','leader-consensus','metrics-systems','device-sync','lead-interview','running-migrations'].includes(lesson.id)) {
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'));
        fs.mkdirSync(process.env.QA_SHOTS,{recursive:true});
        await page.screenshot({path:`${process.env.QA_SHOTS}/${lesson.id}-${width}-${theme}-art.png`,fullPage:true});
      }
      for (const [i,step] of lesson.steps.entries()) {
        await page.waitForFunction(i => (new URLSearchParams(location.hash.split('?')[1]).get('step') || '0') === String(i),{},i);
        if (step.kind === 'quiz') {
          await page.evaluate(text => [...document.querySelectorAll('.sh-choice')].find(b => b.textContent.endsWith(text)).click(),step.choices[step.answer]);
          assert.equal(await page.$eval('.sh-quiz-result',el=>el.dataset.ok),'1');
        } else if (step.kind === 'defend') {
          assert(await page.$eval('button[type=submit]',b=>b.disabled));
          await page.type('textarea','I would state the invariant, estimate the work and test the failure before changing ownership.');
          await page.click('button[type=submit]');
          assert.equal(await page.$eval('.sh-defend-comparison',el=>el.hidden),false);
          await page.click('.sh-defend-point');
          assert(await page.$eval('input[type=checkbox]',el=>el.checked));
          if (process.env.QA_SHOTS && i === 5) {
            fs.mkdirSync(process.env.QA_SHOTS,{recursive:true});
            await page.screenshot({path:`${process.env.QA_SHOTS}/${lesson.id}-${width}-${theme}.png`,fullPage:true});
          }
        }
        assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),lesson.id+' fits '+width);
        // Center the control above the phone's fixed navigation before a pointer click.
        await page.$eval('.sh-lp-nav .sh-btn--primary',el=>el.scrollIntoView({block:'center',behavior:'instant'}));
        assert(await page.$eval('.sh-lp-nav .sh-btn--primary',el=>{
          const box=el.getBoundingClientRect();
          return el.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));
        }),lesson.id+' continue is reachable at '+width);
        await page.click('.sh-lp-nav .sh-btn--primary');
      }
      const transfer=transferFor(lesson.id);
      await page.waitForSelector('.sh-choices');
      await page.evaluate(index=>document.querySelectorAll('.sh-choice')[index].click(),transfer.answer);
      await page.type('input[type=number]',String(transfer.value));
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('.sh-lp-nav .sh-btn--primary')?.disabled === false);
      await page.focus('.sh-lp-nav .sh-btn--primary');
      await page.keyboard.press('Enter');
      await page.waitForSelector('.sh-lp-done');
      assert.match(await page.$eval('.sh-lp-done',el=>el.textContent),new RegExp(lesson.takeaway.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
      console.log('PLAY',width,lesson.id);
    }
  }
  assert.equal(await page.evaluate(()=>localStorage.getItem('staff-progress-sentinel')),'old progress survives');
  assert.deepEqual(errors,[]);
  console.log('All 17 new lessons completed on desktop and phone in both themes, including defenses and transfers.');
} finally { await browser.close(); }
