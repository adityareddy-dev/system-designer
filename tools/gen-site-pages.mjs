// Builds the readable site and crawler files from authoritative game content, without a development build.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { groups, problems } from '../content/problems/index.js';
import { lessons, lessonById } from '../content/lessons/index.js';
import { createCatalog } from '../sim/catalog.js';
import { dailyFor } from '../compete/daily.js';
import { API_LIVE } from '../account/config.js';
import { SITE, REPO, navigation, esc, para, link, relative, json, page, bodyShell, breadcrumb, textOf, themeHead } from './site-template.mjs';
import { problemBody, lessonBody, problemCards, relatedProblems, listLinks } from './site-content.mjs';
import { makeInterviewPages } from './site-interview.mjs';
import { homeFaqs, readingLinks } from '../content/site-reading.js';
import { replaceSeoTags, faqData, articleData } from './site-seo.mjs';
import { makeGuides } from './site-guides.mjs';
import { ARROW, heroHtml } from '../ui/shell/hero-markup.js';

const MANIFEST = 'tools/site-pages-manifest.json';
const HOME_HEAD = /  <!-- site:head:start -->[\s\S]*?<!-- site:head:end -->\n?/;
const HOME_BODY = /<!-- site:body:start -->[\s\S]*?<!-- site:body:end -->/;
const faqs = homeFaqs;
const beatScript = `(function(){function forward(){var h=location.hash||'';if(h.indexOf('#/beat/')===0)location.replace(new URL('../../',location.href).href+h);}addEventListener('hashchange',forward);forward();})();`;
const rootCrumb = ['Home','index.html'];
const collection = { '@type':'CollectionPage' };
export function buildSitePages(root = process.cwd(), {dailyDates = []} = {}) {
  const read = f=>fs.readFileSync(path.join(root,f),'utf8');
  const exists = f=>fs.existsSync(path.join(root,f));
  const catalog = createCatalog(Object.fromEntries(['elements','requests','events','world'].map(k=>[k,JSON.parse(read(`catalog/${k}.json`))])));
  const guides = makeGuides({problems,lessons,catalog,accountLive:API_LIVE});
  const interviews = makeInterviewPages({problems,catalog});
  const outputs = new Map();
  const previous = exists(MANIFEST) ? JSON.parse(read(MANIFEST)) : {};
  const manifest = {};
  const today = new Date().toISOString().slice(0,10);
  function add(file, html) {
    const sha = createHash('sha256').update(html).digest('hex');
    const lastmod = previous[file]?.sha === sha ? previous[file].lastmod : today;
    manifest[file] = { sha, lastmod };
    outputs.set(file,html.replaceAll('__SITE_LASTMOD__',lastmod));
  }
  const action = (file,route,label)=>`<a class="site-button" href="${relative(file,'index.html#/'+route)}">${esc(label)}</a>`;
  const image = (file,id)=>`<img src="${relative(file,`assets/scenes/${id}.svg`)}" width="240" height="180" alt="${esc(lessonById.get(id)?.summary || 'System design learning illustration')}">`;
  for (const p of problems) {
    const file = `p/${p.id}/index.html`;
    const description = `${p.brief} Practise this ${p.difficulty.toLowerCase()} system design problem for free with a Google or GitHub account.`;
    add(file,page(file,{
      title:p.title,metaTitle:p.title+': system design practice',description,
      kicker:`${p.difficulty} · ${groups.find(g=>g.id===p.group).title}`,
      crumbs:[rootCrumb,['Problems','problems/index.html'],[p.title,file]],
      preview:`p/${p.id}/preview.jpg`,script:beatScript,
      body:problemBody(p,catalog,problems,lessonById,file,action(file,'practice/'+p.id,'Play this problem'))+`<section><h2>Related guides</h2>${listLinks([
        ...(guides.some(g=>g.id===p.id+'-walkthrough') ? [[relative(file,`guides/${p.id}-walkthrough/index.html`),'Walk through this design']] : []),
        [relative(file,'guides/how-to-practise-system-design/index.html'),'Practise a design with predictions and measurements'],
        [relative(file,'guides/two-week-system-design-plan/index.html'),'Follow the two-week interview plan']
      ])}</section>`,
      data:[faqData((p.clarify || []).map(c=>[c.q,c.a])),{'@type':'LearningResource',learningResourceType:'Practice problem',educationalLevel:p.difficulty,description,teaches:p.concepts.map(id=>lessonById.get(id)?.title || id),about:groups.find(g=>g.id===p.group).title,isPartOf:{'@type':'WebApplication',name:'System Designer',url:SITE}}]
    }));
  }
  for (const l of lessons) {
    const file = `learn/${l.id}/index.html`;
    add(file,page(file,{
      title:l.title,metaTitle:l.title+': system design lesson',description:l.summary,
      kicker:`${l.track} · ${l.minutes} minutes`,image:image(file,l.id),
      crumbs:[rootCrumb,['Learn','learn/index.html'],[l.title,file]],
      preview:exists(`learn/${l.id}/preview.jpg`)?`learn/${l.id}/preview.jpg`:undefined,
      action:action(file,l.id==='intro'?'intro':'learn/'+l.id,'Open this lesson'),
      body:lessonBody(l,problems,file)+`<p>${link(relative(file,'learn/index.html'),'Continue through the lesson tracks')}</p>`,
      data:[{'@type':'LearningResource',learningResourceType:'Lesson',timeRequired:`PT${l.minutes}M`,description:l.summary,teaches:l.takeaway,isPartOf:{'@type':'Course',name:l.track,provider:{'@type':'Organization',name:'System Designer'}}}]
    }));
  }
  const pIndex = 'problems/index.html';
  add(pIndex,page(pIndex,{
    title:'System design practice problems',preview:'assets/share/problems.png',description:`${problems.length} free system design problems across ${groups.length} industries. Choose an industry and difficulty, read the requirements, then build and test your own design.`,
    crumbs:[rootCrumb,['Problems',pIndex]],data:[collection],
    body:`<nav class="site-toc" aria-label="Industries">${groups.map(g=>link('#'+g.id,g.title)).join('')}</nav>`+groups.map(g=>`<section id="${g.id}"><h2>${esc(g.title)}</h2>${para(g.blurb)}${['Easy','Medium','Hard'].map(d=>{
      const ps = g.problems.filter(p=>p.difficulty===d); return ps.length ? `<h3>${d}</h3>${problemCards(ps,pIndex).replaceAll('<h3>','<h4>').replaceAll('</h3>','</h4>')}`:'';
    }).join('')}</section>`).join('')
  }));
  const tracks = [...new Set(lessons.map(l=>l.track))];
  const lIndex = 'learn/index.html';
  add(lIndex,page(lIndex,{
    title:'Learn system design, one idea at a time',preview:'assets/share/learn.png',description:`${lessons.length} free lessons, from requests and caching to consistency, data storage and leading a design discussion. Follow the tracks or choose one idea.`,
    crumbs:[rootCrumb,['Learn',lIndex]],data:[collection],
    body:`<nav class="site-toc" aria-label="Lesson tracks">${tracks.map((t,i)=>link('#track-'+i,t)).join('')}</nav>`+tracks.map((t,i)=>`<section id="track-${i}"><h2>${esc(t)}</h2><ul class="site-grid">${lessons.filter(l=>l.track===t).map(l=>`<li><span class="site-tag">${l.minutes} minutes</span><h3>${link(relative(lIndex,`learn/${l.id}/index.html`),l.title)}</h3>${para(l.summary)}</li>`).join('')}</ul></section>`).join('')
  }));
  const gIndex = 'guides/index.html';
  add(gIndex,page(gIndex,{
    title:'System design guides',preview:'assets/share/guides.png',description:'Build a practice habit, follow a two-week plan and learn classic systems through requirements, estimates, trade-offs and failures.',
    crumbs:[rootCrumb,['Guides',gIndex]],data:[collection],
    body:`<ul class="site-grid">${guides.map(g=>`<li><span class="site-tag">By System Designer</span><h2>${link(relative(gIndex,g.file),g.title)}</h2>${para(g.description)}</li>`).join('')}</ul>`
  }));
  for (const g of guides) add(g.file,page(g.file,{
    title:g.title,description:g.description,article:true,preview:'assets/share/guides.png',kicker:'A System Designer guide',
    crumbs:[rootCrumb,['Guides',gIndex],[g.title,g.file]],
    body:`<div class="site-prose site-cols"><p class="site-byline">By System Designer · <time datetime="2026-11-07">7 November 2026</time></p>${g.body}<h2>Keep practising</h2>${listLinks(guides.filter(q=>q!==g).slice(0,3).map(q=>[relative(g.file,q.file),q.title]))}</div>`,
    data:[articleData(g)]
  }));
  for (const entry of interviews) add(entry.file,page(entry.file,{
    title:entry.title,description:entry.description,preview:'assets/share/interview.png',
    kicker:'System design interview preparation',
    crumbs:[rootCrumb,['Problems',pIndex],[entry.title,entry.file]],
    action:action(entry.file,'practice/'+entry.problemId,'Play the matching problem'),
    body:entry.body,
    data:[{'@type':'LearningResource',learningResourceType:'Interview preparation',description:entry.description},...(entry.faqs ? [faqData(entry.faqs)] : [])]
  }));
  const dates = [...new Set([...dailyDates,...(exists('d')?fs.readdirSync(path.join(root,'d')).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&exists(`d/${d}/index.html`)):[])])].sort();
  for (const date of dates) {
    const daily = dailyFor(date,problems);
    const p = problems.find(p=>p.id===daily.problemId);
    const file = `d/${date}/index.html`;
    add(file,page(file,{
      title:`${p.title}: daily challenge, ${date}`,metaTitle:`Daily ${date}: ${p.title}`,description:`The shared System Designer challenge for ${date}: ${p.title}. Build a design and test the same seeded traffic day as everyone else. Free with a Google or GitHub account.`,
      crumbs:[rootCrumb,['Daily challenge, '+date,file]],preview:`d/${date}/preview.jpg`,
      action:action(file,'challenge/'+date,'Open the challenge'),
      body:`<div class="site-prose">${para(p.brief)}<p>The daily scenario changes the event schedule and pressure. ${link(relative(file,`p/${p.id}/index.html`),'Read the base problem')} for its requirements and concepts, then open this date’s challenge to see the daily variant.</p><section><h2>Related guides</h2>${listLinks([[relative(file,'guides/how-to-practise-system-design/index.html'),'Practise with predictions and measurements'],[relative(file,'guides/two-week-system-design-plan/index.html'),'Follow the two-week interview plan']])}</section></div><section><h2>Related problems</h2>${problemCards(relatedProblems(p,problems),file)}</section>`,
      script:beatScript,
      data:[{'@type':'LearningResource',learningResourceType:'Daily challenge',educationalLevel:p.difficulty}]
    }));
  }
  const homeOpts = {
    title:'System design practice game',description:`A free browser game for learning system design. Practise ${problems.length} problems across ${groups.length} industries, study ${lessons.length} lessons and see how your architecture handles spikes, outages and retries.`,
    metaDescription:`Practise system design with ${problems.length} problems and ${lessons.length} lessons. Build an architecture, test traffic spikes and outages, then learn from the results. Free to play.`,
    crumbs:[rootCrumb],action:action('index.html','intro','Build your first system'),
    body:`<section><h2>Learn by making a design work</h2>${para('Clarify the brief, estimate the scale and connect the parts. Fast-forward through a traffic day, then use the plain-words debrief to compare reliability, speed, data safety and monthly cost. Playing on this site needs a free Google or GitHub account. Rather run it yourself? The code is open source (MIT) and runs with no account.')}<p>${link('problems/','Browse the practice problems')}, ${link('learn/','read the lessons')} or ${link('guides/','follow a guide')} before you play.</p></section><section><h2>System design interview preparation</h2>${listLinks(readingLinks.slice(3))}</section><section><h2>Start here</h2>${listLinks([['learn/intro/','Your first system'],['p/url-shortener/','URL shortener practice'],['guides/how-to-practise-system-design/','How to practise system design'],['guides/two-week-system-design-plan/','A two-week interview plan']])}</section><section><h2>Common questions</h2>${faqs.map(([q,a])=>`<h3>${esc(q)}</h3>${para(a)}`).join('')}</section>`
  };
  const homeData = {'@context':'https://schema.org','@graph':[
    {'@type':'WebSite','@id':SITE+'#website',name:'System Designer',url:SITE,potentialAction:{'@type':'SearchAction',target:{'@type':'EntryPoint',urlTemplate:SITE+'#/practice?q={search_term_string}'},'query-input':'required name=search_term_string'}},
    {'@type':'SoftwareApplication','@id':SITE+'#app',name:'System Designer',url:SITE,description:homeOpts.description,applicationCategory:'EducationalApplication',operatingSystem:'Any modern browser',browserRequirements:'JavaScript is required to play; lessons and guides can be read without it.',isAccessibleForFree:true,offers:{'@type':'Offer',price:'0',priceCurrency:'USD'}},
    {'@type':'LearningResource',name:'System Designer learning library',url:SITE,learningResourceType:'Interactive system design practice',isAccessibleForFree:true,educationalLevel:'Beginner to advanced',hasPart:[{ '@type':'CollectionPage',url:SITE+'problems/'},{'@type':'CollectionPage',url:SITE+'learn/'},{'@type':'CollectionPage',url:SITE+'guides/'}]},
    breadcrumb([rootCrumb]),faqData(faqs)
  ]};
  const headBlock = `  <!-- site:head:start -->\n  <link rel="stylesheet" href="assets/site.css">\n  <!-- site:head:end -->\n`;
  const earlyTheme = html => html.replace(/<!-- theme:start -->[\s\S]*?<!-- theme:end -->|<script src="assets\/theme.js"><\/script>/, () => themeHead);
  let home = earlyTheme(read('index.html'));
  home = HOME_HEAD.test(home) ? home.replace(HOME_HEAD,()=>headBlock) : home.replace('  <meta name="theme-color"',headBlock+'  <meta name="theme-color"');
  // The first screen is the game's own hero (same markup as ui/shell/home.js), inside the same frame the game draws, so the game
  // takes over without a change. The readable page (description, links, questions) follows it for readers without scripts and for search.
  const hero = heroHtml({ ctaHtml: `<a class="sh-btn sh-btn--primary sh-btn--lg" href="./#/signin">Sign in to play, free${ARROW}</a>`, note: 'Playing here needs a free Google or GitHub account.', gated: true, moving: true });
  const readable = `<div class="site site-below"><div class="site-prose"><p class="site-lead">${esc(homeOpts.description)}</p>${homeOpts.body}</div><footer class="site-footer"><p>System Designer · Free system design practice in your browser. Open source under the MIT License.</p><nav aria-label="Footer">${link('problems/','All problems')} ${link('learn/','All lessons')} ${link('guides/','Guides')} ${link('privacy.html','Privacy')} ${link(REPO,'Source on GitHub')}</nav></footer></div>`;
  const homeBlock = `<!-- site:body:start -->\n<div id="app"><div class="sh-shell" data-immersive="0" data-nav="0">${navigation('index.html').replace('<script src="assets/header.js"></script>','<script src="assets/header.js" defer></script>')}<main id="content" class="sh-main" tabindex="-1"><div class="sh-view sh-view--still"><div class="sh-page sh-home-page">${hero}${readable}</div></div></main></div></div>\n  <div id="overlay"></div>\n  <noscript><p class="site site-note">JavaScript is needed to play. Read the <a href="problems/">problems</a>, <a href="learn/">lessons</a> and <a href="guides/">guides</a> without it.</p></noscript>\n<!-- site:body:end -->`;
  home = HOME_BODY.test(home) ? home.replace(HOME_BODY,()=>homeBlock) : home.replace(/  <div id="app">[\s\S]*?<\/noscript>/,()=>homeBlock);
  home = replaceSeoTags(home,'index.html',homeOpts,homeData);
  add('index.html',home);
  let privacy = earlyTheme(read('privacy.html'));
  privacy = privacy.replace(/<!-- site:privacy:start -->[\s\S]*?<!-- site:privacy:end -->/, '');
  privacy = replaceSeoTags(privacy,'privacy.html',{title:'Privacy',description:'What System Designer stores when you sign in, and how to delete it.'},{'@context':'https://schema.org',...breadcrumb([rootCrumb,['Privacy','privacy.html']])});
  privacy = privacy.replace(/<!-- site:header:start -->[\s\S]*?<!-- site:header:end -->/,()=>`<!-- site:header:start -->\n  ${navigation('privacy.html')}\n  <!-- site:header:end -->`);
  add('privacy.html',privacy);
  let notFound = earlyTheme(read('404.html'));
  notFound = notFound.replace(/<!-- site:header:start -->[\s\S]*?<!-- site:header:end -->/,()=>`<!-- site:header:start -->\n${navigation('404.html',{absolute:true})}\n<!-- site:header:end -->`);
  notFound = replaceSeoTags(notFound,'404.html',{title:'Page not found',description:'This page could not be found. Browse System Designer problems, lessons and guides, or open the game.'},{'@context':'https://schema.org','@type':'WebPage',name:'Page not found',url:SITE+'404.html'});
  outputs.set('404.html', notFound);
  outputs.set('assets/site.css',read('assets/palette.css')+'\n'+read('assets/header.css')+'\n'+read('tools/site-styles.css'));
  const publicFiles = Object.keys(manifest).sort();
  outputs.set('sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${publicFiles.map(f=>`  <url><loc>${SITE+f.replace(/index\.html$/,'')}</loc><lastmod>${manifest[f].lastmod}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  const crawlers = ['*','GPTBot','OAI-SearchBot','ChatGPT-User','ClaudeBot','Claude-SearchBot','Claude-User','PerplexityBot','Perplexity-User','Google-Extended','Googlebot','bingbot','Applebot-Extended','Amazonbot','cohere-ai'];
  outputs.set('robots.txt',`# Public reading pages and game assets are open to crawlers.\n${crawlers.map(c=>`User-agent: ${c}\nAllow: /\n`).join('\n')}\nSitemap: ${SITE}sitemap.xml\n`);
  const entries = (items,url,desc)=>items.map(item=>`- [${item.title}](${SITE+url(item)}): ${textOf(desc(item))}`).join('\n');
  const llms = `# System Designer\n\n> A free browser game for learning and practising system design, with ${problems.length} problems, ${lessons.length} lessons and a simulated traffic day.\n\nFor backend engineers, students and interview candidates. Clarify requirements, estimate scale, draw a system and test spikes, outages and retries. Compare reliability, speed, data safety and monthly cost. Playing on systemdesigner.io needs a free Google or GitHub account, and the problems, lessons and guides can be read without one. The code is open source (MIT) and runs with no account. Figures are teaching approximations. Traffic measurements and protocol correctness checks are distinct.\n\n## Start here\n\n- [Home](${SITE}): What the game is and common questions.\n- [Problems](${SITE}problems/): Every scenario grouped by industry and difficulty.\n- [Lessons](${SITE}learn/): Every lesson in track order.\n- [Guides](${SITE}guides/): Practice advice, a day-by-day plan and classic walkthroughs.\n\n## Interview preparation\n\n${entries(interviews,g=>'interview/'+g.id+'/',g=>g.description)}\n\n## Guides\n\n${entries(guides,g=>'guides/'+g.id+'/',g=>g.description)}\n\n## Problems\n\n${entries(problems,p=>'p/'+p.id+'/',p=>p.difficulty+'. '+p.brief)}\n\n## Lessons\n\n${entries(lessons,l=>'learn/'+l.id+'/',l=>l.track+'. '+l.summary)}\n\n## Optional\n\n- [Full text](${SITE}llms-full.txt): Full guides and a compact catalogue of every problem and lesson.\n- [Sitemap](${SITE}sitemap.xml): Canonical pages and last modification dates.\n- [Privacy](${SITE}privacy.html): Sign-in, stored progress and data deletion.\n`;
  outputs.set('llms.txt',llms);
  outputs.set('llms-full.txt',`# System Designer\n\n${textOf(homeOpts.description)}\n\n## Interview preparation\n\n${interviews.map(g=>`# ${g.title}\n${SITE}interview/${g.id}/\n\n${textOf(g.body)}`).join('\n\n')}\n\n## Full guides\n\n${guides.map(g=>`# ${g.title}\n\nBy System Designer\n${SITE}guides/${g.id}/\n\n${g.description}\n\n${textOf(g.body)}`).join('\n\n')}\n\n## Problem catalogue\n\n${problems.map(p=>`### ${p.title}\n${SITE}p/${p.id}/\n${p.difficulty}; ${groups.find(g=>g.id===p.group).title}.\n${p.brief}\nAudience: ${p.requirements.users}; normal peak ≈ ${(p.requirements.peakRps*(p.traffic.curve==='drop'?.1:1)).toLocaleString('en-US')} requests/s; budget ≈ $${p.requirements.budgetPerMonth.toLocaleString('en-US')}/month.\nConcepts: ${p.concepts.map(id=>lessonById.get(id)?.title || id).join(', ')}.`).join('\n\n')}\n\n## Lesson catalogue\n\n${lessons.map(l=>`### ${l.title}\n${SITE}learn/${l.id}/\n${l.track}; ${l.minutes} minutes. ${l.summary}\nKey point: ${l.takeaway}`).join('\n\n')}\n`);
  outputs.set(MANIFEST,JSON.stringify(Object.fromEntries(Object.entries(manifest).sort(([a],[b])=>a.localeCompare(b))),null,2)+'\n');
  return outputs;
}
export function writeSitePages(root=process.cwd(),options={}) {
  const outputs = buildSitePages(root,options);
  for (const [file,body] of outputs) {
    const target=path.join(root,file);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    if (!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==body) fs.writeFileSync(target,body);
  }
  return outputs;
}
if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.includes('--check')) {
    const first=buildSitePages(),second=buildSitePages();
    const stale=[...first].filter(([f,body])=>!fs.existsSync(f)||fs.readFileSync(f,'utf8')!==body).map(([f])=>f);
    if (JSON.stringify([...first])!==JSON.stringify([...second])) throw Error('Site generator is not deterministic');
    if (stale.length) throw Error('Regenerate site pages: '+stale.join(', '));
    console.log('PASS generated site matches content and is deterministic');
  } else {
    const output=writeSitePages();
    console.log(`Wrote ${[...output.keys()].filter(f=>f.endsWith('.html')).length} readable pages, crawler files and shared styles.`);
  }
}
