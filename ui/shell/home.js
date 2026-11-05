// Home view: hero, the four sections with live progress, today's challenge, suggested next problem.
import { h, ico, problemOf, lessonOf, groupIdOf, diffBadge, DIFF_ORDER, GROUP_ICON } from './dom.js';
import { iconInner, hasIcon } from '../../assets/icons/index.js';
import { conceptStats, weakestConcept, totalResults } from './concepts.js';

function heroArt(ctx) {
  const motion = !ctx.reducedMotion();
  const nodes = [
    { id: 'el.web-browser', x: 20, y: 98, c: 'var(--cat-clients)' },
    { id: 'el.regional-lb', x: 160, y: 98, c: 'var(--cat-edge)' },
    { id: 'el.vm-fleet', x: 310, y: 28, c: 'var(--cat-compute)' },
    { id: 'el.vm-fleet', x: 310, y: 98, c: 'var(--cat-compute)' },
    { id: 'el.vm-fleet', x: 310, y: 168, c: 'var(--cat-compute)' },
    { id: 'el.cache', x: 450, y: 98, c: 'var(--cat-data)' },
  ];
  const paths = [
    'M92 134 C126 134 126 134 160 134',
    'M232 134 C270 134 270 64 310 64', 'M232 134 C270 134 270 134 310 134', 'M232 134 C270 134 270 204 310 204',
    'M382 64 C416 64 416 134 450 134', 'M382 134 L450 134', 'M382 204 C416 204 416 134 450 134',
  ];
  const nodeSvg = nodes.map((n) => {
    const inner = hasIcon(n.id) ? iconInner(n.id) : '';
    return `<g transform="translate(${n.x} ${n.y})"><rect width="72" height="72" rx="10" fill="var(--surface-solid)" stroke="var(--border-strong)"/>
      <path d="M12 2h48" stroke="${n.c}" stroke-width="3"/><path d="M12 61h48" stroke="var(--border)" stroke-width="4"/><path d="M12 61h32" stroke="${n.c}" stroke-width="4"/><circle cy="36" r="4" fill="var(--surface-solid)" stroke="var(--edge-idle)"/><circle cx="72" cy="36" r="4" fill="var(--surface-solid)" stroke="var(--edge-idle)"/><g transform="translate(20 16) scale(1.35)" style="color:${n.c}" fill="none" stroke="currentColor">${inner}</g></g>`;
  }).join('');
  const edgeSvg = paths.map((d, i) => `<path id="sh-hp-${i}" d="${d}" fill="none" stroke="var(--edge-idle)" stroke-width="2.5" stroke-linecap="round"/>`).join('');
  let dots = '';
  if (motion) {
    paths.forEach((_, i) => {
      for (let k = 0; k < 3; k++) {
        const shape = k === 1 ? '<rect x="-4" y="-4" width="8" height="8" rx="2" fill="var(--req-write)"/>' : '<circle r="4.5" fill="var(--req-read)"/>';
        const b = (k * 0.8 + i * 0.17).toFixed(2);
        dots += `<g opacity="0"><set attributeName="opacity" to="1" begin="${b}s"/>${shape}<animateMotion dur="${2.4 + (i % 3) * 0.3}s" begin="${b}s" repeatCount="indefinite"><mpath href="#sh-hp-${i}"/></animateMotion></g>`;
      }
    });
  }
  const el = h('div', { class: 'sh-hero-art', 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 540 270" role="presentation" focusable="false">${edgeSvg}${nodeSvg}${dots}</svg>`;
  return el;
}

function sectionCard({ href, iconId, title, text, stat, tone }) {
  return h('a', { class: 'sh-card sh-card--link sh-section-card', href, dataset: { tone } },
    h('span', { class: 'sh-section-ico' }, ico(iconId, 26)),
    h('span', { class: 'sh-section-title', text: title }),
    h('span', { class: 'sh-section-text', text }),
    h('span', { class: 'sh-section-stat', text: stat }),
    h('span', { class: 'sh-section-go', 'aria-hidden': 'true' }, ico('ui.chevron-right', 20)));
}

// First problem in suggested order that is not solved yet.
export function nextProblem(ctx, afterId) {
  // after 3 or more results, lean on the concept the player is weakest at
  try {
    const weak = weakestConcept(ctx, afterId || null);
    if (weak && ctx.progress.stats().solved >= 3) {
      const order = (a, b) => DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty];
      const p = [...weak.open].sort(order)[0];
      if (p) return Object.assign({ ...p }, { weakConcept: weak.title });
    }
  } catch { /* fall back to the fixed order */ }
  const probs = ctx.content.problems || [];
  const gi = new Map((ctx.content.groups || []).map((g, i) => [g.id || g.group?.id, i]));
  const sorted = [...probs].sort((a, b) =>
    DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty] || (gi.get(groupIdOf(ctx, a)) ?? 99) - (gi.get(groupIdOf(ctx, b)) ?? 99) || DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty]);
  if (afterId) {
    const i = sorted.findIndex((p) => p.id === afterId);
    const rest = [...sorted.slice(i + 1), ...sorted.slice(0, i)];
    return rest.find((p) => !ctx.progress.get(p.id)?.solvedAt) || rest[0] || null;
  }
  return sorted.find((p) => !ctx.progress.get(p.id)?.solvedAt) || sorted[0] || null;
}

