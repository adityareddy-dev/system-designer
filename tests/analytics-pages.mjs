import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// A missing entry point on any served page must fail this check.
const roots = ['index.html', 'privacy.html', '404.html', 'd', 'p', 'learn', 'guides', 'problems'];
let count = 0;
function check(file) {
  if (fs.statSync(file).isDirectory()) { for (const name of fs.readdirSync(file)) check(path.join(file, name)); return; }
  if (!file.endsWith('.html')) return;
  const html = fs.readFileSync(file, 'utf8');
  const tags = [...html.matchAll(/<script type="module" src="([^"]*assets\/analytics.js)"><\/script>/g)];
  assert.equal(tags.length, 1, file);
  const target = tags[0][1].startsWith('/') ? tags[0][1].slice(1) : path.join(path.dirname(file), tags[0][1]);
  assert.ok(fs.existsSync(target), file + ' resolves its analytics entry point');
  assert.ok(html.indexOf(tags[0][0]) < html.indexOf('</head>'), file + ' loads consent in the head');
  count++;
}
for (const root of roots) check(root);
console.log(`Analytics entry point present on ${count} static pages.`);
