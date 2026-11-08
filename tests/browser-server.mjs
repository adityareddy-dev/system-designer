// Concurrent check servers keep independent ports and survive another check closing.
import assert from 'node:assert/strict';
import { serveGame } from './browser-server.js';

const first = await serveGame(null);
const second = await serveGame(null);
try {
  assert.notEqual(first.base, second.base);
  assert.equal(new URL(first.base).hostname, '127.0.0.1');
  const [page, module, data, missing, malformed, outside] = await Promise.all([
    fetch(first.base), fetch(first.base + 'main.js'),
    fetch(first.base + 'content/data/l/back-of-envelope.json'),
    fetch(first.base + 'missing-file'), fetch(first.base + '%ZZ'),
    fetch(first.base + '%2e%2e%2fREADME.md'),
  ]);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /System Designer/);
  assert.match(module.headers.get('content-type'), /javascript/);
  assert.equal((await data.json()).id, 'back-of-envelope');
  assert.equal(missing.status, 404);
  assert.equal(malformed.status, 400);
  assert.equal(outside.status, 403);
  await first.close();
  assert.equal((await fetch(second.base + 'catalog/world.json')).status, 200);
  const external = await serveGame(second.base + 'subpath/');
  assert.equal(external.base, second.base + 'subpath/');
  await external.close();
  assert.equal((await fetch(second.base)).status, 200);
  console.log('Independent loopback ports, static content, error handling and supplied URLs passed.');
} finally {
  await Promise.all([first.close(), second.close()]);
}
