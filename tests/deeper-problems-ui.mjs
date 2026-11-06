import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { problemById } from '../content/problems/index.js';
import { checkFor } from '../ui/play/design-check.js';

const base=process.argv[2] || 'http://localhost:8765/';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try {
  const errors=[];
  for (const [width,theme] of [[1366,'light'],[390,'dark']]) {
    const context=await browser.createBrowserContext();
    const page=await context.newPage();
    page.on('pageerror',e=>errors.push(e.message));
    await page.evaluateOnNewDocument(origin=>{
      if (location.origin !== origin) return;
      localStorage.setItem('hotpath.v1.seenIntro','true');
      localStorage.setItem('hotpath.v1.settings',JSON.stringify({soundMuted:true,reducedMotion:true}));
    },new URL(base).origin);
    await page.setViewport({width,height:900,isMobile:width<500,hasTouch:width<500});
    for (const id of ['logs-platform','tracing-platform','tenant-metrics','device-notes','wearable-health']) {
      const p=problemById.get(id);
      // Each viewport uses a fresh context so saved attempts cannot skip the brief.
      await page.goto(base+'#/practice/'+id,{waitUntil:'load'});
      await page.waitForSelector('.pl-q');
      await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
      await page.evaluate(()=>document.querySelectorAll('.pl-q').forEach(b=>b.click()));
      assert.equal(await page.$$eval('.pl-q[aria-expanded=true]',es=>es.length),p.clarify.length);
      await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Continue to numbers').click());
      await page.waitForSelector('.pl-ninput');
      await page.evaluate(values=>{
        document.querySelectorAll('.pl-ninput').forEach((el,i)=>{el.value=values[i];el.dispatchEvent(new Event('input',{bubbles:true}));});
        [...document.querySelectorAll('button')].find(b=>b.textContent==='Check my guesses').click();
        [...document.querySelectorAll('button')].find(b=>b.textContent==='Start drawing').click();
      },p.numbers.filter(n=>n.ask).map(n=>String(n.value)));
      const built=await page.evaluate(graph=>{
        const game=window.__game;
        const state=game.getState();
        const ids=new Map(state.nodes.map(n=>[n.id,n.id]));
        for (const n of graph.nodes) {
          let id=ids.get(n.ref);
          if (!id) {id=game.placeComponent(n.type,n.x,n.y);ids.set(n.ref,id);}
          if (!id) throw Error('Cannot place '+n.ref);
          for (const key of ['units','zones','tier','region']) if(n[key]!=null)game.setKnob(id,key,n[key]);
          for (const [key,value] of Object.entries(n.knobs||{}))game.setKnob(id,key,value);
        }
        for (const [a,b] of graph.edges) if(!game.connect(ids.get(a),ids.get(b)))throw Error('Refused '+a+' to '+b);
        return game.getState();
      },p.editorial.designs[0].graph);
      assert.equal(built.nodes.length,p.editorial.designs[0].graph.nodes.length);
      assert.deepEqual(built.errors,[]);
      // Start through the visible keyboard path, then complete both independent checks.
      await page.evaluate(()=>{document.activeElement?.blur();document.body.focus();});
      await page.keyboard.press('Enter');
      await page.waitForSelector('.pl-design-check');
      assert.equal(await page.$$eval('.pl-design-check .sh-choice[aria-pressed=true]', es=>es.length), 0, 'Enter opens the check without choosing its first answer');
      const test=checkFor(p);
      await page.evaluate(({answer,value})=>{
        const form=document.querySelector('.pl-design-check');
        form.querySelectorAll('.sh-choice')[answer].click();
        form.querySelector('input').value=String(value);
        form.querySelector('textarea').value='The store needs failure headroom; the protocol checkpoint is separate from its traffic capacity.';
        form.requestSubmit();
      },{answer:test.answer,value:test.value});
      await page.waitForSelector('.pl-modal:not([hidden]) form select');
      await page.evaluate(choices=>{
        const form=[...document.querySelectorAll('.pl-modal:not([hidden]) form')].find(f=>f.querySelector('select'));
        form.querySelectorAll('select').forEach((el,i)=>{el.value=String(choices[i]);el.dispatchEvent(new Event('change',{bubbles:true}));});
        form.querySelector('input').value='Use stable identities, durable state and an explicit recovery policy across each failure boundary.';
        form.querySelector('input').dispatchEvent(new Event('input',{bubbles:true}));
        form.requestSubmit();
      },p.correctness.fields.map(f=>f.correct));
      const result=await page.evaluate(()=>window.__game.step(86400000));
      if (result.phase !== 'done') console.log('TRACE STATE', JSON.stringify(await page.evaluate(() => ({ header:document.querySelector('.sh-problem-h1')?.textContent, modal:document.querySelector('.pl-modal')?.textContent, fields:[...document.querySelectorAll('.pl-modal select')].map(s=>s.value), invalid:[...document.querySelectorAll('.pl-modal input')].map(e=>({value:e.value,error:e.validationMessage})),feedback:document.querySelector('.pl-modal [role=status]')?.textContent,phase:window.__game.getState().phase }))));
      assert.equal(result.phase,'done',id+' day finishes');
      assert(result.score.passed,id+' browser reference passes '+JSON.stringify(result.score));
      assert.deepEqual(result.errors,[]);
      await page.waitForSelector('.pl-overlay--debrief:not([hidden])');
      await page.waitForFunction(() => !document.querySelector('.pl-day-seal') && document.querySelector('.pl-overlay--debrief').getAnimations().every(a => a.playState !== 'running'));
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),id+' fits phone');
      if(process.env.QA_SHOTS){fs.mkdirSync(process.env.QA_SHOTS,{recursive:true});await page.screenshot({path:`${process.env.QA_SHOTS}/${id}-${width}.png`});}
      await page.evaluate(()=>[...document.querySelectorAll('.pl-overlay--debrief button')].find(b=>b.textContent.trim()==='Editorial').click());
      await page.waitForSelector('.pl-overlay--editorial:not([hidden]) .pl-ed-design');
      assert.match(await page.$eval('.pl-ed-design',el=>el.textContent),/Passes the day/);
      console.log('PLAY',width,id,result.score.total);
    }
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('All five Hard problems: clarify, numbers, build, prediction, correctness, full day and editorial on desktop/light and phone/dark passed.');
} finally {await browser.close();}
