// Check the pages that readers and search engines receive.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { problems } from '../content/problems/index.js';

const root = path.resolve(process.argv[2] || '.');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const files = ['index.html', 'privacy.html', '404.html'];
function walk(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const file = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith('.html')) files.push(file);
  }
}
for (const dir of ['p', 'd', 'learn', 'guides', 'problems']) walk(dir);
if (fs.existsSync(path.join(root, 'interview'))) walk('interview');
const decode = value => value.replace(/&(amp|quot|#39|lt|gt);/g, (_, key) => ({ amp: '&', quot: '"', '#39': "'", lt: '<', gt: '>' }[key]));
const meta = (html, name) => decode(html.match(new RegExp(`<meta (?:name|property)="${name}" content="([^"]*)"`))?.[1] || '');
const sitemap = [...read('sitemap.xml').matchAll(/<url><loc>(.*?)<\/loc><lastmod>(.*?)<\/lastmod><\/url>/g)];
const urls = new Set(sitemap.map(m => m[1]));
const titles = new Set(), descriptions = new Set();
for (const file of files) {
  const html = read(file);
  const title = decode(html.match(/<title>([^<]*)<\/title>/)?.[1] || '');
  const description = meta(html, 'description');
  assert.ok(title.length > 0 && title.length < 60, `${file}: title has ${title.length} characters`);
  assert.ok(description.length > 0 && description.length < 155, `${file}: description has ${description.length} characters`);
  assert.ok(!titles.has(title), `${file}: duplicate title`);
  assert.ok(!descriptions.has(description), `${file}: duplicate description`);
  titles.add(title); descriptions.add(description);
  const url = 'https://systemdesigner.io/' + file.replace(/index\.html$/, '');
  assert.ok(html.includes(`<link rel="canonical" href="${url}">`), `${file}: canonical`);
  for (const [key, value] of [['og:title', title], ['og:description', description], ['og:url', url], ['twitter:title', title], ['twitter:description', description], ['twitter:card', 'summary_large_image']]) {
    assert.equal(meta(html, key), value, `${file}: ${key}`);
  }
  const image = meta(html, 'og:image');
  assert.equal(meta(html, 'twitter:image'), image, `${file}: share image`);
  const asset = fs.readFileSync(path.join(root, new URL(image).pathname));
  if (image.endsWith('.png')) {
    assert.equal(asset.toString('hex', 0, 8), '89504e470d0a1a0a');
    assert.deepEqual([asset.readUInt32BE(16), asset.readUInt32BE(20)], [1200, 630], file);
  } else {
    assert.match(image, /\.jpg$/);
    let dimensions;
    for (let at = 2; at < asset.length;) {
      assert.equal(asset[at++], 0xff, `${file}: JPEG marker`);
      const marker = asset[at++];
      const size = asset.readUInt16BE(at);
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        dimensions = [asset.readUInt16BE(at + 5), asset.readUInt16BE(at + 3)];
        break;
      }
      at += size;
    }
    assert.deepEqual(dimensions, [1200, 630], `${file}: real JPEG dimensions`);
  }
  assert.ok(meta(html, 'og:image:alt') && meta(html, 'twitter:image:alt'), `${file}: image text`);
  const graph = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(m => { const data = JSON.parse(m[1]); return data['@graph'] || [data]; });
  const visible = decode(html.split('</head>')[1].replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  for (const question of graph.filter(d => d['@type'] === 'FAQPage').flatMap(d => d.mainEntity)) {
    assert.ok(visible.includes(question.name.replace(/\s+/g, ' ')), `${file}: visible FAQ question`);
    assert.ok(visible.includes(question.acceptedAnswer.text.replace(/\s+/g, ' ')), `${file}: visible FAQ answer`);
  }
  if (file !== '404.html') {
    assert.ok(urls.has(url), `${file}: sitemap`);
    assert.doesNotMatch(html, /<meta[^>]+(?:noindex|nofollow)/i, `${file}: indexable`);
    assert.ok(graph.some(d => d['@type'] === 'BreadcrumbList'), `${file}: breadcrumb`);
  } else {
    assert.ok(!urls.has(url));
    assert.equal(meta(html, 'robots'), 'noindex');
  }
  for (const crumb of graph.filter(d => d['@type'] === 'BreadcrumbList').flatMap(d => d.itemListElement)) {
    assert.ok(!crumb.item.endsWith('index.html'), `${file}: canonical breadcrumb`);
  }
  if (/^(p|d)\//.test(file)) {
    assert.match(html, /<h2>Related problems<\/h2>/);
    assert.match(html, /<h2>Related guides<\/h2>/);
  }
  if (/^p\//.test(file)) {
    assert.ok(graph.some(d => d['@type'] === 'FAQPage'), `${file}: real clarification questions`);
  }
  if (/^guides\/[^/]+\//.test(file)) {
    const article = graph.find(d => d['@type'] === 'Article');
    assert.ok(article && article.isAccessibleForFree === true, `${file}: free article`);
  }
  if (file === 'index.html') {
    assert.ok(graph.some(d => d['@type'] === 'WebSite' && d.potentialAction?.['@type'] === 'SearchAction'));
    assert.ok(graph.some(d => ['VideoGame', 'SoftwareApplication'].includes(d['@type'])));
  }
}
assert.equal(urls.size, files.length - 1, 'every public page exactly once');
assert.equal(sitemap.length, urls.size);
for (const [, , lastmod] of sitemap) assert.match(lastmod, /^\d{4}-\d{2}-\d{2}$/);
assert.doesNotMatch(read('robots.txt'), /Disallow:\s*\S/);
assert.match(read('robots.txt'), /Sitemap: https:\/\/systemdesigner.io\/sitemap.xml/);
const landings = files.filter(f => f.startsWith('interview/'));
assert.ok(landings.length >= 4 && landings.length <= 8, 'four to eight interview landing pages');
for (const file of landings) {
  const html = read(file);
  assert.ok(html.replace(/<[^>]+>/g, ' ').split(/\s+/).length > 450, `${file}: useful reading`);
  assert.match(html, /href="[^\"]*#\/practice\/[a-z-]+/);
  assert.ok(read('llms.txt').includes(file.replace(/index\.html$/, '')), `${file}: text index`);
}
for (const p of problems) assert.match(read(`p/${p.id}/index.html`), /href="[^\"]*guides\/[^\"]+\//);
console.log(`PASS SEO: ${files.length} pages, ${landings.length} interview pages, metadata, share assets, structured data and sitemap`);
