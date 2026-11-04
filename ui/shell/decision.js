// One decision: a 60-second quiz built from a problem's editorial design, with one part hidden. Opened from Practice.
import { h, ico, diffBadge, DIFF_ORDER } from './dom.js';

const SECONDS = 60;
// Well-known parts offered as wrong answers, when the catalog has them.
const DECOYS = ['cache', 'cdn', 'queue', 'regional-lb', 'sql-replica', 'worker-pool', 'rate-limiter', 'search-index', 'kv-store', 'circuit-breaker', 'autoscaler', 'object-store'];
const HIDE_KINDS = ['cache', 'queue', 'router', 'filter', 'store', 'compute', 'control'];

const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

function readStats(ctx) {
  try { const s = ctx.store.get('decisions', null); return s && typeof s === 'object' ? { right: s.right | 0, total: s.total | 0, streak: s.streak | 0, best: s.best | 0 } : { right: 0, total: 0, streak: 0, best: 0 }; } catch { return { right: 0, total: 0, streak: 0, best: 0 }; }
}
function writeStats(ctx, st) { try { ctx.store.set('decisions', st); } catch { /* storage may be blocked */ } }

// A question from one problem, or null when it has no editorial graph with a part worth hiding.
export function buildQuestion(ctx, problem) {
  const design = (problem.editorial?.designs || []).find((d) => d.graph?.nodes?.length);
  if (!design) return null;
  const { nodes, edges } = design.graph;
  const el = (t) => ctx.catalog.elementById.get(t);
  const hideable = nodes.filter((n) => HIDE_KINDS.includes(el(n.type)?.kind) && !n.locked);
  if (hideable.length < 1 || nodes.length < 4) return null;
  // prefer a part that is the only one of its kind: the choice then has a single clear answer
  const count = (t) => nodes.filter((n) => n.type === t).length;
  const pool = hideable.filter((n) => count(n.type) === 1);
  const pick = shuffle(pool.length ? pool : hideable)[0];
  const inGraph = new Set(nodes.map((n) => n.type));
  const decoys = shuffle(DECOYS.filter((id) => el(id) && !inGraph.has(id))).slice(0, 3);
  if (decoys.length < 2) return null;
  const options = shuffle([pick.type, ...decoys]);
  return { problem, design, nodes, edges, hidden: pick.ref, answer: pick.type, options, el };
}

// Spacing rule from the workbench: parts sit at least 150 by 120 units apart there, so here the same spacing is
// scaled to screen pixels and any pair that still touches is pushed apart.
const NODE_W = 92, NODE_H = 78, SX = 0.7, SY = 0.72;

function layout(nodes) {
  const x0 = Math.min(...nodes.map((n) => n.x)), y0 = Math.min(...nodes.map((n) => n.y));
  const pos = nodes.map((n) => ({ ref: n.ref, x: (n.x - x0) * SX, y: (n.y - y0) * SY }));
  for (let pass = 0; pass < 30; pass++) {
    let moved = false;
    for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
      const a = pos[i], b = pos[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.abs(dx) < NODE_W && Math.abs(dy) < NODE_H) {
        // push apart along the shorter way out
        if (NODE_W - Math.abs(dx) < NODE_H - Math.abs(dy)) { const m = (NODE_W - Math.abs(dx)) / 2 + 1; const sg = dx >= 0 ? 1 : -1; a.x -= sg * m; b.x += sg * m; }
        else { const m = (NODE_H - Math.abs(dy)) / 2 + 1; const sg = dy >= 0 ? 1 : -1; a.y -= sg * m; b.y += sg * m; }
        moved = true;
      }
    }
    if (!moved) break;
  }
  const mx = Math.min(...pos.map((p) => p.x)), my = Math.min(...pos.map((p) => p.y));
  const padX = NODE_W / 2 + 12, padY = NODE_H / 2 + 12;
  for (const p of pos) { p.x += padX - mx; p.y += padY - my; }
  return { pos: new Map(pos.map((p) => [p.ref, [p.x, p.y]])), w: Math.max(...pos.map((p) => p.x)) + padX, h: Math.max(...pos.map((p) => p.y)) + padY };
}