export function renderHome(host, ctx) {
  const stats = ctx.progress.stats();
  const total = (ctx.content.problems || []).length;
  const lessonsTotal = (ctx.content.lessons || []).length;
  const seenIntro = ctx.store.get('introTaken', false) === true || ctx.progress.isLessonDone?.('intro') === true;
  let streak = 0;
  try { const s = ctx.compete.bests.streak('challenge'); streak = typeof s === 'number' ? s : s?.current || 0; } catch { /* ignore */ }

  const cta = [];
  if (lessonOf(ctx, 'intro')) {
    cta.push(h('a', { class: 'sh-btn sh-btn--primary sh-btn--lg', href: '#/intro' }, ico('ui.play', 20), seenIntro ? 'Replay the 3-minute intro' : 'Take the 3-minute intro'));
  }
  cta.push(h('a', { class: 'sh-btn sh-btn--lg', href: '#/drill' }, ico('ui.speed', 20), 'Quick drill'));
  cta.push(h('a', { class: 'sh-btn sh-btn--lg' + (lessonOf(ctx, 'intro') ? '' : ' sh-btn--primary'), href: '#/practice' }, 'Browse problems'));

  const progressLine = h('p', { class: 'sh-fine', 'aria-live': 'polite' });
  const paintAccount = () => { progressLine.textContent = ctx.account?.isSignedIn()
    ? 'Signed in. Your progress follows you across devices.'
    : 'No sign-up. Your progress stays in this browser.'; };
  paintAccount();
  const offAccount = ctx.bus.on('account', paintAccount);
  const hero = h('section', { class: 'sh-hero' },
    h('div', { class: 'sh-hero-copy' },
      h('p', { class: 'sh-eyebrow', text: 'Free and open source' }),
      h('h1', { class: 'sh-display', text: 'Build the system. Survive the day.' }),
      h('p', { class: 'sh-lead', text: 'Design real systems, from a link shortener to a bank ledger, then watch a full day of traffic flow through your design. See what held, what broke, what it cost, and why.' }),
      h('div', { class: 'sh-cta-row' }, cta),
      progressLine),
    heroArt(ctx));

  const cards = h('section', { class: 'sh-section-grid', 'aria-label': 'Sections' },
    sectionCard({ href: '#/learn', iconId: 'ui.learn', title: 'Learn', tone: 'a', text: 'Short lessons with a live demo each. Caching, queues, replicas and more, in plain words.', stat: `${stats.lessonsDone} of ${lessonsTotal || 24} lessons done` }),
    sectionCard({ href: '#/practice', iconId: 'ui.practice', title: 'Practice', tone: 'b', text: 'A bank of real problems across the whole industry. Build, survive the day, read the debrief.', stat: `${stats.solved} of ${total || 75} solved, ${stats.stars} stars` }),
    sectionCard({ href: '#/challenge', iconId: 'ui.challenge', title: 'Challenge', tone: 'c', text: 'One new scenario every day. Beat your best, then send a friend a link to beat your design.', stat: streak ? `${streak}-day streak` : 'Start a streak today' }),
    sectionCard({ href: '#/sandbox', iconId: 'ui.sandbox', title: 'Sandbox', tone: 'd', text: 'Every component and any amount of traffic. Break things on purpose; nothing is graded.', stat: 'No game over' }));

  const extras = h('div', { class: 'sh-home-extras' });

  // Today's challenge teaser
  try {
    const d = ctx.compete.daily.dailyFor();
    const p = problemOf(ctx, d.problemId);
    if (p) {
      extras.append(h('a', { class: 'sh-card sh-card--link sh-teaser', href: '#/challenge' },
        h('span', { class: 'sh-eyebrow', text: "Today's challenge" }),
        h('span', { class: 'sh-teaser-title', text: p.title }),
        h('span', { class: 'sh-muted', text: p.like || '' }),
        h('span', { class: 'sh-teaser-meta' }, diffBadge(p.difficulty))));
    }
  } catch { /* challenge needs compete; skip when absent */ }

  // Suggested next problem
  const np = nextProblem(ctx);
  if (np) {
    extras.append(h('a', { class: 'sh-card sh-card--link sh-teaser', href: '#/practice/' + np.id },
      h('span', { class: 'sh-eyebrow', text: np.weakConcept ? `Practice: ${np.weakConcept}` : stats.solved ? 'Up next' : 'Good first problem' }),
      h('span', { class: 'sh-teaser-title', text: np.title }),
      h('span', { class: 'sh-muted', text: np.like || '' }),
      h('span', { class: 'sh-teaser-meta' }, diffBadge(np.difficulty))));
  }

  // Your concepts: tries and best result per idea, weakest first
  const rows = conceptStats(ctx);
  const weakId = weakestConcept(ctx)?.id;
  const conceptStrip = rows.length ? h('section', { class: 'sh-concepts', 'aria-label': 'Your concepts' },
    h('h2', { class: 'sh-h2', text: 'Your concepts' }),
    totalResults(ctx) >= 3 && weakId ? h('p', { class: 'sh-muted', text: 'The highlighted idea has the weakest record so far. Its lesson is one tap away.' }) : null,
    h('div', { class: 'sh-concept-list' }, [...rows].sort((a, b) => (a.id === weakId ? -1 : b.id === weakId ? 1 : (a.solved / a.tried) - (b.solved / b.tried) || b.tries - a.tries)).slice(0, 8).map((r) =>
      h('a', { class: 'sh-concept', href: '#/learn/' + r.id, dataset: { weak: r.id === weakId ? '1' : '0' }, title: 'Open the lesson' },
        h('b', { text: r.title }),
        h('span', { class: 'sh-muted', text: `${r.tries} ${r.tries === 1 ? 'try' : 'tries'} · ${r.solved} of ${r.tried} solved · best ${r.best}` }),
        h('span', { class: 'sh-concept-bar', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.round((r.solved / r.tried) * 100)}%` })))))) : null;

  // Industries strip
  const groups = (ctx.content.groups || []).map((g) => ({ id: g.id || g.group?.id, title: g.title || g.group?.title }));
  const strip = groups.length ? h('section', { class: 'sh-industries', 'aria-label': 'Industries' },
    h('h2', { class: 'sh-h2', text: 'Every corner of the industry' }),
    h('div', { class: 'sh-chip-wrap' }, groups.map((g) => h('a', { class: 'sh-chip', href: `#/practice?g=${g.id}` }, ico(GROUP_ICON[g.id] || 'ui.grid', 16), g.title)))) : null;

  const foot = h('footer', { class: 'sh-footer' },
    h('span', { text: 'System Designer is free and open source (MIT). Numbers shown are approximations for learning.' }),
    h('span', null, 'Made by Aditya Reddy. Company names appear only as plain comparisons.'));

  host.append(h('div', { class: 'sh-page' }, hero, cards, extras, conceptStrip, strip, foot));
  return { title: 'Home', destroy: offAccount };
}
