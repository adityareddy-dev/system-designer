// Computed claims reveal readable steps without blocking controls, with an immediate still version.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless:'new', args:['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.goto(process.argv[2] || 'http://localhost:8765/');
  for (const width of [1366,390]) for (const theme of ['light','dark']) for (const motion of ['full','reduce']) {
    await page.setViewport({width,height:844});
    const measured = await page.evaluate(async ({theme,motion}) => {
      const { mountDefense } = await import('./ui/defense.js');
      document.documentElement.dataset.theme=theme; document.documentElement.dataset.motion=motion;
      const host=document.createElement('section'); host.className='pl-defense-model';
      host.style.cssText='max-width:620px;margin:0 auto'; document.body.replaceChildren(host);
      mountDefense(host,{ model:'Compare failed work with the available capacity.',checklist:[],claims:[{id:'test',text:'Losing one unit of App servers (app) preserves service.'}] }, {answer:'I expect the remaining pool to receive more work.',revealed:true}, {id:'trace-test',checkClaim:()=>({held:false,steps:['Crash one unit of App servers (app).','Replay the full day: 99.12% served against 99.9%.','First material failure: capacity at App servers (app).','Claim failed in this counterexample.']})});
      const select=host.querySelector('.hp-defense-claims select'); select.value='hold'; select.dispatchEvent(new Event('change'));
      const check=host.querySelector('.hp-defense-claims input'); check.click();
      const li=host.querySelector('.pl-claim-trace li'), style=getComputedStyle(li);
      const steps=host.querySelectorAll('.pl-claim-trace li').length;
      const animation=style.animationName, font=parseFloat(style.fontSize);
      check.click(); const removed=!host.querySelector('.pl-claim-trace li');
      return {animation,font,steps,removed,overflow:document.documentElement.scrollWidth>innerWidth};
    },{theme,motion});
    assert.equal(measured.steps,4); assert(measured.font>=14); assert(measured.removed,'claim input stays usable during reveal'); assert(!measured.overflow);
    assert.equal(measured.animation==='none',motion==='reduce','trace follows the motion setting');
  }
  console.log('Claim steps wrap and animate in both themes and sizes, keep input usable, and render still under reduced motion.');
} finally { await browser.close(); }
