// Local progress: per-problem results and finished lessons, saved through ctx.store.

export function createProgress(store, bus) {
  let probs = store.get('progress', {}) || {};
  let lessons = store.get('lessons', {}) || {};
  if (typeof probs !== 'object' || Array.isArray(probs)) probs = {};
  if (typeof lessons !== 'object' || Array.isArray(lessons)) lessons = {};

  const save = () => { store.set('progress', probs); store.set('lessons', lessons); };

  return {
    get: (problemId) => probs[problemId] || null,
    all: () => ({ ...probs }),

    // Returns { first, improved } so callers can celebrate.
    record(problemId, debrief, hintsUsed = 0) {
      const total = Math.round(debrief?.score?.total ?? debrief?.total ?? 0);
      const stars = debrief?.stars || 0;
      const now = Date.now();
      const prev = probs[problemId];
      const next = prev ? { ...prev } : { attempts: 0, bestScore: 0, stars: 0, hintsUsed: 0, solvedAt: null, lastResultAt: now };
      next.attempts += 1;
      next.lastResultAt = now;
      const improved = total > next.bestScore;
      if (improved) { next.bestScore = total; next.hintsUsed = hintsUsed; }
      next.stars = Math.max(next.stars, stars);
      let first = false;
      if (debrief?.passed && !next.solvedAt) { next.solvedAt = now; first = true; }
      probs[problemId] = next;
      save();
      bus.emit('progress:updated', { problemId });
      return { first, improved, previousBest: prev ? prev.bestScore : null };
    },

    lessonDone(lessonId) {
      if (!lessons[lessonId]) {
        lessons[lessonId] = Date.now();
        save();
        bus.emit('progress:updated', { lessonId });
      }
    },
    isLessonDone: (lessonId) => !!lessons[lessonId],

    stats() {
      let solved = 0, stars = 0;
      for (const p of Object.values(probs)) { if (p.solvedAt) solved++; stars += p.stars || 0; }
      return { solved, stars, lessonsDone: Object.keys(lessons).length };
    },

    exportAll: () => ({ app: 'system-designer', v: 1, problems: probs, lessons }),
    importAll(data) {
      if (!data || data.app !== 'system-designer' || typeof data.problems !== 'object' || typeof data.lessons !== 'object') return false;
      probs = data.problems;
      lessons = data.lessons;
      save();
      bus.emit('progress:updated', {});
      return true;
    },
    reset() {
      try { store.set('warmups', {}); } catch { /* optional */ }
      probs = {};
      lessons = {};
      save();
      bus.emit('progress:updated', {});
    },
  };
}
