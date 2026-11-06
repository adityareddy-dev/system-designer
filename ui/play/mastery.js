// Learning credit is separate from existing traffic scores and needs an independent transfer day.
import { checkpointCorrect } from './correctness.js';

export function learningCredit(problem, answer, { passed, hintsUsed = 0, workedRepair = false, reference = false }, previous = {}) {
  const traceChecked = !problem.correctness || checkpointCorrect(problem.correctness, answer);
  const assisted = hintsUsed >= 3 || workedRepair || reference;
  const independentTwist = !!problem.twistDay && passed && traceChecked && hintsUsed === 0 && !assisted && !!previous.eligibleAt;
  return { traceChecked, assisted, independentTwist, eligible: passed && traceChecked && !problem.twistDay && !problem.warmUp && !reference };
}
