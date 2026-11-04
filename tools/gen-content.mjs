// Writes the content data files the page fetches: a small list (titles and card fields) and one file per problem and lesson.
// The JS content modules stay the source of truth; run from the app folder after any content change: node tools/gen-content.mjs
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const out = path.join(root, 'content/data');
const { groups, problems } = await import(pathToFileURL(path.join(root, 'content/problems/index.js')).href);
const { lessons } = await import(pathToFileURL(path.join(root, 'content/lessons/index.js')).href);

// Fields a list, a card or the daily draw needs before a problem or lesson is opened.
const PROBLEM_LIST = ['id', 'title', 'difficulty', 'concepts', 'like', 'brief', 'group', 'daily', 'requires', 'palette', 'events', 'eventPool'];
const LESSON_LIST = ['id', 'title', 'track', 'minutes', 'summary', 'takeaway'];
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); };

fs.rmSync(out, { recursive: true, force: true });
const lite = {
  groups: groups.map((g) => ({ id: g.id, title: g.title, blurb: g.blurb, problems: g.problems.map((p) => p.id) })),
  problems: problems.map((p) => pick(p, PROBLEM_LIST)),
  lessons: lessons.map((l) => ({ ...pick(l, LESSON_LIST), icon: (l.steps || []).find((s) => s.icon)?.icon || null })),
};
write(path.join(out, 'lite.json'), lite);
for (const p of problems) write(path.join(out, 'p', p.id + '.json'), p);
for (const l of lessons) write(path.join(out, 'l', l.id + '.json'), l);
write(path.join(out, 'lessons.json'), lessons);
console.log(`${problems.length} problems, ${lessons.length} lessons written to content/data`);
