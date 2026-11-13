// Home view: hero, the four sections with live progress, today's challenge, suggested next problem.
import { homeFaqs, readingLinks } from '../../content/site-reading.js';
import { h, ico, problemOf, lessonOf, groupIdOf, diffBadge, DIFF_ORDER, GROUP_ICON } from './dom.js';
import { iconInner, hasIcon } from '../../assets/icons/index.js';
import { conceptStats, weakestConcept, totalResults } from './concepts.js';
import { nextTracks } from './next-tracks.js';
import { ARROW, PHASES, barWidth, barFill, heroHtml } from './hero-markup.js';

const arrow = () => { const s = document.createElement('span'); s.className = 'sh-arr-wrap'; s.innerHTML = ARROW; return s.firstChild; };

// The bench: a load balancer sharing steady traffic across three replicas. Three buttons change the picture.
// The markup comes from hero-markup.js (the same text is written into index.html); this adds the behaviour.
function wireBench(el) {
  const readout = el.querySelector('.sh-bench-rate');
  const caption = el.querySelector('.sh-bench-caption');
  const chips = el.querySelector('.sh-bench-chips');
  const svg = el.querySelector('.sh-bench-svg');
  function show(phase) {
    el.dataset.state = phase.down != null ? 'failure' : phase.bars[0] > 100 ? 'overload' : 'steady';
    readout.textContent = phase.rate;
    caption.textContent = phase.text;
    phase.bars.forEach((v, i) => {
      const bar = svg.querySelector(`[data-bar="${i}"]`);
      if (!bar) return;
      bar.setAttribute('width', String(barWidth(v)));
      bar.setAttribute('fill', barFill(v));
      const spare = svg.querySelector(`[data-spare="${i}"]`);
      if (spare) spare.textContent = phase.spare[i];
      svg.querySelector(`[data-x="${i}"]`)?.setAttribute('opacity', phase.down === i ? '1' : '0');
      svg.querySelector(`[data-replica="${i}"] .sh-rep-box`)?.setAttribute('fill', phase.down === i ? '#FFD9D0' : '#FFFCF4');
    });
    [...chips.children].forEach((b, i) => { const on = PHASES[i] === phase; b.setAttribute('aria-pressed', String(on)); b.className = 'sh-bench-chip' + (on ? ' is-on' : ''); });
  }
  [...chips.children].forEach((b, i) => b.addEventListener('click', () => show(PHASES[i])));
  show(PHASES[0]);
}

