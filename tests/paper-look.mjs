import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canvasLook } from '../render/look.js';
import { problemById } from '../content/problems/index.js';

test('paper is selected for every problem and editor mode', () => {
  for (const problem of problemById.values()) {
    assert.equal(canvasLook('practice', problem), 'paper', problem.id);
    for (const mode of ['sandbox', 'daily', 'challenge', 'lesson', 'intro']) assert.equal(canvasLook(mode, problem), 'paper');
  }
  assert.equal(canvasLook('practice', null), 'paper');
});
