import assert from 'node:assert/strict';
import { test } from 'node:test';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';

const site = await serveGame();
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  for (const width of [1440, 390]) await test(`insertion and close saved parts leave paper bodies and text clear at ${width}px`, async () => {
    const page = await browser.newPage(), errors = [];
    await page.setViewport({ width, height: 1000 });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setRequestInterception(true);
    page.on('request', async r => {
      const url = new URL(r.url());
      if (url.pathname === '/ui/play/play.js' || url.pathname === '/render/nodes.js' || url.pathname === '/render/scene.js') {
        let body = await (await fetch(r.url())).text();
        body = body.replace('  return controller;', '  window.spacing={scene,controller,loadDesign}; return controller;')
          .replace('  return {\n    views,', '  return window.spacingNodes={\n    views,')
          .replace('app.renderer.render({ container: root, target: rt, clear: true });', `window.spacingSnapshot=inner.children.filter(m=>m.__body).map(m=>{const a=m.toGlobal({x:-116.25,y:-60.25}),b=m.toGlobal({x:122.25,y:64.25});return{x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y};});app.renderer.render({ container: root, target: rt, clear: true });`);
        return r.respond({ contentType: 'text/javascript', body });
      }
      r.continue();
    });
    try {
      await page.evaluateOnNewDocument(() => localStorage.setItem('hotpath.v1.settings', JSON.stringify({ soundMuted: true, reducedMotion: 'reduce' })));
      await page.goto(site.base + '#/practice/url-shortener');
      await page.waitForFunction(() => !!window.spacing);
      const result = await page.evaluate(async () => {
        const { problemById } = await import('./content/problems/index.js');
        const { scene, controller, loadDesign } = window.spacing;
        loadDesign(problemById.get('url-shortener').editorial.designs[0]);
        const g = controller.state.sim.getGraph(), lb = g.nodes.find(n => n.type === 'regional-lb'), app = g.nodes.find(n => n.type === 'vm-fleet');
        const edge = g.edges.find(e => e.from === lb.id && e.to === app.id);
        const inserted = window.__game.placeComponent('api-gateway', (lb.x + app.x) / 2, (lb.y + app.y) / 2, edge.id, { select: false });
        if (!inserted) throw new Error('insertion failed');
        const measure = () => {
          scene.fit(40, false); scene.renderNow(1000);
          const vs = [...window.spacingNodes.views.values()];
          const hit = (a,b) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
          const cards = vs.map(v => { const r=v.paperBox,a=v.c.toGlobal({x:r.x,y:r.y}),b=v.c.toGlobal({x:r.x+r.width,y:r.y+r.height}); return {id:v.id,x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y}; });
          const overlaps = cards.flatMap((a,i)=>cards.slice(i+1).filter(b=>hit(a,b)).map(b=>[a.id,b.id]));
          const covered = vs.flatMap(v => ['paperTitle','paperStatus','paperReading','paperWaiting'].filter(k=>v[k].visible&&v[k].renderable&&v[k].text).flatMap(k=>cards.filter(b=>b.id!==v.id&&hit(v[k].getBounds(),b)).map(b=>[v.id,k,b.id])));
          return {overlaps,covered};
        };
        const insertion = measure();
        const saved = {name:'Close saved design',graph:{nodes:[{ref:'a',type:'vm-fleet',x:0,y:0},{ref:'b',type:'vm-fleet',x:80,y:0},{ref:'c',type:'cache',x:0,y:80}],edges:[['a','b'],['a','c']]}};
        controller.state.sim.loadGraph(saved.graph);
        scene.sync(controller.state.sim.getGraph());
        const before=JSON.stringify(controller.state.sim.getGraph());
        const close=measure(), p=scene.worldToScreen(80,80), back=scene.screenToWorld(p.x,p.y);
        const unchanged=before===JSON.stringify(controller.state.sim.getGraph());
        return {insertion,close,back,unchanged};
      });
      assert.deepEqual(result.insertion.overlaps, [], 'inserted paper cards must not overlap');
      assert.deepEqual(result.insertion.covered, [], 'inserted cards must not cover text');
      assert.deepEqual(result.close.overlaps, [], 'close saved paper cards must not overlap');
      assert.deepEqual(result.close.covered, [], 'saved cards must not cover text');
      assert(Math.abs(result.back.x-80)<1e-8 && Math.abs(result.back.y-80)<1e-8, 'pointer coordinates round trip');
      assert(result.unchanged, 'display must leave simulation coordinates intact');
      // A real pointer drag must write model coordinates, including the old grid snap.
      const moved = await page.evaluate(() => {
        const {scene,controller}=window.spacing;
        scene.fit({l:40,t:120,r:40,b:180},false,{maxZ:.4});scene.renderNow(1000);
        const node=controller.state.sim.getGraph().nodes.find(n=>n.x===80&&n.y===0);
        const canvas=document.querySelector('.pl-stage canvas'),rect=canvas.getBoundingClientRect();
        const from=scene.worldToScreen(node.x,node.y),to=scene.worldToScreen(160,80);
        const send=(type,p)=>canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:42,pointerType:'mouse',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:rect.left+p.x,clientY:rect.top+p.y}));
        send('pointerdown',from);send('pointermove',to);send('pointerup',to);
        return controller.state.sim.getGraph().nodes.find(n=>n.id===node.id);
      });
      assert.equal(moved.x,160,'drag writes model x');assert.equal(moved.y,80,'drag writes model y');
      const dropped=await page.evaluate(()=>{
        const {scene,controller}=window.spacing, canvas=document.querySelector('.pl-stage canvas');
        const rect=canvas.getBoundingClientRect(), point=scene.worldToScreen(320,320), dataTransfer=new DataTransfer();
        dataTransfer.setData('application/x-sd-element','cache');
        const before=new Set(controller.state.sim.getGraph().nodes.map(n=>n.id));
        canvas.dispatchEvent(new DragEvent('drop',{bubbles:true,clientX:rect.left+point.x,clientY:rect.top+point.y,dataTransfer}));
        return controller.state.sim.getGraph().nodes.find(n=>!before.has(n.id));
      });
      assert(dropped,'dropping a toolbar part creates it');
      assert.equal(dropped.x,320,'drop writes model x');assert.equal(dropped.y,320,'drop writes model y');
      if (width === 390) {
        const map = await page.evaluate(() => {
          const {scene}=window.spacing;scene.panBy(24,-12);scene.renderNow(1000);
          const rect=document.querySelector('.pl-camera-window'), f=window.__game.getState().view.free;
          if(!rect)return null;
          const a=scene.screenToWorld(f.l,f.t),b=scene.screenToWorld(f.w-f.r,f.h-f.b);
          return {actual:['x','y','width','height'].map(k=>Number(rect.getAttribute(k))),expected:[a.x,a.y,b.x-a.x,b.y-a.y]};
        });
        assert(map,'phone selection keeps the minimap');
        map.actual.forEach((n,i)=>assert(Math.abs(n-map.expected[i])<1e-5,'minimap follows the mapped viewport after panning'));
      }
      const thumbnail=await page.evaluate(async()=>{
        await window.spacing.scene.snapshot({graph:window.spacing.controller.state.sim.getGraph()});
        const cards=window.spacingSnapshot,hit=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
        return cards.flatMap((a,i)=>cards.slice(i+1).filter(b=>hit(a,b)));
      });
      assert.deepEqual(thumbnail,[],'saved-result thumbnails keep paper cards apart');
      const classic=await page.evaluate(async()=>{
        const {scene,controller}=window.spacing;await scene.setLook('classic');scene.renderNow(1000);
        return [...window.spacingNodes.views.values()].every(v=>{const n=controller.state.sim.getGraph().nodes.find(n=>n.id===v.id);return v.x===n.x&&v.y===n.y;});
      });
      assert(classic,'switching back to classic restores original positions');
      assert.deepEqual(errors, []);
    } finally { await page.close(); }
  });
} finally { await browser.close(); await site.close(); }
