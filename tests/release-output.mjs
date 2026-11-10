// Release cleanup rejects source paths, aliases and unrelated work before running generators.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { prepareReleaseDirectory, releaseDirectory } from '../tools/release-output.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'system-designer-release-'));
try {
  const root = path.join(temp, 'checkout');
  fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
  fs.writeFileSync(path.join(root, 'main.js'), 'source sentinel');
  for (const file of ['release.mjs', 'release-output.mjs']) {
    fs.copyFileSync(new URL('../tools/' + file, import.meta.url), path.join(root, 'tools', file));
  }
  fs.symlinkSync(root, path.join(temp, 'alias'));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'assets', 'original'), 'asset sentinel');
  const unrelated = path.join(temp, 'other-work');
  fs.mkdirSync(unrelated);
  fs.writeFileSync(path.join(unrelated, 'notes'), 'unrelated sentinel');
  for (const output of ['.', '..', path.parse(root).root, path.join(temp, 'alias'), 'assets', 'assets/new', unrelated]) {
    const run = spawnSync(process.execPath, ['tools/release.mjs'], {
      cwd: root, env: { ...process.env, RELEASE_DIR: output }, encoding: 'utf8',
    });
    assert.notEqual(run.status, 0, output + ' is rejected');
    assert.match(run.stderr, /Release output/, 'validation runs before generators and bundling');
    assert.equal(fs.readFileSync(path.join(root, 'main.js'), 'utf8'), 'source sentinel');
    assert.equal(fs.readFileSync(path.join(root, 'assets', 'original'), 'utf8'), 'asset sentinel');
    assert.equal(fs.readFileSync(path.join(unrelated, 'notes'), 'utf8'), 'unrelated sentinel');
  }
  for (const output of [path.join(root, 'dist'), path.join(temp, 'new-release')]) {
    const dist = prepareReleaseDirectory(root, output);
    fs.writeFileSync(path.join(dist, 'stale.js'), 'old release');
    assert.equal(prepareReleaseDirectory(root, output), dist);
    assert.equal(fs.existsSync(path.join(dist, 'stale.js')), false, 'only prior release files are cleared');
  }
  fs.symlinkSync(unrelated, path.join(temp, 'linked-output'));
  assert.throws(() => releaseDirectory(root, path.join(temp, 'linked-output')), /Release output/);
  fs.symlinkSync(root, path.join(temp, 'parent-alias'));
  assert.throws(() => releaseDirectory(root, path.join(temp, 'parent-alias/assets/new')), /Release output/);
  console.log('Release directory protection passed.');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
