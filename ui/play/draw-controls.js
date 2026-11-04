// Count buttons always change one unit, including across twenty.
export function stepCount(value, direction, min, max) {
  return Math.min(max, Math.max(min, Math.round(Number(value) || min) + Math.sign(direction)));
}
