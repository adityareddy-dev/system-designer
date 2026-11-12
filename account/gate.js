// The sign-in page shown in place of a play page on the hosted site. Reading pages never come here.
import { h, ico } from '../ui/shell/dom.js';

const REPO = 'https://github.com/adityareddy-dev/system-designer';

// What the visitor was about to open, in words.
export function targetOf(ctx, route) {
  const [a, b] = route.parts || [];
  const c = ctx.content || {};
  if (a === 'intro') return { kind: 'Lesson', title: 'Your first system', note: 'A 3-minute guided build' };
  if (a === 'learn' && b) { const l = c.lessonById?.get?.(b) || (c.lessons || []).find((x) => x.id === b); return { kind: 'Lesson', title: l?.title || 'This lesson', note: l?.summary || '' }; }
  if (a === 'practice' && b) { const p = c.problemById?.get?.(b); return { kind: 'Practice problem', title: p?.title || 'This problem', note: p?.like || '' }; }
  if (a === 'challenge' || a === 'beat') return { kind: 'Daily challenge', title: 'Today’s challenge', note: 'The same scenario for everyone' };
  if (a === 'sandbox') return { kind: 'Sandbox', title: 'Sandbox', note: 'Any part, any traffic' };
  if (a === 'drill') return { kind: 'Quick drill', title: 'Quick drill', note: 'One minute' };
  return null;
}

export function renderGate(host, ctx, route) {
  const api = ctx.account;
  const t = targetOf(ctx, route);
  const left = h('div', { class: 'ac-gate-copy' },
    h('p', { class: 'sh-eyebrow', text: 'Free account' }),
    h('h1', { class: 'ac-gate-title', text: 'Sign in to start playing' }),
    h('p', { class: 'ac-gate-lead', text: 'System Designer is free. A Google or GitHub account lets you open the lessons, practice problems and the sandbox, and keeps your progress on every device.' }),
    t ? h('div', { class: 'ac-gate-target' }, h('span', { class: 'ac-gate-target-kind', text: t.kind }), h('b', { text: t.title }), t.note ? h('span', { class: 'ac-mini', text: t.note }) : null) : null,
    null);
  const extra = h('div', { class: 'ac-gate-extra' },
    h('ul', { class: 'ac-gate-points' },
      h('li', null, ico('ui.check', 18), 'Any progress you made on this device is kept and joined to your account.'),
      h('li', null, ico('ui.check', 18), 'No payment and no password. We store your email with your account, and email you surveys only if you tick the box.'),
      h('li', null, ico('ui.check', 18), 'Lessons, problems and guides stay open to read without signing in.')),
    h('p', { class: 'ac-gate-alt' }, 'Rather not sign in? System Designer is open source (MIT). ',
      h('a', { class: 'ac-link', href: REPO, rel: 'noopener' }, 'Run your own copy'), ' with no account at all. Or ',
      h('a', { class: 'ac-link', href: 'problems/' }, 'read the problems'), ' first.'));

  const right = h('div', { class: 'ac-gate-side' });
  const paint = () => {
    const st = api?.state?.();
    right.replaceChildren();
    if (!api || (st && (st.status === 'unreachable' || (st.status === 'ready' && !st.available)))) {
      right.append(h('div', { class: 'ac-card ac-card--note', role: 'alert' },
        h('h2', { class: 'ac-card-title', text: 'Sign-in is not reachable right now' }),
        h('p', { class: 'ac-card-lead', text: 'The sign-in service did not answer. Check your connection and try again. The readable pages still work.' }),
        h('button', { type: 'button', class: 'ac-btn ac-btn--primary', onclick: () => location.reload() }, 'Try again')));
      return;
    }
    if (!st || st.status === 'checking') {
      right.append(h('div', { class: 'ac-card ac-card--note', role: 'status' }, h('p', { class: 'ac-card-lead', text: 'Checking sign-in options' })));
      return;
    }
    right.append(api.signInCard({ headingId: undefined, heading: 'Sign in or create an account', onDone: () => {} }));
  };
  paint();
  const off = ctx.bus.on('account', (s) => { if (!s.user) paint(); });
  host.append(h('div', { class: 'sh-page ac-gate' }, left, right, extra));
  return { title: 'Sign in', destroy: off, gate: true };
}
