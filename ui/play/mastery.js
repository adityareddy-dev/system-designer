// Learning credit is separate from existing traffic scores and needs an independent transfer day.
import { checkpointCorrect, checkpointOwed } from './correctness.js';

export function learningCredit(problem, answer, { passed, hintsUsed = 0, workedRepair = false, reference = false }, previous = {}) {
  const traceChecked = !checkpointOwed(problem) || checkpointCorrect(problem.correctness, answer);
  const assisted = hintsUsed >= 3 || workedRepair || reference;
  const checkedPass = !!passed && traceChecked && !problem.warmUp && !reference;
  const independentTwist = !!problem.twistDay && checkedPass && hintsUsed === 0 && !assisted && !!previous.eligibleAt;
  return { traceChecked, assisted, assistedPass: checkedPass && assisted, independentTwist, needsOriginal: !!problem.twistDay && !previous.eligibleAt, eligible: checkedPass && !problem.twistDay };
}
