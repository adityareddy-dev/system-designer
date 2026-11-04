// Step 1: read the brief and ask clarifying questions.
import { loadSummary } from './load-labels.js';
import { h, iconEl } from './util.js';

export function renderClarify(host, { problem, revealed, onReveal, onNext, snd, warm }) {
  host.replaceChildren();
  const qs = problem.clarify || [];
  const count = h('span', { class: 'pl-muted' });
  const list = h('div', { class: 'pl-qlist' });
  const upd = () => { count.textContent = `${revealed.size} of ${qs.length} asked`; };
  qs.forEach((q, i) => {
    const ans = h('div', { class: 'pl-qa', role: 'region', 'aria-live': 'polite' });
    const btn = h('button', { class: 'pl-q', type: 'button', 'aria-expanded': 'false' },
      iconEl('ui.chevron-right', 16, 'pl-ic pl-q-chev'), h('span', { text: q.q }));
    const card = h('div', { class: 'pl-qcard' }, btn, ans);
    const open = () => {
      btn.setAttribute('aria-expanded', 'true');
      card.classList.add('pl-q--open');
      ans.textContent = q.a;
    };
    btn.addEventListener('click', () => {
      if (!revealed.has(i)) { revealed.add(i); onReveal?.(i); snd?.('ui.tap'); }
      open(); upd();
    });
    list.append(card);
    if (revealed.has(i)) open();
  });
  upd();
  host.append(
    h('div', { class: 'pl-kicker', text: 'Step 1 · Clarify' }),
    h('h2', { class: 'pl-h2', text: problem.title }),
    h('p', { class: 'pl-lead', text: problem.brief || '' }),
    h('p', { class: 'pl-muted', text: loadSummary(problem) }),
    h('p', { class: 'pl-muted', text: 'Real interviews start by asking. Tap a question to hear the answer; each one changes what a good design looks like.' }),
    ...(warm ? [h('p', { class: 'pl-warmup', 'data-act': 'warm-up-note' }, iconEl('ui.info', 16), 'First day is a warm-up: lighter traffic and no spike. Build a plain design and start the day.')] : []),
    list,
    h('div', { class: 'pl-panel-foot' }, count,
      h('button', { class: 'pl-btn pl-btn--primary', type: 'button', onClick: onNext }, 'Continue to numbers')),
  );
}
