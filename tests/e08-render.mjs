// Exercise the actual SVG textures and live node layer in Chrome, including every catalog part.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import puppeteer from 'puppeteer-core';
import { serveGame } from './browser-server.js';
const site=await serveGame();
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
try {
  await test('all 99 e08 glyphs render and every live state resets correctly',async()=>{
    const page=await browser.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    const failed=[];page.on('response',r=>{if(r.status()>=400)failed.push(r.url());});
    await page.goto(site.base+'#/settings');
    const result=await page.evaluate(async()=>{
      const {loadPixi}=await import('./ui/shell/playhost.js');await loadPixi();
      const {loadCatalog}=await import('./sim/catalog.js');const catalog=await loadCatalog();
      const {createKit}=await import('./render/textures.js');
      const {createNodeLayer,makeMini,refreshMini}=await import('./render/nodes.js');
      const {e08Palette}=await import('./render/e08.js');
      const {resolvePalette}=await import('./render/theme.js');
      const palette=e08Palette({...resolvePalette(),card:0xfaf1dc,ink:0x231f19});
      const kit=await createKit(PIXI,palette,catalog,1);
      const parent=new PIXI.Container();
      const layer=createNodeLayer(PIXI,parent,{kit:()=>kit,element:type=>catalog.elementById.get(type),shapeOf:()=> 'rounded-square',reduced:()=>true,zoom:()=>1,regionShort:()=>''});
      try {
        layer.sync({nodes:catalog.elements.map((el,i)=>({id:el.id,type:el.id,x:(i%11)*200,y:Math.floor(i/11)*180,units:3})),edges:[]});
        const views=[...layer.views.values()];
        const missing=views.filter(v=>v.icon.texture===PIXI.Texture.EMPTY||v.icon.texture.width===0).map(v=>v.id);
        const unique=new Set(views.map(v=>v.icon.texture.uid)).size;
        const v=layer.views.get('vm-fleet'),states=[];
        for(let status=0;status<=4;status++){
          layer.setLive(v,true,status===4?0:status===3?1.4:.6,status,0,0,-1,status===3?41:0);
          layer.update(16,performance.now(),0);
          layer.setLive(v,true,status===4?0:status===3?1.4:.6,status,0,0,-1,status===3?41:0);
          states.push({status,body:v.body.texture.uid,mark:v.statusG.visible,bar:v.busy.visible,icon:v.icon.visible,rejected:v.rejected.visible,count:v.rejectedT.text,tint:v.icon.tint});
        }
        layer.setLive(v,false);layer.update(16,performance.now(),0);
        const reset={body:v.body.texture.uid,rejected:v.rejected.visible,tint:v.icon.tint};
        for (const item of views) layer.setLive(item,true,.5,0);
        layer.update(16,performance.now(),0);
        const hiddenGlyphs=views.filter(item=>!item.icon.visible).map(item=>item.id);
        const mini=makeMini(PIXI,kit,{element:t=>catalog.elementById.get(t),shapeOf:()=> 'rounded-square'},'vm-fleet');
        const miniTint=mini.__icon.tint;mini.__icon.tint=0;refreshMini(kit,mini);
        const refreshedTint=mini.__icon.tint;mini.destroy({children:true});
        const bodyPixels=Object.fromEntries(Object.entries(kit.bodyStates).map(([cat,textures])=>[cat,textures.map(t=>{
          const c=t.source.resource,px=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
          let card=0,grey=0;
          for(let i=0;i<px.length;i+=4)if(px[i+3]===255){
            if(px[i]===250&&px[i+1]===241&&px[i+2]===220)card++;
            if(px[i]===226&&px[i+1]===229&&px[i+2]===233)grey++;
          }
          return {card,grey};
        })]));
        const source=kit.atlas.textures[0].source.resource;
        const ctx=source.getContext('2d');
        const traffic=kit.atlas.textures.map(t=>{
          const f=t.frame,data=ctx.getImageData(f.x,f.y,f.width,f.height).data;
          return {inside:f.y+f.height<=source.height,pixels:Array.from(data).filter((_,i)=>i%4===3&&data[i]>0).length};
        });
        return {bodyPixels,miniTint,refreshedTint,count:views.length,unique,missing,hiddenGlyphs,states,reset,traffic};
      } finally {layer.destroy();parent.destroy();kit.destroy();}
    });
    assert.deepEqual(result.hiddenGlyphs,[]);assert.equal(result.count,99);assert.equal(result.unique,99);assert.deepEqual(result.missing,[]);
    assert.equal(new Set(result.states.map(s=>s.body)).size,5);
    for(const s of result.states){assert(s.mark&&s.bar&&s.icon,'load, glyph and status stay visible at overview zoom');assert.equal(s.rejected,s.status===3);}
    assert.equal(result.states[3].count,'41/s');assert.equal(result.states[4].tint,0x55514a);
    assert.equal(result.reset.body,result.states[0].body);assert.equal(result.reset.rejected,false);assert.equal(result.reset.tint,0x231f19);
    for(const [cat,states] of Object.entries(result.bodyPixels))for(let status=0;status<5;status++){
      assert((status===4?states[status].grey:states[status].card)>500,`${cat} state ${status} must use its light body fill`);
    }
    assert.equal(result.miniTint,0x231f19,'small/ghost glyph uses site ink');
    assert.equal(result.refreshedTint,0x231f19,'refreshed small/ghost glyph uses site ink');
    assert.equal(result.traffic.length,19);assert(result.traffic.every(t=>t.inside&&t.pixels>0),'all traffic kinds fit in the atlas');
    assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);await page.close();
  });
} finally {await browser.close();await site.close();}
