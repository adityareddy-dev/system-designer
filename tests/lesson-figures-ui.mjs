// Open every figure stage in both themes and sizes; exercise native controls and motion lifecycle.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import {lessons} from '../content/lessons/index.js';
const base=process.argv[2]||'http://localhost:8765/';
const browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--no-sandbox']});
const stages=lessons.flatMap(l=>l.steps.flatMap((s,i)=>s.kind==='figure'?[{id:l.id,step:i,view:s.view}]:[]));
const errors=[];
const shots=process.env.FIGURE_SHOTS;
if(shots)fs.mkdirSync(shots,{recursive:true});
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.evaluateOnNewDocument(()=>{localStorage.setItem('hotpath.v1.seenIntro','true');localStorage.setItem('hotpath.v1.settings',JSON.stringify({soundMuted:true,reducedMotion:'full'}));localStorage.setItem('figure-progress-sentinel','keep');});
 const requests=[];page.on('request',r=>requests.push(r.url()));
 await page.goto(base+'#/learn',{waitUntil:'networkidle0'});assert(!requests.some(url=>/ui\/figures\//.test(url)),'figures are absent from the lesson list payload');
 for(const width of [1366,390])for(const theme of ['light','dark']){
  await page.setViewport({width,height:width===390?844:800,isMobile:width===390,hasTouch:width===390});
  for(const stage of stages){
   await page.goto(`${base}#/learn/${stage.id}?step=${stage.step}`,{waitUntil:'domcontentloaded'});
   await page.waitForSelector('.fg-bench');await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;document.documentElement.dataset.motion='full';},theme);await page.evaluate(()=>document.fonts.ready);
   await page.waitForFunction(()=>document.querySelector('.fg-bench').dataset.motion==='full');
   assert.equal(await page.$eval('.fg-bench',e=>e.dataset.figure),stage.id);
   const controls=await page.$$eval('.fg-controls [data-control]',es=>es.map(e=>({id:e.dataset.control,type:e.tagName==='SELECT'?'select':e.type})));
   for(const c of controls){
    const before=await page.$eval('.fg-bench',e=>e.dataset.revision);
    await page.evaluate(c=>{const el=document.querySelector(`[data-control="${c.id}"]`);if(c.type==='range'){el.value=el.max;el.dispatchEvent(new Event('input',{bubbles:true}));}else if(c.type==='checkbox')el.click();else if(c.type==='select'){el.selectedIndex=el.options.length-1;el.dispatchEvent(new Event('change',{bubbles:true}));}else el.click();},c);
    assert.notEqual(await page.$eval('.fg-bench',e=>e.dataset.revision),before,stage.id+' responds to '+c.id);
    assert(!/NaN|undefined|Infinity/.test(await page.$eval('.fg-bench',e=>e.textContent)),stage.id+' finite values');
   }
   await page.$eval('[data-control="reset"]',e=>e.scrollIntoView({block:'center',behavior:'instant'}));
   await page.click('[data-control="reset"]');
   // Known interaction sequences leave each instrument showing a concrete consequence.
   const examples={
    'consistent-hashing':stage.view==='migration'?[['snapshot'],['write'],['unsafe'],['staleWrite'],['diagnose']]:[['n',4]],
    'copies-quorums':[['r',1],['write'],['read']],
    'leader-consensus':[['kill'],['elect'],['stale']],
    'consistency-models':stage.view==='skew'?[['skew']]:[['write'],['readA']],
    'storage-engine':stage.view==='read'?[['read']]:[['write'],['key','b'],['write'],['flush'],['key','c'],['write'],['flush'],['compact']],
    'work-across-services':stage.view==='outbox'?[['step'],['crash'],['recover']]:[['step'],['step'],['step'],['compensate']],
    'ordering-time':stage.view==='counter'?[['a'],['a'],['b'],['merge']]:[['a'],['b'],['merge']],
    'device-sync':[['editA'],['editB'],['delete'],['sync']],
    'privacy-design':[['upload'],['breach']], 'metrics-systems':[['users',10],['ingest'],['block'],['query'],['query']],
    'logs-traces':stage.view==='sampling'?[['sample']]:[['search']], 'slos-error-budgets':[['minute',60]], 'multi-tenancy':[['run']],
    'lead-interview':[['scope'],['numbers'],['design']], 'running-migrations':[['next'],['next'],['write'],['next'],['verify']],
    'team-boundaries':[['versioned',true],['week'],['week']],
   };
   let actions=examples[stage.id];if(!actions){const first=controls.find(c=>c.type==='button'&&c.id!=='reset');actions=first?[[first.id]]:[[controls[0].id,controls[0].type==='range'?5:true]];}
   for(const [id,value]of actions)await page.evaluate(({id,value})=>{const e=document.querySelector(`[data-control="${id}"]`);if(e.tagName==='SELECT'){e.value=value;e.dispatchEvent(new Event('change'));}else if(e.type==='range'){e.value=value;e.dispatchEvent(new Event('input'));}else if(e.type==='checkbox'){if(e.checked!==value)e.click();}else e.click();},{id,value});
   await page.evaluate(()=>document.activeElement?.blur());
   await page.$eval('.fg-drawing',e=>e.scrollIntoView({block:'start',behavior:'instant'}));
   if(shots){await new Promise(r=>setTimeout(r,1050));await page.screenshot({path:`${shots}/${stage.id}-${stage.view}-${width}-${theme}.png`});}
   const layout=await page.evaluate(()=>{const svg=document.querySelector('.fg-drawing');const vb=svg.viewBox.baseVal;const overflow=[...svg.querySelectorAll('text')].filter(t=>{const b=t.getBBox();return b.x<0||b.x+b.width>vb.width+1||b.y<0||b.y+b.height>vb.height+1;}).map(t=>t.textContent);const texts=[...svg.querySelectorAll('text')];const overlaps=[];for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++){const a=texts[i].getBBox(),b=texts[j].getBBox();if(a.x<b.x+b.width-1&&a.x+a.width>b.x+1&&a.y<b.y+b.height-1&&a.y+a.height>b.y+1)overlaps.push([texts[i].textContent,texts[j].textContent]);}return {page:document.documentElement.scrollWidth>innerWidth+1,overflow,overlaps};});
   assert.deepEqual(layout,{page:false,overflow:[],overlaps:[]},stage.id+' drawing fits '+width);
   // Every figure has an immediately usable still path, including a keyboard-operated action.
   await page.evaluate(()=>document.documentElement.dataset.motion='reduce');
   await page.waitForFunction(()=>document.querySelector('.fg-bench').dataset.motion==='reduce');
   const control=await page.$('.fg-control:not([hidden]) button, .fg-controls > button');
   await control.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
   assert(await control.evaluate(e=>{const b=e.getBoundingClientRect();return e.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}),stage.id+' visible keyboard and touch control');
   await control.focus();await page.keyboard.press('Enter');
   assert.equal(await page.$eval('.fg-bench',e=>e.getAnimations({subtree:true}).filter(a=>a.playState==='running').length),0);
   assert(await page.$eval('.fg-motion',e=>e.disabled));
   console.log('FIGURE',width,theme,stage.id,stage.view);
  }
 }
 assert.equal(await page.evaluate(()=>localStorage.getItem('figure-progress-sentinel')),'keep');assert.deepEqual(errors,[]);
 console.log(`${stages.length} figure stages opened and operated in four layouts with a reduced-motion path.`);
}finally{await browser.close();}
