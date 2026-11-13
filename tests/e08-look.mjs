// The canvas look follows Practice's current problem, without changing the page theme.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';

const site = await serveGame();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  for (const [id, look] of [['url-shortener', 'paper'], ['chat-app', 'classic']]) {
    await test(`${id} uses ${look} canvas`, async () => {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      try {
        await page.goto(site.base + '#/practice/' + id);
        await page.waitForFunction(() => !!window.__game?.getState()?.problemId, { timeout: 30000 });
        assert.equal(await page.$eval('.pl-stage canvas', c => c.dataset.look), look);
        assert.equal(await page.$eval('html', el => el.dataset.theme), 'light');
        // Reusing the same Practice host must also change the look.
        const next = id === 'url-shortener' ? 'chat-app' : 'url-shortener';
        await page.evaluate(id => window.__game.loadProblem(id), next);
        await page.waitForFunction(expected => document.querySelector('.pl-stage canvas')?.dataset.look === expected, {}, look === 'paper' ? 'classic' : 'paper');
        assert.deepEqual(errors, []);
      } finally { await page.close(); }
    });
  }
} finally { await browser.close(); await site.close(); }

await test('URL shortener reference preview uses the same SVG parts', async () => {
  const site = await serveGame();
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(site.base);
    const result = await page.evaluate(async () => {
      const { designDiagram } = await import('./ui/play/editorial.js');
      const { loadCatalog } = await import('./sim/catalog.js');
      const { problemById } = await import('./content/problems/index.js');
      const p = problemById.get('url-shortener'), catalog = await loadCatalog();
      document.documentElement.style.setProperty('--card','#faeddb');
      document.documentElement.style.setProperty('--ink','#252016');
      const svg = designDiagram(p.editorial.designs[0],catalog,'e08');
      const other = designDiagram(problemById.get('chat-app').editorial.designs[0],catalog);
      await Promise.all([...svg.querySelectorAll('image')].map(img=>new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('preview image did not resolve site tokens')),5000);
        const poll=()=>{if(img.getAttribute('href')?.startsWith('data:')){clearTimeout(timer);resolve();}else setTimeout(poll,20);};poll();
      })));
      const sources=await Promise.all([...svg.querySelectorAll('image')].map(img=>fetch(img.getAttribute('href')).then(r=>r.text())));
      return { sources, look:svg.dataset.look, images:svg.querySelectorAll('image').length, nodes:p.editorial.designs[0].graph.nodes.length, classicImages:other.querySelectorAll('image').length };
    });
    assert.equal(result.look,'e08');
    for(let i=0;i<result.sources.length;i+=2){
      assert.match(result.sources[i],/fill="#faeddb"/,'reference body uses the site card');
      assert.match(result.sources[i+1],/color="#252016"/,'reference glyph uses site ink');
    }
    assert.equal(result.images,result.nodes*2);
    assert.equal(result.classicImages,0);
  } finally { await browser.close(); await site.close(); }
});

await test('a reused scene restores classic and discards stale look loads',async()=>{
  const site=await serveGame();
  const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
  try {
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(site.base+'#/settings');
    const result=await page.evaluate(async()=>{
      const {loadPixi}=await import('./ui/shell/playhost.js');await loadPixi();
      const {loadCatalog}=await import('./sim/catalog.js');
      const {createScene}=await import('./render/scene.js');
      const host=document.createElement('div');host.style.cssText='width:400px;height:300px';document.body.append(host);
      const scene=await createScene(host,{catalog:await loadCatalog(),look:'paper',reducedMotion:true});
      try {
        scene.sync({nodes:[{id:'app',type:'vm-fleet',x:0,y:0,units:3}],edges:[]});
        const looks=[host.querySelector('canvas').dataset.look];
        await scene.setLook('classic');looks.push(host.querySelector('canvas').dataset.look);
        await Promise.all([scene.setLook('e08'),scene.setLook('classic'),scene.setLook('paper')]);
        looks.push(host.querySelector('canvas').dataset.look);
        await scene.setLook('classic');looks.push(host.querySelector('canvas').dataset.look);
        scene.renderNow(0);return looks;
      } finally {scene.destroy();host.remove();}
    });
    assert.deepEqual(result,['paper','classic','paper','classic']);assert.deepEqual(errors,[]);
  } finally {await browser.close();await site.close();}
});
