// Fleet buckets preserve real availability and busy share at any fleet size.
import assert from 'node:assert/strict';
import { poolCells } from '../render/pool.js';
for (const units of [3, 12, 300]) for (const alive of [0, units / 3, units]) {
  const cells = poolCells(units, alive, .6);
  assert(cells.length <= 12);
  assert(Math.abs(cells.reduce((s, c) => s + c.available, 0) / cells.length - alive / units) < 1e-9);
  assert(Math.abs(cells.reduce((s, c) => s + c.busy, 0) / cells.length - .6 * alive / units) < 1e-9);
}
console.log('Fleet display preserves aggregate availability and load');
