import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canvasLook } from '../render/look.js';
import { problemById } from '../content/problems/index.js';

test('paper is selected only for URL shortener Practice', () => {
  for (const problem of problemById.values()) {
    assert.equal(canvasLook('practice', problem), problem.id === 'url-shortener' ? 'paper' : 'classic', problem.id);
    for (const mode of ['sandbox', 'daily', 'challenge', 'lesson', 'intro']) assert.equal(canvasLook(mode, problem), 'classic');
  }
  assert.equal(canvasLook('practice', null), 'classic');
});
