import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSitePages } from '../tools/gen-site-pages.mjs';

const pages = buildSitePages();
assert.match(pages.get('index.html'), /assets\/email-capture.js/, 'landing pages keep their source tag before a reader follows a guide');
for (const [file, html] of pages) {
  if (!/^(?:guides|learn|p)\/[^/]+\/index\.html$/.test(file)) continue;
  assert.match(html, /data-email-capture/, file);
  assert.match(html, /type="email"/, file);
  assert.match(html, /name="marketingOptIn"/, file);
  assert.doesNotMatch(html, /name="marketingOptIn"[^>]*checked/, file);
  assert.match(html, /assets\/email-capture.js/, file);
  assert.match(html, /Unsubscribe any time/, file);
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1])['@graph'];
  if (file.startsWith('p/')) {
    assert.doesNotMatch(html, /class="sd-gated"/, file);
    assert.match(html, /id="requirements"/, file);
  } else {
    assert.match(html, /class="sd-gated" hidden/, file);
    assert.match(html, /data-purpose="guide"/, file);
    assert.ok(graph.some(d => d.isAccessibleForFree === false && d.hasPart?.cssSelector === '.sd-gated'), file);
    const before = html.split('data-email-capture')[0].split('<main')[1];
    assert.match(before, /site-lead/, 'the introduction is visible: ' + file);
  }
}
assert.match(fs.readFileSync('tools/release.mjs', 'utf8'), /email-capture.js/);
console.log('Public forms, visible introductions, complete briefs, gate markup and release assets passed.');