function diagram(q) {
  const { pos, w, h: ht } = layout(q.nodes);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${ht}`); svg.setAttribute('width', w); svg.setAttribute('height', ht); svg.setAttribute('class', 'sh-dec-lines'); svg.setAttribute('aria-hidden', 'true');
  for (const [a, b] of q.edges) {
    const p = pos.get(a), r = pos.get(b);
    if (!p || !r) continue;
    const l = document.createElementNS(NS, 'line');
    l.setAttribute('x1', p[0]); l.setAttribute('y1', p[1]); l.setAttribute('x2', r[0]); l.setAttribute('y2', r[1]);
    svg.append(l);
  }
  const wrap = h('div', { class: 'sh-dec-diagram', role: 'img', 'aria-label': `The design with one part hidden. The parts are ${q.nodes.filter((n) => n.ref !== q.hidden).map((n) => q.el(n.type)?.name || n.type).join(', ')}.` }, svg);
  wrap.dataset.w = w; wrap.dataset.h = ht; wrap.style.width = w + 'px'; wrap.style.height = ht + 'px';
  for (const n of q.nodes) {
    const [x, y] = pos.get(n.ref);
    const hid = n.ref === q.hidden;
    const node = h('div', { class: 'sh-dec-node' + (hid ? ' is-hidden' : ''), dataset: { ref: n.ref } },
      hid ? h('span', { class: 'sh-dec-q', text: '?' }) : ico('el.' + n.type, 26),
      h('span', { class: 'sh-dec-name', text: hid ? 'Missing part' : (q.el(n.type)?.name || n.type) }));
    node.style.left = x + 'px'; node.style.top = y + 'px';
    wrap.append(node);
  }
  return wrap;
}

// One line about why this part, in this problem: a sentence from the design's own write-up that names the part,
// else one built from what sits on either side of it.
export function reasonLine(q) {
  const an = q.el(q.answer);
  const name = (an?.name || q.answer).toLowerCase();
  const words = name.split(/\s+/).filter((w) => w.length > 3);
  const sentences = String(q.design.why || '').split(/(?<=[.!?])\s+/).filter(Boolean);
  const hit = sentences.find((t) => t.toLowerCase().includes(name)) || sentences.find((t) => words.some((w) => t.toLowerCase().includes(w)));
  if (hit) return hit;
  const nameOf = (ref) => (q.el(q.nodes.find((n) => n.ref === ref)?.type)?.name || '').toLowerCase();
  const up = [...new Set(q.edges.filter(([, b]) => b === q.hidden).map(([a]) => nameOf(a)).filter(Boolean))];
  const down = [...new Set(q.edges.filter(([a]) => a === q.hidden).map(([, b]) => nameOf(b)).filter(Boolean))];
  const rps = q.problem.requirements?.peakRps;
  const side = up.length && down.length ? `between the ${up.slice(0, 2).join(' and ')} and the ${down.slice(0, 2).join(' and ')}` : up.length ? `behind the ${up.slice(0, 2).join(' and ')}` : down.length ? `in front of the ${down.slice(0, 2).join(' and ')}` : 'in the middle of the design';
  return `For ${q.problem.title}, the ${name} sits ${side}${rps ? ` and has to keep up with about ${Math.round(rps).toLocaleString('en-US')} requests a second at the peak (approx.)` : ''}.`;
}

export async function openDecision(ctx, { pool, onClose } = {}) {
  const prev = document.activeElement;
  const overlay = h('div', { class: 'sh-dec', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'One decision, 60 seconds' });
  const card = h('div', { class: 'sh-dec-card' });
  overlay.append(card);
  document.body.append(overlay);
  let fitCurrent = () => {}; const onResize = () => fitCurrent();
  window.addEventListener('resize', onResize);
  let timer = null, closed = false, left = SECONDS, seen = new Set();

  function close() {
    if (closed) return;
    closed = true; clearInterval(timer);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    try { prev?.focus?.(); } catch { /* ignore */ }
    onClose?.();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
    if (e.key === 'Tab') {
      const f = [...overlay.querySelectorAll('button:not([disabled]),a[href]')];
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', onKey, true);

  async function nextQuestion() {
    const list = shuffle((pool && pool.length ? pool : ctx.content.problems || []).filter((p) => !seen.has(p.id)));
    // unsolved problems first
    const rookie = ctx.progress.stats().solved < 5;
    list.sort((a, b) => (ctx.progress.get(a.id)?.solvedAt ? 1 : 0) - (ctx.progress.get(b.id)?.solvedAt ? 1 : 0)
      || (rookie ? DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty] : 0));
    for (const p of list.slice(0, 12)) {
      let full = p;
      try { full = ctx.content.ensureProblem ? await ctx.content.ensureProblem(p.id) : p; } catch { continue; }
      seen.add(p.id);
      const q = full && buildQuestion(ctx, full);
      if (q) return q;
    }
    seen = new Set();
    return null;
  }

  async function show() {
    clearInterval(timer);
    card.replaceChildren(h('p', { class: 'sh-muted', role: 'status', text: 'Picking a problem' }));
    const q = await nextQuestion();
    if (closed) return;
    if (!q) {
      card.replaceChildren(h('h2', { class: 'sh-h2', text: 'No decision to show right now' }), h('p', { class: 'sh-muted', text: 'Try a wider list of problems.' }), h('button', { type: 'button', class: 'sh-btn', onclick: close }, 'Close'));
      return;
    }
    left = SECONDS;
    const bar = h('span', { class: 'sh-dec-bar-fill' });
    const clock = h('span', { class: 'sh-dec-clock', role: 'timer', 'aria-label': 'Seconds left', text: String(left) });
    const brief = h('p', { class: 'sh-lead sh-lead--sm', text: q.problem.brief || '' });
    const feedback = h('div', { class: 'sh-dec-feedback', 'aria-live': 'polite' });
    const optsEl = h('div', { class: 'sh-dec-opts', role: 'group', 'aria-label': 'Which part is missing?' });
    let done = false;

    function reveal(choice) {
      if (done) return;
      done = true; clearInterval(timer);
      const ok = choice === q.answer;
      const st = readStats(ctx); st.total += 1; if (ok) { st.right += 1; st.streak += 1; st.best = Math.max(st.best, st.streak); } else st.streak = 0; writeStats(ctx, st);
      optsEl.querySelectorAll('button').forEach((b) => {
        b.disabled = true;
        if (b.dataset.id === q.answer) b.classList.add('is-right');
        else if (b.dataset.id === choice) b.classList.add('is-wrong');
      });
      const dg = card.querySelector('.sh-dec-node.is-hidden');
      if (dg) { dg.classList.remove('is-hidden'); dg.classList.add('is-revealed'); dg.replaceChildren(ico('el.' + q.answer, 26), h('span', { class: 'sh-dec-name', text: q.el(q.answer)?.name || q.answer })); }
      const an = q.el(q.answer);
      const rl = reasonLine(q);
      const restOfWhy = String(q.design.why || '').split(rl).join(' ').replace(/\s+/g, ' ').trim();
      feedback.replaceChildren(
        h('h3', { class: 'sh-dec-verdict ' + (ok ? 'is-ok' : 'is-bad'), text: choice == null ? `Time is up. It was the ${an?.name?.toLowerCase()}.` : ok ? 'Right.' : `Not quite. It was the ${an?.name?.toLowerCase()}.` }),
        h('p', { class: 'sh-dec-reason', text: rl }),
        restOfWhy ? h('p', { class: 'sh-muted sh-small', text: restOfWhy }) : null,
        an?.tradeoff ? h('p', { class: 'sh-muted', text: `${an.name}: ${an.tradeoff}` }) : null,
        h('p', { class: 'sh-muted sh-small', text: `Streak: ${st.streak} in a row (best ${st.best}). ${st.right} of ${st.total} right so far.` }),
        h('div', { class: 'sh-dec-actions' },
          h('button', { type: 'button', class: 'sh-btn sh-btn--primary', onclick: show }, 'Another decision'),
          h('a', { class: 'sh-btn', href: '#/practice/' + q.problem.id, onclick: close }, 'Build this problem'),
          h('button', { type: 'button', class: 'sh-btn sh-btn--ghost', onclick: close }, 'Close')));
      feedback.querySelector('button')?.focus();
    }

    for (const id of q.options) {
      const e = q.el(id);
      optsEl.append(h('button', { type: 'button', class: 'sh-dec-opt', dataset: { id }, onclick: () => reveal(id) }, ico('el.' + id, 28), h('span', { class: 'sh-dec-opt-t' }, h('b', { text: e?.name || id }), h('span', { class: 'sh-muted', text: e?.description || '' }))));
    }
    const rq = q.problem.requirements || {};
    card.replaceChildren(
      h('div', { class: 'sh-dec-head' }, h('p', { class: 'sh-eyebrow', text: 'One decision · 60 seconds' }), h('button', { type: 'button', class: 'sh-icon-btn', 'aria-label': 'Close', onclick: close }, ico('ui.close', 20))),
      h('div', { class: 'sh-dec-title' }, h('h2', { class: 'sh-h2', text: q.problem.title }), diffBadge(q.problem.difficulty)),
      brief,
      rq.peakRps ? h('p', { class: 'sh-muted sh-small', text: `Peak load ≈ ${Math.round(rq.peakRps).toLocaleString('en-US')} requests a second (approx.).` }) : null,
      h('div', { class: 'sh-dec-timer' }, h('span', { class: 'sh-dec-bar' }, bar), clock),
      h('div', { class: 'sh-dec-scroll' }, diagram(q)),
      h('h3', { class: 'sh-dec-ask', text: 'Which part is missing from this design?' }),
      optsEl, feedback);
    const fit = () => {
      const sc = card.querySelector('.sh-dec-scroll'), dg = sc?.firstElementChild;
      if (!dg) return;
      const w0 = parseFloat(dg.dataset.w), h0 = parseFloat(dg.dataset.h);
      const k = Math.min(1, sc.clientWidth / w0, Math.max(150, window.innerHeight * 0.34) / h0);
      dg.style.transform = `scale(${k})`; dg.style.transformOrigin = '0 0';
      sc.style.height = h0 * k + 'px'; sc.style.width = '100%';
    };
    fitCurrent = fit; fit();
    const t0 = performance.now();
    bar.style.width = '100%';
    timer = setInterval(() => {
      left = Math.max(0, SECONDS - Math.floor((performance.now() - t0) / 1000));
      clock.textContent = String(left);
      bar.style.width = (left / SECONDS) * 100 + '%';
      if (left <= 0) reveal(null);
    }, 250);
    optsEl.querySelector('button')?.focus();
  }

  await show();
  return { close };
}
