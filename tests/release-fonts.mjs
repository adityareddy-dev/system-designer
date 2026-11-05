// Exercise the release static-asset phase and resolve its font stylesheet and font files.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'system-designer-fonts-'));
try {
  const source = fs.readFileSync(path.join(root, 'tools/release.mjs'), 'utf8');
  const staticAssets = source.slice(source.indexOf('function copy('), source.indexOf("for (const f of ['privacy.html'"));
  vm.runInNewContext(staticAssets, { fs, path, root, dist });
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const href = html.match(/<link rel="stylesheet" href="([^"]*fonts\.css)"/)[1];
  const stylesheet = path.join(dist, href);
  const css = fs.readFileSync(stylesheet, 'utf8');
  const fonts = [...css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)];
  assert.equal(fonts.length, 3);
  for (const [, font] of fonts) assert(fs.statSync(path.resolve(path.dirname(stylesheet), font)).size > 0, 'release font URL resolves');
  console.log('Release font packaging checks passed.');
} finally {
  fs.rmSync(dist, { recursive: true, force: true });
}
