// Clarification paraphrases and uncertain wording stay useful across the full problem bank.
import assert from 'node:assert/strict';
import { problems } from '../content/problems/index.js';
import { questionAnalysis } from '../ui/play/question-topics.js';
for (const [own, question] of [
  ['What idempotency guarantees do we require?', 'What if the same message is asked for twice?'],
  ['Do users need to login?', 'Do readers log in?'],
  ['May delivery be async?', 'Does the sender wait until the message is delivered?'],
  ['What availability SLO must we promise?', 'If the limiter itself breaks, do we let traffic through or block it?'],
  ['Are short links immutable?', 'Can a short link change after it is made?'],
  ['What geography do we serve?', 'Where are the listeners?'],
  ['What happens after consent is revoked?', 'Do people opt out?'],
  ['Do edits require causal ordering?', 'Must everyone see messages in the same order?'],
  ['Can postings be changed, or only reversed?', 'Can a posting ever be edited or deleted?'],
]) assert.equal(questionAnalysis(own, [{ q: question }]).coverage[0], true, own);
const stems = questionAnalysis('What range and boundary changes?', [{ q: 'Which ranges and boundaries may move?' }]);
assert(stems.closest[0].matched);
assert.equal(stems.closest[0].phrase, 'range, boundary', 'stem matches expose the actual words from the player question');
for (const problem of problems) {
  assert(questionAnalysis(problem.clarify.map(q => q.q).join('\n'), problem.clarify).coverage.every(Boolean), problem.id);
  const result = questionAnalysis('What about glitter?', problem.clarify);
  assert(result.coverage.every(v => !v));
  assert.equal(result.closest[0].matched, false);
  assert(problem.clarify[result.closest[0].question], problem.id + ' exposes a topic to compare, not a wrong grade');
}
console.log(`Question synonyms and closest-topic feedback checked across ${problems.length} problems.`);
