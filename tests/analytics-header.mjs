import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const consent = { country: 'DE', marketingDefault: false, analyticsDefault: false };
const events = [];
const context = {
  URL, location: { origin: 'https://systemdesigner.io' },
  document: {
    currentScript: { src: 'https://systemdesigner.io/assets/header.js' },
    querySelector: selector => selector === '.sd-signin' ? { getAttribute: () => './' } : null,
    getElementById: () => null,
  },
  fetch: async url => {
    assert.equal(url, 'https://api.systemdesigner.io/me');
    return { ok: true, json: async () => ({ user: null, consent }) };
  },
  CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
  dispatchEvent: event => events.push(event),
};
// A failed account-module import uses the plain header fallback.
new vm.Script(fs.readFileSync('assets/header.js', 'utf8'), {
  importModuleDynamically: async () => { throw new Error('Account module unavailable'); },
}).runInNewContext(context);
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(context.sdConsentDefaults, consent, 'the fallback shares the API country even when signed out');
assert.equal(events.length, 1);
assert.equal(events[0].type, 'sd:consent-defaults');
assert.deepEqual(events[0].detail, consent);
console.log('The readable page fallback shares the API country with analytics.');
