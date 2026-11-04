// Per-concept view of how the player is doing. A concept is a lesson id; problems list the concepts they exercise.
// Everything is derived from saved results, so nothing extra is stored.

// One row per concept the player has tried: tries, problems tried and solved, best result.
export function conceptStats(ctx) {
  const probs = ctx.content.problems || [];
  const lessons = new Map((ctx.content.lessons || []).map((l) => [l.id, l]));
  const rows = new Map();
  for (const p of probs) {
    const r = ctx.progress.get(p.id);
    for (const c of p.concepts || []) {
      if (!lessons.has(c)) continue;
      let row = rows.get(c);
      if (!row) { row = { id: c, title: lessons.get(c).title, tries: 0, tried: 0, solved: 0, best: 0, stars: 0, problems: [] }; rows.set(c, row); }
      row.problems.push(p);
      if (r && r.attempts > 0) {
        row.tries += r.attempts; row.tried++;
        if (r.solvedAt) row.solved++;
        row.best = Math.max(row.best, r.bestScore || 0);
        row.stars = Math.max(row.stars, r.stars || 0);
      }
    }
  }
  return [...rows.values()].filter((r) => r.tries > 0);
}

export function totalResults(ctx) {
  return Object.values(ctx.progress.all()).reduce((n, r) => n + (r.attempts || 0), 0);
}

// The concept with the weakest record that still has a problem not solved yet (needs 3 or more results overall).
export function weakestConcept(ctx, exclude = null) {
  if (totalResults(ctx) < 3) return null;
  let pick = null;
  for (const row of conceptStats(ctx)) {
    const open = row.problems.filter((p) => !ctx.progress.get(p.id)?.solvedAt && p.id !== exclude);
    if (!open.length) continue;
    const strength = (row.solved / row.tried) * 0.7 + Math.min(1, row.best / 1000) * 0.3;
    if (strength >= 0.999) continue;
    if (!pick || strength < pick.strength) pick = { ...row, strength, open };
  }
  return pick;
}
