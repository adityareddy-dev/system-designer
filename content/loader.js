// Content loader: a small list of titles and card fields first, then one problem or lesson file when a page needs it.
// Each list entry is filled in place when its full file arrives, so every reference stays valid.
// (Written as ../content/data so it resolves the same from the release bundle's js/ folder.)
const DATA = new URL('../content/data/', import.meta.url);

async function getJSON(rel) {
  const res = await fetch(new URL(rel, DATA));
  if (!res.ok) throw new Error(rel + ' ' + res.status);
  return res.json();
}

// Full lists straight from the JS modules: used when the generated data files are missing.
async function fromModules() {
  const [p, l] = await Promise.all([import('./problems/index.js'), import('./lessons/index.js')]);
  return { groups: p.groups, problems: p.problems, problemById: p.problemById, lessons: l.lessons, lessonById: l.lessonById };
}

export async function loadContent() {
  let lite;
  try { lite = await getJSON('lite.json'); } catch { lite = null; }
  if (!lite) {
    const c = await fromModules();
    return { ...c, ensureProblem: async (id) => c.problemById.get(id), ensureLesson: async (id) => c.lessonById.get(id), ensureLessons: async () => c.lessons, isFull: () => true };
  }
  const problems = lite.problems;
  const problemById = new Map(problems.map((p) => [p.id, p]));
  const groups = lite.groups.map((g) => ({ ...g, problems: g.problems.map((id) => problemById.get(id)).filter(Boolean) }));
  const lessons = lite.lessons;
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const full = new WeakSet();
  const pending = new Map();

  const fill = (entry, data) => { Object.assign(entry, data); full.add(entry); return entry; };
  const once = (key, task) => { if (!pending.has(key)) pending.set(key, task().catch((e) => { pending.delete(key); throw e; })); return pending.get(key); };

  const ensureProblem = (id) => {
    const entry = problemById.get(id);
    if (!entry || full.has(entry)) return Promise.resolve(entry);
    return once('p:' + id, async () => fill(entry, await getJSON('p/' + encodeURIComponent(id) + '.json')));
  };
  const ensureLesson = (id) => {
    const entry = lessonById.get(id);
    if (!entry || full.has(entry)) return Promise.resolve(entry);
    return once('l:' + id, async () => fill(entry, await getJSON('l/' + encodeURIComponent(id) + '.json')));
  };
  // All lessons at once (the quick drill draws questions from every lesson).
  const ensureLessons = () => {
    if (lessons.every((l) => full.has(l))) return Promise.resolve(lessons);
    return once('lessons', async () => {
      const all = await getJSON('lessons.json');
      for (const data of all) { const e = lessonById.get(data.id); if (e && !full.has(e)) fill(e, data); }
      return lessons;
    });
  };
  return { groups, problems, problemById, lessons, lessonById, ensureProblem, ensureLesson, ensureLessons, isFull: (e) => full.has(e) };
}
