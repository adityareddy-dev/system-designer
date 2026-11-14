import assert from 'node:assert/strict';
import { test } from 'node:test';
import { e08Palette } from '../render/e08.js';

for (const dark of [false, true]) await test(`e08 preserves supplied ${dark ? 'dark' : 'light'} site canvas and text tokens`, () => {
  const base = { dark, canvas: dark ? 0x191919 : 0xfffcf4, gridDot: 0x888888, gridDotAlpha: .2,
    text: dark ? 0xfafafa : 0x141414, text2: 0x999999, text3: 0x777777, ink: 0x123456,
    card: 0xabcdef, surfaceSolid: 0x987654, edgeIdle: 0x654321, edgeFlow: 0x112233 };
  const p = e08Palette(base);
  for (const key of Object.keys(base)) assert.equal(p[key], base[key], key + ' must come from the site');
  assert.equal(p.cat.compute, 0xfbbf24, 'e08 category colour stays fixed');
  assert.equal(p.bad, 0xef4444, 'e08 state colour stays fixed');
});
