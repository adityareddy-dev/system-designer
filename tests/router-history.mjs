// Rapid history changes retain each queued route, including a return to a lesson demo.
import assert from 'node:assert/strict';
import { createRouter } from '../core/router.js';
const demo = '#/learn/load-balancing?step=1', reading = '#/learn/load-balancing';
const originalLocation = globalThis.location, originalListener = globalThis.addEventListener;
let listener;
globalThis.location = { hash: demo };
globalThis.addEventListener = (name, fn) => { if (name === 'hashchange') listener = fn; };
try {
  const routes = [];
  const router = createRouter({ emit(name, route) { routes.push(route.query.step || '0'); } });
  router.go(reading);
  // History can return before the earlier hashchange event is delivered.
  location.hash = demo;
  listener({ newURL: 'http://localhost/' + reading });
  listener({ newURL: 'http://localhost/' + demo });
  assert.deepEqual(routes, ['0', '1'], 'each history entry reaches the shell in event order');
  assert.equal(router.current().query.step, '1', 'the final route returns to the demo');
} finally {
  if (originalLocation === undefined) delete globalThis.location; else globalThis.location = originalLocation;
  if (originalListener === undefined) delete globalThis.addEventListener; else globalThis.addEventListener = originalListener;
}
console.log('Queued history changes preserve the return route.');
