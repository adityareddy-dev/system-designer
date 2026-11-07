// Equal fleet buckets visualize aggregate capacity without inventing server histories.
export function poolCells(units, available, busy, limit = 12) {
  const count = Math.max(1, Math.round(units)), buckets = Math.min(count, limit);
  const alive = Math.max(0, Math.min(count, available));
  return Array.from({ length: buckets }, (_, i) => {
    const start = i * count / buckets, end = (i + 1) * count / buckets;
    const share = Math.max(0, Math.min(end, alive) - start) / (end - start);
    return { available: share, busy: Math.max(0, Math.min(1, busy)) * share };
  });
}
