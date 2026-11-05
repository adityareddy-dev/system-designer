// Problem page frame: slim header around the play canvas for one Practice problem.
import { h, ico, problemOf, diffBadge } from './dom.js';
import { mountPlayHost } from './playhost.js';
import { nextProblem } from './home.js';

export function renderProblem(host, ctx, route) {
  const problem = problemOf(ctx, route.parts[1]);
  if (!problem) {
    host.append(h('div', { class: 'sh-page sh-page--narrow sh-empty' },
      h('h1', { class: 'sh-h1', text: 'Problem not found' }),
      h('p', { class: 'sh-muted', text: 'That problem is not in the bank.' }),
      h('a', { class: 'sh-btn sh-btn--primary', href: '#/practice' }, 'All problems')));
    return {};
  }
  const next = nextProblem(ctx, problem.id);
  const wrap = h('div', { class: 'sh-problem' });
  const nextLink = next && next.id !== problem.id
    ? h('a', { class: 'sh-btn sh-btn--ghost sh-problem-next', href: '#/practice/' + next.id, title: `Next: ${next.title}` }, h('span', { class: 'sh-hide-sm', text: 'Next problem' }), ico('ui.chevron-right', 18))
    : null;
  const bar = h('div', { class: 'sh-problem-bar' },
    h('a', { class: 'sh-back', href: '#/practice', 'aria-label': 'Back to all problems' }, ico('ui.chevron-left', 18), h('span', { class: 'sh-hide-sm', text: 'Problems' })),
    h('div', { class: 'sh-problem-title' }, h('h1', { class: 'sh-problem-h1', text: problem.title }), h('span', { class: 'sh-problem-like sh-hide-sm', text: problem.like || '' })),
    diffBadge(problem.difficulty), nextLink);
  const interview = ['Medium', 'Hard'].includes(problem.difficulty) && route.query?.interview === '1';
  if (['Medium', 'Hard'].includes(problem.difficulty)) bar.append(h('a', { class: 'sh-btn sh-interview-toggle', href: '#/practice/' + problem.id + (interview ? '' : '?interview=1'), 'aria-pressed': String(interview), text: interview ? 'Interview mode on' : 'Interview mode' }));
  wrap.append(bar);
  host.append(wrap);

  const play = mountPlayHost(wrap, ctx, { mode: 'practice', problem, seed: 'practice', interview });
  return {
    immersive: true,
    title: problem.title,
    destroy() { play.destroy(); },
    // Exposed for the integrator's test hooks.
    get play() { return play; },
  };
}
