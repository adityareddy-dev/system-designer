// Public deployments never send automatic counts, including with saved opt-in settings.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../core/metrics.js', import.meta.url), 'utf8')
  .replace("import { createStore } from './store.js';", '')
  .replace('export const metrics', 'const metrics');
for (const hostname of ['systemdesigner.io', 'www.systemdesigner.io', 'preview.example.com']) for (const setting of [undefined, true, false]) for (const bound of [false, true]) {
  const sent = [], tasks = [], listeners = {};
  const context = {
    location: { protocol: 'https:', hostname, search: '?measure=8794', href: `https://${hostname}/` },
    navigator: { onLine: true, sendBeacon: (...args) => sent.push(args) },
    document: { referrer: '', visibilityState: 'hidden', addEventListener: (name, fn) => listeners[name] = fn },
    addEventListener: (name, fn) => listeners[name] = fn,
    requestAnimationFrame: fn => tasks.push(fn), setTimeout: fn => tasks.push(fn), clearTimeout: () => {},
    createStore: () => ({ get: () => ({ anonymousCounts: setting }) }),
    setting,
    URL, URLSearchParams, Blob, innerWidth: 1280,
  };
  vm.runInNewContext(source, context);
  if (bound) vm.runInNewContext('metrics.bind({ settings: { get: () => setting }, bus: { on() {} } });', context);
  assert.equal(vm.runInNewContext('metrics.countsAvailable()', context), false);
  while (tasks.length) tasks.shift()();
  vm.runInNewContext(`metrics.once('problem_passed', 'url-shortener'); metrics.reportError(new TypeError('null'), 'main.js');`, context);
  while (tasks.length) tasks.shift()();
  listeners.visibilitychange(); listeners.pagehide();
  assert.deepEqual(sent, [], hostname + ' keeps automatic collection disabled');
}
console.log('Public collection stays disabled with default or saved opt-in settings.');
