// Checks the readable site, generated-content drift, links, metadata and share forwarding.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { problems } from '../content/problems/index.js';
import { lessons } from '../content/lessons/index.js';
import { createCatalog } from '../sim/catalog.js';
import { makeGuides } from '../tools/site-guides.mjs';

const root = path.resolve(process.argv[2] || '.');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const exists = f => fs.existsSync(path.join(root, f));
const catalog = createCatalog(Object.fromEntries(['elements','requests','events','world'].map(k=>[k,JSON.parse(read(`catalog/${k}.json`))])));
const changedLessons = lessons.map(l=>l.id!=='caching' ? l : {...l,steps:l.steps.map(s=>s.kind!=='demo'?s:{...s,goal:{...s.goal,maxTtlSec:123}})});
const changedGuide = makeGuides({problems,lessons:changedLessons,catalog,accountLive:true}).find(g=>g.id==='caching-load-balancing-queues');
assert.ok(changedGuide.body.includes('at most 123 seconds old'), 'guide freshness follows lesson content');
for (const p of problems) assert.ok(exists(`p/${p.id}/index.html`), p.id);
for (const l of lessons) assert.ok(exists(`learn/${l.id}/index.html`), l.id);
if (root === process.cwd()) execFileSync(process.execPath, ['tools/gen-site-pages.mjs', '--check'], { stdio: 'inherit' });
const sitemap = read('sitemap.xml');
const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
assert.equal(new Set(locations).size, locations.length, 'unique sitemap locations');
assert.equal([...sitemap.matchAll(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g)].length, locations.length);
const toFile = url => {
  const p = decodeURIComponent(new URL(url).pathname).replace(/^\//, '');
  return p.endsWith('/') || !p ? p + 'index.html' : p;
};
const titles = new Set();
const urls = new Set(locations);
for (const f of ['index.html', 'problems/index.html', 'learn/index.html', 'guides/index.html', ...problems.map(p=>`p/${p.id}/index.html`), ...lessons.map(l=>`learn/${l.id}/index.html`)]) {
  assert.ok(urls.has('https://systemdesigner.io/' + f.replace(/index\.html$/, '')), `missing from sitemap: ${f}`);
}
for (const url of locations) {
  assert.ok(url.startsWith('https://systemdesigner.io/'));
  const file = toFile(url);
  assert.ok(exists(file), `sitemap page exists: ${file}`);
  const html = read(file);
  const title = /<title>([^<]+)<\/title>/.exec(html)?.[1];
  assert.ok(title && !titles.has(title), `unique title: ${file}: ${title}`); titles.add(title);
  assert.match(html, /<meta name="description" content="[^"]+"/);
  assert.ok(html.includes(`<link rel="canonical" href="${url}">`), file);
  const data = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(m => {
    const parsed = JSON.parse(m[1]); return parsed['@graph'] || [parsed];
  });
  assert.ok(data.some(d=>d['@type']==='BreadcrumbList'), `breadcrumb: ${file}`);
  if (/^(p|learn)\/[^/]+\//.test(file)) assert.ok(data.some(d=>d['@type']==='LearningResource'), file);
  if (/^guides\/[^/]+\//.test(file)) assert.ok(data.some(d=>d['@type']==='Article' && d.author.name==='System Designer'), file);
  assert.doesNotMatch(html, /\u2014/, `no em dash: ${file}`);
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = new URL(m[1].replace(/&amp;/g, '&'), url);
    if (target.origin !== 'https://systemdesigner.io') continue;
    assert.ok(exists(toFile(target)), `${file} -> ${m[1]}`);
    if (target.hash && !target.hash.startsWith('#/')) {
      assert.ok(read(toFile(target)).includes(`id="${decodeURIComponent(target.hash.slice(1))}"`), `${file} -> ${m[1]} anchor`);
    }
  }
  if (file.startsWith('p/')) {
    assert.match(html, /Play this problem/);
    assert.doesNotMatch(html, /(?:main\.js|pixi\.js|http-equiv="refresh")/i);
    const js = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
    assert.ok(js.length < 600, 'tiny forwarding script');
    for (const hash of ['', '#requirements', '#/practice/url-shortener', '#/beat/jEncoded_design-123']) {
      let forwarded;
      const location = { hash, href: 'https://example.test/subpath/' + file.replace(/index.html$/, '') + hash, replace: to=>{forwarded=to;} };
      const listeners = {};
      vm.runInNewContext(js, { location, URL, addEventListener: (name, fn) => listeners[name] = fn });
      assert.equal(forwarded, hash.startsWith('#/beat/') ? 'https://example.test/subpath/' + hash : undefined, `forwarding ${file} ${hash}`);
      forwarded = undefined;
      location.hash = '#/beat/jSame_tab-456';
      location.href = 'https://example.test/subpath/' + file.replace(/index.html$/, '') + location.hash;
      listeners.hashchange?.();
      assert.equal(forwarded, 'https://example.test/subpath/#/beat/jSame_tab-456', `same-tab forwarding ${file}`);
    }
  }
}
for (const m of read('llms.txt').matchAll(/\]\((https:\/\/systemdesigner\.io\/[^)]*)\)/g)) assert.ok(exists(toFile(m[1])), `llms link: ${m[1]}`);
assert.ok(read('llms-full.txt').includes('How to practise system design'));
assert.match(read('robots.txt'), /User-agent: GPTBot\s+Allow: \//);
console.log(`PASS readable site: ${locations.length} pages, ${problems.length} problems, ${lessons.length} lessons; metadata, links, drift and beat forwards`);
