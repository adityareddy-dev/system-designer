// Browser regression checks for script-free reading, game entry, beat links and existing progress.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
const site = await serveGame();
import { createCatalog } from '../sim/catalog.js';
import { createSim } from '../sim/engine.js';
import { problemById } from '../content/problems/index.js';
import { encodeShare, scoreOf } from '../compete/share.js';

const BASE=site.base;
const catalog=createCatalog(Object.fromEntries(['elements','requests','events','world'].map(k=>[k,JSON.parse(fs.readFileSync(`catalog/${k}.json`,'utf8'))])));
const problem=problemById.get('url-shortener');
const sim=createSim({catalog,problem,seed:'practice',mode:'practice'});
sim.loadGraph(problem.editorial.designs[0].graph);sim.start();sim.advance(86400000);
const payload=await encodeShare({mode:'practice',problemId:problem.id,seed:'practice',graph:sim.getGraph(),score:scoreOf(sim.result()),name:'Reading check'},catalog);
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader']});
try {
  const pg=await browser.newPage();
  const errors=[];pg.on('pageerror',e=>errors.push(e.message));
  for (const width of [1366,390]) for (const theme of ['light','dark']) {
    await pg.setViewport({width,height:844,deviceScaleFactor:1});
    await pg.emulateMediaFeatures([{name:'prefers-color-scheme',value:theme}]);
    await pg.setJavaScriptEnabled(false);
    for (const route of ['', 'problems/','learn/','guides/','p/url-shortener/','learn/caching/','guides/two-week-system-design-plan/']) {
      const response=await pg.goto(BASE+route,{waitUntil:'load'});assert.equal(response.status(),200);
      const state=await pg.evaluate(()=>({text:document.body.innerText,width:document.documentElement.scrollWidth,h1:document.querySelector('h1')?.innerText}));
      assert.ok(state.text.length>400&&state.h1,route);assert.ok(state.width<=width,route+' overflows');
    }
  }
  await pg.setJavaScriptEnabled(true);
  await pg.setViewport({width:1366,height:900,deviceScaleFactor:1});
  await pg.evaluateOnNewDocument(()=>{
    localStorage.setItem('hotpath.v1.seenIntro','true');
    localStorage.setItem('hotpath.v1.settings',JSON.stringify({soundMuted:true,reducedMotion:'reduce'}));
    if (!localStorage.getItem('hotpath.v1.progress')) localStorage.setItem('hotpath.v1.progress',JSON.stringify({'chat-app':{attempts:3,bestScore:800,stars:1,solvedAt:'2026-11-01'}}));
  });
  await pg.goto(BASE+'p/url-shortener/',{waitUntil:'load'});
  assert.ok(pg.url().endsWith('p/url-shortener/'),'ordinary page stays readable');
  await pg.click('.site-button');
  await pg.waitForFunction(()=>window.__game?.getState().problemId==='url-shortener',{timeout:30000});
  await pg.evaluate(()=>window.__game.loadProblem('url-shortener'));
  // Build through the existing public hooks, starting with the problem's locked sources.
  const state=await pg.evaluate(graph=>{
    const g=window.__game; const start=g.getState(); const ids={};
    for(const node of graph.nodes) {
      const existing=start.nodes.find(n=>n.id===node.id);
      const id=existing?.id || g.placeComponent(node.type,node.x,node.y);
      ids[node.id]=id;
      for(const [key,value] of Object.entries({units:node.units,zones:node.zones,region:node.region,tier:node.tier,...node.knobs})) if(value!=null) {
        try {g.setKnob(id,key,value);} catch {}
      }
    }
    for(const edge of graph.edges) g.connect(ids[edge.from],ids[edge.to]);
    g.startTraffic();return g.step(86400000);
  },sim.getGraph());
  assert.equal(state.phase,'done');assert.ok(state.score);assert.deepEqual(state.errors,[]);
  assert.equal(state.score.total,sim.result().score.total,'page entry preserves deterministic play');
  const progress=await pg.evaluate(()=>JSON.parse(localStorage.getItem('hotpath.v1.progress')));
  assert.equal(progress['chat-app'].bestScore,800,'existing progress remains');
  await pg.goto(BASE+'p/url-shortener/',{waitUntil:'load'});
  await pg.evaluate(payload => location.hash = '#/beat/' + payload, payload);
  await pg.waitForFunction(() => document.body.innerText.includes('Reading check challenges you'));
  assert.equal(new URL(pg.url()).pathname, new URL(BASE).pathname, 'same-tab beat links enter the game');
  for(const route of ['p/url-shortener/','d/2026-11-07/']) {
    await pg.goto(BASE+route+'#/beat/'+payload,{waitUntil:'load'});
    await pg.waitForFunction(()=>document.body.innerText.includes('Reading check challenges you'),{timeout:30000});
    assert.equal(new URL(pg.url()).hash,'#/beat/'+payload,'share payload preserved');
    const text=await pg.evaluate(()=>document.body.innerText);
    assert.ok(text.includes('1000')&&text.includes('Score checked by replay'),'design arrives and its score is verified');
  }
  await pg.goto(BASE+'d/2026-11-07/',{waitUntil:'load'});
  await pg.waitForFunction(()=>location.hash==='#/challenge/2026-11-07',{timeout:30000});
  assert.deepEqual(errors,[]);
  console.log('PASS readable browser pages at both widths and themes; full scored day, saved progress, problem and daily beat links');
} finally {await browser.close(); await site.close();}
