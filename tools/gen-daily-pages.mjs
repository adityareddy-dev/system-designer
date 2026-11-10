// Extends daily pages and reuses the shared preview renderer for problems, days and lessons.
// Run: node tools/gen-daily-pages.mjs [--from YYYY-MM-DD] [--days 120] [--no-images]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { problems } from '../content/problems/index.js';
import { lessons } from '../content/lessons/index.js';
import { dailyFor, addDays, todayLocal } from '../compete/daily.js';
import { previewHtml } from './site-preview.mjs';
import { writeSitePages } from './gen-site-pages.mjs';

const arg = (k,d)=>{const i=process.argv.indexOf('--'+k);return i<0?d:process.argv[i+1];};
const root=process.cwd();
const from=arg('from',process.env.DAILY_FROM || addDays(todayLocal(),-3));
const days=Number(arg('days',120));
const dates=Array.from({length:days},(_,i)=>addDays(from,i));
writeSitePages(root,{dailyDates:dates});
const dailyDates=fs.readdirSync(path.join(root,'d')).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&fs.existsSync(path.join(root,'d',d,'index.html'))).sort();
const rows=[
  ...problems.map(p=>({kind:'practice',id:p.id,title:p.title,like:p.like,difficulty:p.difficulty})),
  ...lessons.map(l=>({kind:'lesson',id:l.id,title:l.title,track:l.track,minutes:l.minutes})),
  ...dailyDates.map(date=>{const p=problems.find(p=>p.id===dailyFor(date,problems).problemId);return {kind:'daily',date,title:p.title,like:p.like,difficulty:p.difficulty};})
];
const dirOf=r=>path.join(root,r.kind==='practice'?'p':r.kind==='lesson'?'learn':'d',r.id || r.date);
const keyOf=r=>path.relative(root,dirOf(r)).replaceAll(path.sep,'/');
const manifestFile=path.join(root,'tools/site-previews-manifest.json');
const old=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8')):{};
const manifest={};
const hash=r=>createHash('sha256').update(previewHtml(r)).digest('hex');
// The renderer and text are fingerprinted independently of each page's article content.
const redraw=rows.filter(r=>!fs.existsSync(path.join(dirOf(r),'preview.jpg'))||(old[keyOf(r)]!=null&&old[keyOf(r)]!==hash(r)));
for (const r of rows) if (!redraw.includes(r)) manifest[keyOf(r)]=hash(r);
if (!process.argv.includes('--no-images') && redraw.length) {
  const pp=(await import(process.env.PUPPETEER_CORE?pathToFileURL(process.env.PUPPETEER_CORE).href:'puppeteer-core')).default;
  const browser=await pp.launch({executablePath:process.env.CHROME || process.env.CHROME_PATH || '/usr/bin/google-chrome',headless:'new',args:['--no-sandbox']});
  try {
    const pg=await browser.newPage();
    await pg.setViewport({width:1200,height:630,deviceScaleFactor:1});
    for (const r of redraw) {
      await pg.setContent(previewHtml(r),{waitUntil:'load'});
      await pg.screenshot({path:path.join(dirOf(r),'preview.jpg'),type:'jpeg',quality:84});
      manifest[keyOf(r)]=hash(r);
    }
    fs.writeFileSync(manifestFile,JSON.stringify(Object.fromEntries(Object.entries(manifest).sort(([a],[b])=>a.localeCompare(b))),null,2)+'\n');
  } finally {await browser.close();}
}
// Newly created lesson previews can now be advertised; the text generator itself never needs a browser.
writeSitePages(root);
console.log(`${dailyDates.length} daily, ${problems.length} problem and ${lessons.length} lesson pages; ${process.argv.includes('--no-images')?'images skipped':redraw.length+' previews drawn'}`);
