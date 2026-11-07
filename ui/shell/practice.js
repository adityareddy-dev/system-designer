// Practice view: the problem bank with search, difficulty, industry, concept and status filters.
import { completionState } from '../play/completion.js';
import { h, ico, clear, append, buildHash, groupsOf, groupIdOf, lessonOf, diffBadge, stars, GROUP_ICON, DIFF_ORDER } from './dom.js';
import { nextProblem } from './home.js';
import { sceneMarkup } from '../../assets/scenes/index.js';
import { workloadMarkup } from '../../assets/scenes/workloads.js';

const DIFFS = ['Easy', 'Medium', 'Hard'];
const STATUSES = [['new', 'New'], ['tried', 'Tried'], ['solved', 'Solved']];
const SORTS = [['suggested', 'Suggested order'], ['difficulty', 'Difficulty'], ['title', 'Title'], ['score', 'Best score']];

// Named study paths: each is a filter on what a problem teaches, so new problems join them on their own.
const SETS = [
  { id: 'first-hour', title: 'First hour', blurb: 'Easy problems, the gentlest way in.', test: (p) => p.difficulty === 'Easy' },
  { id: 'fast-cheap', title: 'Fast and cheap', blurb: 'Caches, CDNs and keeping the bill small.', test: (p) => hasAny(p, ['caching', 'cdn', 'cost', 'storage-tiers']) },
  { id: 'spikes', title: 'Surviving spikes', blurb: 'Queues, limits and autoscaling when everyone arrives at once.', test: (p) => hasAny(p, ['queues-backpressure', 'rate-limiting', 'autoscaling', 'hot-keys']) },
  { id: 'money-safety', title: 'Money and safety', blurb: 'Retries, consistency and audits where mistakes cost real money.', test: (p) => hasAny(p, ['idempotency-retries', 'consistency', 'security-compliance', 'circuit-breakers']) },
  { id: 'live-worldwide', title: 'Live and worldwide', blurb: 'Realtime, fan-out and more than one region.', test: (p) => hasAny(p, ['realtime-connections', 'fanout', 'multi-region', 'sharding']) },
];
function hasAny(p, ids) { return (p.concepts || []).some((c) => ids.includes(c)); }

const csv = (s) => (s ? String(s).split(',').map((x) => x.trim()).filter(Boolean) : []);

function parseState(q) {
  return {
    d: new Set(csv(q.d).filter((x) => DIFFS.includes(x))),
    g: new Set(csv(q.g)),
    c: new Set(csv(q.c)),
    s: new Set(csv(q.s).filter((x) => STATUSES.some(([k]) => k === x))),
    set: SETS.some((x) => x.id === q.set) ? q.set : '',
    q: (q.q || '').slice(0, 80),
    o: SORTS.some(([k]) => k === q.o) ? q.o : 'suggested',
  };
}

function toQuery(st) {
  return {
    d: [...st.d].join(',') || undefined, g: [...st.g].join(',') || undefined, c: [...st.c].join(',') || undefined,
    s: [...st.s].join(',') || undefined, set: st.set || undefined, q: st.q || undefined, o: st.o !== 'suggested' ? st.o : undefined,
  };
}

