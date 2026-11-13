// One vocabulary for saved progress and the current run's learning credit.
import { checkpointCorrect, checkpointOwed } from './correctness.js';
export function completionState(problem = {}, result = {}, answer, saved = {}) {
  saved ||= {};
  const credit = result.learning || {};
  const traceChecked = credit.traceChecked ?? (!checkpointOwed(problem) || checkpointCorrect(problem.correctness, answer));
  const assisted = !!credit.assisted;
  let key = 'new', label = 'New', message = 'Finish a traffic day to check this design.';
  if (saved.attempts) { key = 'tried'; label = 'Tried'; }
  if (saved.solvedAt) { key = 'passed'; label = 'Traffic passed'; }
  if (saved.learning?.assistedAt) { key = 'assisted'; label = 'Passed with assistance'; }
  if (result.passed) {
    key = 'checked'; label = assisted ? 'Passed with assistance' : 'Traffic passed'; message = 'Traffic and responsibility trace passed. Next: pass New twist without hints for full mastery.';
    if (!traceChecked) { key = 'trace-open'; message = answer ? 'Traffic passed, but the responsibility trace answer was not right. Check it against the debrief; a clean sweep or mastery needs it right.' : 'Traffic passed, but the central responsibility trace is still open. Complete it on your next run before a clean sweep or mastery counts.'; }
    else if (credit.needsOriginal) { key = 'needs-original'; message = 'Traffic and trace passed on the twist. Pass the original day with its trace first, then return for an unhinted twist to earn full mastery.'; }
    else if (problem.twistDay && !credit.independentTwist) { key = 'twist-assisted'; message = 'Traffic and trace passed, but this twist used help. Retry the twist without hints or worked repairs for full mastery.'; }
    else if (assisted) { key = 'assisted'; label = 'Passed with assistance'; message = 'Traffic passed with assistance. Your trace is checked. Next: pass New twist with no hints for full mastery.'; }
  } else if (result.passed === false) { key = 'failed'; label = 'Not passed yet'; message = 'The traffic day found a limit. Compare your prediction with the evidence before changing the design.'; }
  if (result.reference) { key = 'reference'; label = 'Reference design'; message = 'Reference run: compare the evidence. This run does not earn learning credit.'; }
  else if (problem.warmUp && !problem.twistDay) { key = 'warm-up'; label = 'Warm-up'; message = 'Warm-up only. Try the full day to earn learning credit.'; }
  else if (credit.independentTwist || saved.learning?.masteredAt) { key = 'mastered'; label = 'Mastered'; message = 'Full mastery earned: changed conditions passed without hints, and the responsibility trace is checked.'; }
  else if (result.passed && result.mode && result.mode !== 'practice') { key = 'practice'; message = 'Traffic passed. Open this problem in Practice to check its central responsibility and earn mastery on a later New twist.'; }
  const next = ['checked','assisted'].includes(key) ? 'twist' : key === 'needs-original' ? 'original' : key === 'twist-assisted' ? 'retry' : key === 'practice' ? 'practice' : null;
  return { key, label, message, traceChecked, assisted, next };
}