// A mode card: a coloured strip with its icon, a big number, a plain line and a link.
function modeCard({ href, iconId, label, big, title, text, extra, link, color }) {
  return h('a', { class: 'sh-mode', href, style: `--c:${color}` },
    h('div', { class: 'sh-mode-top' }, ico(iconId, 30), h('b', { text: label })),
    h('div', { class: 'sh-mode-body' },
      h('div', { class: 'sh-mode-big' + (String(big).length > 4 ? ' is-small' : ''), text: big }),
      h('h3', { text: title }),
      h('p', { text }),
      extra ? h('p', { class: 'sh-mode-extra', text: extra }) : null,
      h('span', { class: 'sh-mode-link' }, link, arrow())));
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
  const gated = !!ctx.gate?.required;
  let signedKey = null;
  let known = null; // set from the account event: the account object is not on ctx yet when it first reports
  const isIn = () => (known !== null ? known : !!ctx.account?.isSignedIn?.());

  function build() {
    const stats = ctx.progress.stats();
    const total = (ctx.content.problems || []).length;
    const lessonsTotal = (ctx.content.lessons || []).length;
    const groupsTotal = (ctx.content.groups || []).length;
    const seenIntro = ctx.store.get('introTaken', false) === true || ctx.progress.isLessonDone?.('intro') === true;
    // On the hosted site a signed-out visitor sees the public page: sign in to play, no daily challenge.
    const member = !gated || isIn();
    let streak = 0;
    try { const s = ctx.compete.bests.streak('challenge'); streak = typeof s === 'number' ? s : s?.current || 0; } catch { /* ignore */ }

    const cta = [];
    if (!member) {
      cta.push(h('button', { type: 'button', class: 'sh-btn sh-btn--primary sh-btn--lg', 'aria-haspopup': 'dialog', onclick: () => ctx.account?.openSignIn?.() }, 'Sign in to play, free', arrow()));
    } else {
      if (lessonOf(ctx, 'intro')) cta.push(h('a', { class: 'sh-btn sh-btn--primary sh-btn--lg', href: '#/intro' }, ico('ui.play', 20), seenIntro ? 'Replay the 3-minute intro' : 'Take the 3-minute intro'));
      cta.push(h('a', { class: 'sh-btn sh-btn--lg', href: '#/drill' }, ico('ui.speed', 20), 'Quick drill'));
      cta.push(h('a', { class: 'sh-btn sh-btn--lg' + (lessonOf(ctx, 'intro') ? '' : ' sh-btn--primary'), href: '#/practice' }, 'Browse problems'));
    }
    const note = !member ? 'Playing here needs a free Google or GitHub account.'
      : isIn() ? 'Signed in. Your progress follows you across devices.'
      : 'No sign-up. Your progress stays in this browser.';
    const wrap = document.createElement('div');
    wrap.innerHTML = heroHtml({ note: '', gated, moving: !ctx.reducedMotion() });
    const hero = wrap.firstElementChild;
    hero.querySelector('.sh-gate-note').textContent = note;
    hero.querySelector('.sh-cta-row').append(...cta);
    wireBench(hero.querySelector('.sh-bench'));

    let daily = null;
    if (member) {
      try { const d = ctx.compete.daily.dailyFor(); daily = problemOf(ctx, d.problemId); } catch { /* challenge needs compete */ }
    }
    const modes = [
      modeCard({ href: '#/learn', iconId: 'ui.learn', label: 'Learn', big: String(lessonsTotal || 41), title: 'lessons in nine tracks', text: 'Live demos and worked examples. Learn the building blocks, then go deeper and defend your choices.', extra: `${stats.lessonsDone} of ${lessonsTotal || 41} done`, link: 'Browse the lessons', color: 'var(--yellow)' }),
      modeCard({ href: '#/practice', iconId: 'ui.practice', label: 'Practice', big: String(total || 82), title: `problems from ${groupsTotal || 15} industries`, text: 'A bank of real problems across the whole industry. Build, survive the day, read the debrief.', extra: `${stats.solved} of ${total || 82} solved, ${stats.stars} stars`, link: 'Pick a problem', color: 'var(--mint)' }),
    ];
    if (member) modes.push(modeCard({ href: '#/challenge', iconId: 'ui.challenge', label: 'Challenge', big: '1', title: 'new scenario every day', text: 'Beat your best, then send a friend a link to beat your design.', extra: daily ? `Today: ${daily.title}${daily.difficulty ? '. ' + daily.difficulty + '.' : ''}` : (streak ? `${streak}-day streak` : ''), link: 'Start today\u2019s challenge', color: 'var(--tomato)' }));
    modes.push(modeCard({ href: '#/sandbox', iconId: 'ui.sandbox', label: 'Sandbox', big: 'No game over', title: 'every component, any traffic', text: 'Break things on purpose. Nothing is graded.', link: 'Open the sandbox', color: '#9DB4FF' }));
    const cards = h('section', { class: 'sh-modes-sec', 'aria-labelledby': 'sh-modes-h' },
      h('div', { class: 'sh-sec-head' }, h('h2', { id: 'sh-modes-h', text: modes.length === 4 ? 'Four ways to play' : 'Three ways to play' }),
        h('p', { text: member ? 'Learn the parts, practice on real problems, take the daily challenge, or build anything in the sandbox.' : 'Learn the parts, practice on real problems, or build anything in the sandbox.' })),
      h('div', { class: 'sh-modes', 'data-count': String(modes.length) }, modes));

    const steps = h('section', { class: 'sh-modes-sec', 'aria-labelledby': 'sh-how-h' },
      h('div', { class: 'sh-sec-head' }, h('h2', { id: 'sh-how-h', text: 'How a run works' }), h('p', { text: 'You draw the design. The day does the testing.' })),
      h('ol', { class: 'sh-steps-grid' },
        [['01', 'Draw the architecture', 'Place the parts on a canvas and connect them the way your design needs.'], ['02', 'Run a full day of traffic', 'Spikes, outages and retries hit your design in a simulated day.'], ['03', 'Read the debrief', 'See what held, what broke, what it cost, and why, in plain words.']]
          .map(([n, t, d]) => h('li', { class: 'sh-step-card' }, h('span', { class: 'sh-step-n', text: n }), h('h3', { text: t }), h('p', { text: d })))));

    const extras = h('div', { class: 'sh-home-extras' });
    if (member) {
      // Today's challenge teaser
      if (daily) {
        extras.append(h('a', { class: 'sh-card sh-card--link sh-teaser', href: '#/challenge' },
          h('span', { class: 'sh-eyebrow', text: "Today's challenge" }),
          h('span', { class: 'sh-teaser-title', text: daily.title }),
          h('span', { class: 'sh-muted', text: daily.like || '' }),
          h('span', { class: 'sh-teaser-meta' }, diffBadge(daily.difficulty))));
      }
      // Suggested next problem
      const np = nextProblem(ctx);
      if (np) {
        extras.append(h('a', { class: 'sh-card sh-card--link sh-teaser', href: '#/practice/' + np.id },
          h('span', { class: 'sh-eyebrow', text: np.weakConcept ? `Practice: ${np.weakConcept}` : stats.solved ? 'Up next' : 'Good first problem' }),
          h('span', { class: 'sh-teaser-title', text: np.title }),
          h('span', { class: 'sh-muted', text: np.like || '' }),
          h('span', { class: 'sh-teaser-meta' }, diffBadge(np.difficulty))));
      }
    }

    // Your concepts: tries and best result per idea, weakest first
    const rows = member ? conceptStats(ctx) : [];
    const weakId = weakestConcept(ctx)?.id;
    const conceptStrip = rows.length ? h('section', { class: 'sh-concepts', 'aria-label': 'Your concepts' },
      h('h2', { class: 'sh-h2', text: 'Your concepts' }),
      totalResults(ctx) >= 3 && weakId ? h('p', { class: 'sh-muted', text: 'The highlighted idea has the weakest record so far. Its lesson is one tap away.' }) : null,
      h('div', { class: 'sh-concept-list' }, [...rows].sort((a, b) => (a.id === weakId ? -1 : b.id === weakId ? 1 : (a.solved / a.tried) - (b.solved / b.tried) || b.tries - a.tries)).slice(0, 8).map((r) =>
        h('a', { class: 'sh-concept', href: '#/learn/' + r.id, dataset: { weak: r.id === weakId ? '1' : '0' }, title: 'Open the lesson' },
          h('b', { text: r.title }),
          h('span', { class: 'sh-muted', text: `${r.tries} ${r.tries === 1 ? 'try' : 'tries'} \u00b7 ${r.solved} of ${r.tried} solved \u00b7 best ${r.best}` }),
          h('span', { class: 'sh-concept-bar', 'aria-hidden': 'true' }, h('i', { style: `width:${Math.round((r.solved / r.tried) * 100)}%` })))))) : null;

    // Industries strip
    const groups = (ctx.content.groups || []).map((g) => ({ id: g.id || g.group?.id, title: g.title || g.group?.title }));
    const strip = groups.length ? h('section', { class: 'sh-industries', 'aria-label': 'Industries' },
      h('h2', { class: 'sh-h2', text: 'Every corner of the industry' }),
      h('div', { class: 'sh-chip-wrap' }, groups.map((g) => h('a', { class: 'sh-chip', href: `#/practice?g=${g.id}` }, ico(GROUP_ICON[g.id] || 'ui.grid', 16), g.title)))) : null;

    const reading = h('section', { class: 'sh-modes-sec site-prose', 'aria-label': 'Read and prepare' },
      h('h2', { text: 'Read and prepare' }),
      h('ul', null, readingLinks.map(([href, text]) => h('li', null, h('a', { href, text })))),
      h('h2', { text: 'Common questions' }),
      homeFaqs.map(([question, answer]) => h('section', null, h('h3', { text: question }), h('p', { text: answer }))));

    const foot = h('footer', { class: 'sh-footer' },
      h('p', null, 'System Designer is free and open source (MIT). Source on GitHub. Numbers shown are approximations for learning. Made by Aditya Reddy. Company names appear only as plain comparisons.'),
      h('div', { class: 'sh-foot-row' },
        h('a', { href: 'https://github.com/adityareddy-dev/system-designer', rel: 'noopener' }, 'GitHub'),
        h('a', { href: 'privacy.html' }, 'Privacy')));

    return h('div', { class: 'sh-page sh-home-page' }, hero, cards, steps, member ? nextTracks() : null, extras, conceptStrip, strip, reading, foot);
  }

  const paint = () => {
    const key = String(isIn());
    if (key === signedKey) return;
    signedKey = key;
    host.replaceChildren(build());
  };
  paint();
  const offAccount = ctx.bus.on('account', (st) => { known = st && 'user' in st ? !!st.user : null; paint(); });
  return { title: 'System design practice game', destroy: offAccount };
}
