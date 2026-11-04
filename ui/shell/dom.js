// Shell helpers: tiny element builder, icon wrapper, URL helpers, content lookups.
import { icon, hasIcon } from '../../assets/icons/index.js';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  append(el, kids);
  return el;
}

export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

// Icon as an element. Stays empty when the id is unknown.
export function ico(id, size = 20, title = '') {
  const s = h('span', { class: 'sh-ico' });
  s.style.setProperty('--ico', size + 'px');
  if (hasIcon(id)) s.innerHTML = icon(id, { size, title });
  return s;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function buildHash(path, query) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== '') q.set(k, v);
  }
  const s = q.toString();
  return '#/' + path.replace(/^\/+/, '') + (s ? '?' + s : '');
}

// ctx.content lookups that accept a Map or a plain object.
export function lookup(coll, id) {
  if (!coll) return undefined;
  return typeof coll.get === 'function' ? coll.get(id) : coll[id];
}
export const problemOf = (ctx, id) => lookup(ctx.content.problemById, id) || (ctx.content.problems || []).find((p) => p.id === id);
export const lessonOf = (ctx, id) => lookup(ctx.content.lessonById, id) || (ctx.content.lessons || []).find((l) => l.id === id);

export function groupsOf(ctx) {
  const g = ctx.content.groups;
  const list = Array.isArray(g) ? g : g ? Object.values(g) : [];
  return list.map((x) => ({ id: x.id || x.group?.id, title: x.title || x.group?.title, blurb: x.blurb || x.group?.blurb, problems: x.problems }));
}

// Which group a problem belongs to: explicit field, else the group file that lists it.
export function groupIdOf(ctx, problem) {
  if (problem.group) return problem.group;
  for (const g of groupsOf(ctx)) if (g.problems && g.problems.some((p) => p.id === problem.id)) return g.id;
  return 'core';
}

export const GROUP_ICON = {
  core: 'ui.units', media: 'ui.play', social: 'ui.users', fintech: 'ui.budget', health: 'ui.safety',
  civic: 'ui.shield', mobility: 'ui.region', travel: 'ui.calendar', iot: 'ui.rps', ai: 'ui.hint',
  games: 'ui.trophy', productivity: 'ui.duplicate', devtools: 'ui.keyboard',
};

export const DIFF_ORDER = { Easy: 0, Medium: 1, Hard: 2 };

// Difficulty marker: shape plus colour, so it reads without colour vision.
export function diffBadge(diff) {
  const shape = { Easy: '<circle cx="6" cy="6" r="4.5"/>', Medium: '<path d="M6 .8 11.2 6 6 11.2.8 6z"/>', Hard: '<path d="M6 .8 11.2 11H.8z"/>' }[diff] || '';
  const b = h('span', { class: 'sh-diff', dataset: { diff } });
  b.innerHTML = `<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">${shape}</svg>`;
  b.append(document.createTextNode(diff));
  return b;
}

export function stars(n, max = 3) {
  const w = h('span', { class: 'sh-stars', role: 'img', 'aria-label': `${n} of ${max} stars` });
  for (let i = 0; i < max; i++) w.append(ico(i < n ? 'ui.star' : 'ui.star-empty', 16));
  return w;
}

export function fmtDate(ts) {
  try { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; }
}

// Score from several possible result shapes.
export function scoreOf(x) {
  if (x == null) return 0;
  if (typeof x === 'number') return x;
  return x.score?.total ?? x.total ?? (typeof x.score === 'number' ? x.score : x.best ?? x.bestScore ?? 0);
}
