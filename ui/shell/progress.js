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

    saveEstimates(problemId, values) {
      const prev = probs[problemId];
      probs[problemId] = {
        attempts: 0, bestScore: 0, stars: 0, hintsUsed: 0, solvedAt: null, lastResultAt: null,
        ...prev,
        estimates: values.slice(0, 20).map((v) => typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null),
        estimatesAt: Math.max(Date.now(), (prev?.estimatesAt || 0) + 1),
      };
      save();
      bus.emit('progress:updated', { problemId });
    },

    recordInterview(problemId, report) {
      const prev = probs[problemId] || { attempts: 0, bestScore: 0, stars: 0, hintsUsed: 0, solvedAt: null, lastResultAt: null };
      const old = prev.interview || {};
      const entry = { ...JSON.parse(JSON.stringify(report)), at: Date.now() };
      const ratio = x => x?.total > 0 ? x.covered / x.total : -1;
      probs[problemId] = { ...prev, interview: { attempts: (old.attempts || 0) + 1, latest: entry,
        bestCoverage: ratio(entry) > ratio(old.bestCoverage) ? entry : old.bestCoverage,
        bestDay: !old.bestDay || entry.score > old.bestDay.score ? entry : old.bestDay } };
      save(); bus.emit('progress:updated', { problemId });
    },

    recordCorrectness(problemId, checkpoint, answer, passed) {
      if (!checkpoint?.fields?.length || !answer || !passed || !checkpoint.fields.every((field, i) => field.correct === answer.choices?.[i])) return false;
      const prev = probs[problemId] || { attempts: 0, bestScore: 0, stars: 0 };
      probs[problemId] = { ...prev, correctness: { version: checkpoint.version || 1, checkedAt: Date.now(), choices: [...answer.choices], explanation: answer.text } };
      save(); bus.emit('progress:updated', { problemId }); return true;
    },

    recordLearning(problemId, credit) {
      const prev = probs[problemId] || { attempts: 0, bestScore: 0, stars: 0 };
      const old = prev.learning || {}, now = Date.now();
      const learning = { ...old,
        ...(credit.eligible ? { eligibleAt: old.eligibleAt || now } : {}),
        ...(credit.eligible && credit.assisted ? { assistedAt: old.assistedAt || now } : {}),
        ...(credit.independentTwist ? { masteredAt: old.masteredAt || now } : {}) };
      probs[problemId] = { ...prev, learning };
      save(); bus.emit('progress:updated', { problemId });
    },

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
    importAll(data, { preserveInterviews = false } = {}) {
      if (!data || data.app !== 'system-designer' || typeof data.problems !== 'object' || typeof data.lessons !== 'object') return false;
      const incoming = { ...data.problems };
      // Account sync keeps device-local reports; backup imports restore the saved reports.
      if (preserveInterviews) {
        for (const [id, problem] of Object.entries(probs)) {
          if (problem?.interview) incoming[id] = { ...(incoming[id] || problem), interview: problem.interview };
        }
      }
      probs = incoming;
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