export function renderPractice(host, ctx, route) {
  const problems = ctx.content.problems || [];
  const groups = groupsOf(ctx);
  const groupIndex = new Map(groups.map((g, i) => [g.id, i]));
  const groupOf = new Map(problems.map((p) => [p.id, groupIdOf(ctx, p)]));
  const conceptName = (id) => lessonOf(ctx, id)?.title || id.replace(/-/g, ' ');
  const groupTitle = (id) => groups.find((g) => g.id === id)?.title || id;

  // Concept chips: only concepts that tag at least one problem, in lesson order.
  const conceptCount = new Map();
  for (const p of problems) for (const c of p.concepts || []) conceptCount.set(c, (conceptCount.get(c) || 0) + 1);
  const lessonOrder = (ctx.content.lessons || []).map((l) => l.id);
  const concepts = [...conceptCount.keys()].sort((a, b) => (lessonOrder.indexOf(a) + 1 || 99) - (lessonOrder.indexOf(b) + 1 || 99));
  const groupCount = new Map();
  for (const p of problems) groupCount.set(groupOf.get(p.id), (groupCount.get(groupOf.get(p.id)) || 0) + 1);

  let st = parseState(route.query);
  let filtersOpen = false;
  const openFolds = new Set();
  let lastSerialized = JSON.stringify(toQuery(st));

  // A passed warm-up is not a saved score, but it marks the problem as tried.
  const warmed = (p) => { try { return !!(ctx.store?.get('warmups', {}) || {})[p.id] && !ctx.progress.get(p.id); } catch { return false; } };
  const statusOf = (p) => { const r = ctx.progress.get(p.id); return !r ? (warmed(p) ? 'tried' : 'new') : r.solvedAt ? 'solved' : 'tried'; };

  function matches(p) {
    if (st.d.size && !st.d.has(p.difficulty)) return false;
    if (st.g.size && !st.g.has(groupOf.get(p.id))) return false;
    if (st.c.size && ![...st.c].every((c) => (p.concepts || []).includes(c))) return false;
    if (st.s.size && !st.s.has(statusOf(p))) return false;
    if (st.set && !SETS.find((x) => x.id === st.set).test(p)) return false;
    if (st.q) {
      const hay = [p.title, p.like, p.id.replace(/-/g, ' '), groupTitle(groupOf.get(p.id)), ...(p.concepts || []).flatMap((c) => [c, conceptName(c)])].join(' ').toLowerCase();
      if (!st.q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
    }
    return true;
  }

  function sorted(list) {
    const idx = new Map(problems.map((p, i) => [p.id, i]));
    const base = (a, b) => (groupIndex.get(groupOf.get(a.id)) ?? 99) - (groupIndex.get(groupOf.get(b.id)) ?? 99) || DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty] || idx.get(a.id) - idx.get(b.id);
    const out = [...list];
    if (st.o === 'difficulty') out.sort((a, b) => DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty] || base(a, b));
    else if (st.o === 'title') out.sort((a, b) => a.title.localeCompare(b.title));
    else if (st.o === 'score') out.sort((a, b) => (ctx.progress.get(b.id)?.bestScore || 0) - (ctx.progress.get(a.id)?.bestScore || 0) || base(a, b));
    else out.sort(base);
    return out;
  }

  // Controls that persist across filter changes
  const search = h('input', { type: 'search', class: 'sh-input sh-search-input', placeholder: 'Search, e.g. payments or cache', 'aria-label': 'Search problems', autocomplete: 'off', spellcheck: 'false' });
  search.value = st.q;
  const sortSel = h('select', { class: 'sh-select', 'aria-label': 'Sort problems' }, SORTS.map(([k, t]) => h('option', { value: k, text: t })));
  sortSel.value = st.o;
  const filterBtn = h('button', { type: 'button', class: 'sh-btn sh-filter-toggle', 'aria-expanded': 'false', 'aria-controls': 'sh-filters' }, ico('ui.filter', 18), h('span', { text: 'Filters' }));
  const panel = h('div', { class: 'sh-filters', id: 'sh-filters' });
  const results = h('div', { class: 'sh-results', 'aria-live': 'polite' });
  const countEl = h('p', { class: 'sh-muted sh-count' });

  let timer = null;
  function commit(replace = true) {
    const hash = buildHash('practice', toQuery(st));
    lastSerialized = JSON.stringify(toQuery(st));
    (replace ? ctx.router.replace : ctx.router.go)(hash);
    renderAll();
  }
  search.addEventListener('input', () => {
    st.q = search.value.trim().slice(0, 80);
    clearTimeout(timer);
    timer = setTimeout(() => commit(true), 140);
    renderResults();
  });
  sortSel.addEventListener('change', () => { st.o = sortSel.value; commit(true); });
  filterBtn.addEventListener('click', () => { setsRow.hidden = filtersOpen; filtersOpen = !filtersOpen; syncFilterToggle(); });

  function syncFilterToggle() {
    panel.classList.toggle('is-open', filtersOpen);
    filterBtn.setAttribute('aria-expanded', String(filtersOpen));
    const n = st.d.size + st.g.size + st.c.size + st.s.size;
    filterBtn.lastChild.textContent = n ? `Filters (${n})` : 'Filters';
  }

  function chip(label, pressed, onClick, extra = {}) {
    const b = h('button', { type: 'button', class: 'sh-chip' + (pressed ? ' is-on' : ''), 'aria-pressed': String(pressed) }, extra.icon || null, label, extra.count != null ? h('span', { class: 'sh-chip-count', text: String(extra.count) }) : null);
    b.addEventListener('click', onClick);
    return b;
  }
  function toggle(set, v) { if (set.has(v)) set.delete(v); else set.add(v); commit(true); }

  function drawPanel() {
    clear(panel);
    const active = st.d.size + st.g.size + st.c.size + st.s.size + (st.q ? 1 : 0) + (st.set ? 1 : 0);
    const block = (title, kids) => h('div', { class: 'sh-fblock' }, h('h3', { class: 'sh-fblock-title', text: title }), h('div', { class: 'sh-chip-wrap' }, kids));
    const fold = (key, title, selected, kids) => {
      const d = h('details', { class: 'sh-fdetails sh-fblock--wide' }, h('summary', null, title, selected ? h('span', { class: 'sh-fsel', text: `${selected} selected` }) : null, ico('ui.chevron-down', 16)), h('div', { class: 'sh-chip-wrap' }, kids));
      d.open = openFolds.has(key) || selected > 0;
      d.addEventListener('toggle', () => { if (d.open) openFolds.add(key); else openFolds.delete(key); });
      return d;
    };
    append(panel, [
      block('Difficulty', DIFFS.map((d) => chip(d, st.d.has(d), () => toggle(st.d, d), { icon: diffShape(d) }))),
      block('Status', STATUSES.map(([k, t]) => chip(t, st.s.has(k), () => toggle(st.s, k)))),
      fold('g', 'Industry', st.g.size, groups.map((g) => chip(g.title, st.g.has(g.id), () => toggle(st.g, g.id), { icon: ico(GROUP_ICON[g.id] || 'ui.grid', 16), count: groupCount.get(g.id) || 0 }))),
      fold('c', 'Concept', st.c.size, concepts.map((c) => chip(conceptName(c), st.c.has(c), () => toggle(st.c, c), { count: conceptCount.get(c) }))),
      active ? h('button', { type: 'button', class: 'sh-btn sh-btn--ghost sh-clear', onclick: () => { st = parseState({}); search.value = ''; commit(true); } }, ico('ui.close', 16), 'Clear all') : null,
    ]);
    syncFilterToggle();
  }

  function diffShape(d) {
    const s = h('span', { class: 'sh-diff-shape', dataset: { diff: d } });
    s.innerHTML = `<svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">${{ Easy: '<circle cx="6" cy="6" r="4.5"/>', Medium: '<path d="M6 .8 11.2 6 6 11.2.8 6z"/>', Hard: '<path d="M6 .8 11.2 11H.8z"/>' }[d]}</svg>`;
    return s;
  }

  function card(p) {
    const r = ctx.progress.get(p.id);
    const status = statusOf(p);
    return h('li', null, h('a', { class: 'sh-card sh-card--link sh-prob', href: '#/practice/' + p.id, dataset: { status, diff: p.difficulty } },
      h('span', { class: 'sh-workload-art', 'aria-hidden': 'true', html: workloadMarkup(p,groupOf.get(p.id)) }),
      h('span', { class: 'sh-prob-top' }, diffBadge(p.difficulty),
        status === 'solved' ? h('span', { class: 'sh-prob-state is-ok' }, ico('ui.check', 14), completionState(p, {}, null, r).label) : status === 'tried' ? h('span', { class: 'sh-prob-state' + (warmed(p) ? ' is-ok' : '') }, warmed(p) ? ico('ui.check', 14) : null, warmed(p) ? 'Warm-up passed' : 'Tried') : null),
      h('span', { class: 'sh-prob-title', text: p.title }),
      h('span', { class: 'sh-prob-like', text: p.like || '' }),
      h('span', { class: 'sh-prob-tags' }, (p.concepts || []).slice(0, 3).map((c) => h('span', { class: 'sh-tag', text: conceptName(c) }))),
      h('span', { class: 'sh-prob-foot' }, stars(r?.stars || 0), r ? h('span', { class: 'sh-prob-score' }, h('span', { class: 'sh-num', text: String(r.bestScore) }), ' / 1000') : h('span', { class: 'sh-muted', text: warmed(p) ? 'Now play the real day' : 'Not tried' }))));
  }

  function renderResults() {
    clear(results);
    const list = sorted(problems.filter(matches));
    countEl.textContent = list.length === problems.length ? `${problems.length} problems` : `${list.length} of ${problems.length} problems`;
    if (!list.length) {
      results.append(h('div', { class: 'sh-empty' }, ico('ui.search', 32), h('h2', { class: 'sh-h2', text: problems.length ? 'No problems match' : 'Problems are on their way' }),
        problems.length ? h('p', { class: 'sh-muted', text: 'Try fewer filters or a different word.' }) : null,
        problems.length ? h('button', { type: 'button', class: 'sh-btn', onclick: () => { st = parseState({}); search.value = ''; commit(true); } }, 'Clear all') : null));
      return;
    }
    if (st.o === 'suggested') {
      for (const g of groups) {
        const items = list.filter((p) => groupOf.get(p.id) === g.id);
        if (!items.length) continue;
        results.append(h('section', { class: 'sh-group', 'aria-labelledby': 'sh-g-' + g.id },
          h('div', { class: 'sh-group-head' }, h('div', { class: 'sh-industry-art', 'aria-hidden': 'true', html: sceneMarkup('industry-' + g.id) }), ico(GROUP_ICON[g.id] || 'ui.grid', 22), h('div', null, h('h2', { class: 'sh-h2', id: 'sh-g-' + g.id, text: g.title }), g.blurb ? h('p', { class: 'sh-muted', text: g.blurb }) : null)),
          h('ul', { class: 'sh-prob-grid' }, items.map(card))));
      }
    } else {
      results.append(h('ul', { class: 'sh-prob-grid' }, list.map(card)));
    }
  }

  // Study paths: one tap narrows the bank to a themed set
  const setsRow = h('div', { class: 'sh-sets', role: 'group', 'aria-label': 'Study paths' });
  function drawSets() {
    clear(setsRow);
    const pool = problems;
    append(setsRow, [h('span', { class: 'sh-sets-l', text: 'Study paths' }), ...SETS.map((x) => {
      const n = pool.filter(x.test).length;
      const done = pool.filter((p) => x.test(p) && statusOf(p) === 'solved').length;
      const b = chip(x.title, st.set === x.id, () => { st.set = st.set === x.id ? '' : x.id; commit(true); }, { count: `${done}/${n}` });
      b.title = x.blurb;
      b.dataset.set = x.id;
      return b;
    })]);
  }
  // Up next: the first problem not solved yet in the chosen path, else the suggested one
  const upNext = h('div', { class: 'sh-upnext-wrap' });
  function drawUpNext() {
    clear(upNext);
    let np = null, label = null;
    if (st.set) {
      const x = SETS.find((y) => y.id === st.set);
      const open = sorted(problems.filter((p) => x.test(p) && statusOf(p) !== 'solved'));
      np = open[0] || null;
      label = np ? `Up next in ${x.title}` : null;
    }
    if (!np && !st.set) {
      np = problems.find((p) => warmed(p)) || null;
      label = np ? 'Now play the real day' : null;
    }
    if (!np) { np = nextProblem(ctx); label = np?.weakConcept ? `Up next: ${np.weakConcept}` : stats.solved ? 'Up next' : 'Good first problem'; }
    if (!np) return;
    const tried = ctx.progress.get(np.id);
    upNext.append(h('div', { class: 'sh-card sh-upnext' },
      h('div', { class: 'sh-upnext-body' },
        h('span', { class: 'sh-eyebrow', text: label }),
        h('span', { class: 'sh-teaser-title', text: np.title }),
        h('span', { class: 'sh-muted', text: np.like || '' }),
        h('span', { class: 'sh-teaser-meta' }, diffBadge(np.difficulty))),
      h('div', { class: 'sh-upnext-actions' },
        h('a', { class: 'sh-btn sh-btn--primary', href: '#/practice/' + np.id }, tried ? 'Open' : warmed(np) ? 'Play the real day' : 'Start'),
        h('button', { type: 'button', class: 'sh-btn', 'data-act': 'decision', onclick: () => openQuick() }, ico('ui.clock', 16), '60-second decision'))));
  }
  function openQuick() {
    import('./decision.js').then((m) => m.openDecision(ctx, { pool: problems.filter(matches), onClose: () => { renderAll(); } }));
  }

  function renderAll() { setsRow.hidden = !filtersOpen; drawPanel(); drawSets(); drawUpNext(); renderResults(); }

  const stats = ctx.progress.stats();
  const pct = problems.length ? (stats.solved / problems.length) * 100 : 0;
  const bar = h('div', { class: 'sh-bar', role: 'presentation' }, h('span', { class: 'sh-bar-fill' }));
  bar.firstChild.style.width = pct + '%';

  const head = h('header', { class: 'sh-page-head' },
    h('div', null,
      h('p', { class: 'sh-eyebrow', text: 'Practice' }),
      h('h1', { class: 'sh-h1', text: 'Problem bank' }),
      h('p', { class: 'sh-lead sh-lead--sm', text: 'Pick a problem, build your design, then survive a full day of traffic.' })),
    h('div', { class: 'sh-progress-pill', role: 'img', 'aria-label': `${stats.solved} of ${problems.length} solved, ${stats.stars} stars` },
      h('span', { class: 'sh-progress-num', text: `${stats.solved}/${problems.length}` }), h('span', { text: 'solved' }), h('span', { class: 'sh-progress-stars' }, ico('ui.star', 14), String(stats.stars))));

  // Random: a problem from what the filters show, preferring ones not yet solved.
  const randomBtn = h('button', { type: 'button', class: 'sh-btn', 'aria-label': 'Open a random problem from this list', onclick: () => {
    const pool = problems.filter(matches);
    if (!pool.length) return;
    const fresh = pool.filter((p) => statusOf(p) !== 'solved');
    const from = fresh.length ? fresh : pool;
    const pick = from[Math.floor(Math.random() * from.length)];
    location.hash = '#/practice/' + pick.id;
  } }, ico('ui.restart', 16), 'Random');
  const tools = h('div', { class: 'sh-tools' },
    h('label', { class: 'sh-search' }, ico('ui.search', 18), search),
    sortSel, filterBtn, randomBtn);

  host.append(h('div', { class: 'sh-page sh-practice-page' }, head, bar, upNext, tools, panel, setsRow, countEl, results));
  renderAll();

  return {
    title: 'Practice',
    update(r) {
      const next = parseState(r.query);
      const ser = JSON.stringify(toQuery(next));
      if (ser === lastSerialized) return;
      st = next; lastSerialized = ser;
      search.value = st.q; sortSel.value = st.o;
      renderAll();
    },
    destroy() { clearTimeout(timer); },
  };
}
