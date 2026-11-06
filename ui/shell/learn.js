// Learn view: lessons grouped by track, with done marks and a suggested path.
import { h, ico } from './dom.js';
import { sceneMarkup } from '../../assets/scenes/index.js';
const TRACK_SCENE = ['intro', 'load-balancing', 'sharding', 'queues-backpressure', 'idempotency-retries', 'multi-region', 'cost', 'storage-engine', 'lead-interview'];

export function renderLearn(host, ctx) {
  const lessons = ctx.content.lessons || [];
  const done = lessons.filter((l) => ctx.progress.isLessonDone(l.id)).length;
  const next = lessons.find((l) => !ctx.progress.isLessonDone(l.id));

  const tracks = [];
  for (const l of lessons) {
    let t = tracks.find((x) => x.name === l.track);
    if (!t) { t = { name: l.track || 'Lessons', items: [] }; tracks.push(t); }
    t.items.push(l);
  }

  const head = h('header', { class: 'sh-page-head' },
    h('div', null,
      h('p', { class: 'sh-eyebrow', text: 'Learn' }),
      h('h1', { class: 'sh-h1', text: 'One idea at a time' }),
      h('p', { class: 'sh-lead sh-lead--sm', text: 'Start with short lessons and live demos. Go deeper in five to eight minutes with worked examples and choices to defend. Take them in any order.' })),
    h('div', { class: 'sh-head-side' },
      h('a', { class: 'sh-btn', href: '#/drill', title: 'Ten quick questions from the lessons, with a streak' }, ico('ui.speed', 18), 'Quick drill, 1 minute'),
      h('div', { class: 'sh-progress-pill', role: 'img', 'aria-label': `${done} of ${lessons.length} lessons done` },
      h('span', { class: 'sh-progress-num', text: `${done}/${lessons.length}` }), h('span', { text: 'done' }))));

  const bar = h('div', { class: 'sh-bar', role: 'presentation' }, h('span', { class: 'sh-bar-fill' }));
  bar.firstChild.style.width = (lessons.length ? (done / lessons.length) * 100 : 0) + '%';

  const sections = tracks.map((t, ti) => {
    const grid = h('ul', { class: 'sh-lesson-grid' }, t.items.map((l) => {
      const isDone = ctx.progress.isLessonDone(l.id);
      const isNext = next && next.id === l.id;
      return h('li', null, h('a', { class: 'sh-card sh-card--link sh-lesson' + (isDone ? ' is-done' : '') + (isNext ? ' is-next' : ''), href: l.id === 'intro' ? '#/intro' : '#/learn/' + l.id },
        h('span', { class: 'sh-lesson-top' },
          h('span', { class: 'sh-lesson-ico' }, ico(isDone ? 'ui.check' : (l.icon || l.steps?.find((s) => s.icon)?.icon || 'ui.learn'), 22)),
          h('span', { class: 'sh-lesson-min' }, ico('ui.clock', 14), `${l.minutes || 3} min`)),
        
        h('span', { class: 'sh-lesson-title', text: l.title }),
        h('span', { class: 'sh-lesson-sum', text: l.summary || '' }),
        isNext ? h('span', { class: 'sh-badge', text: 'Suggested next' }) : isDone ? h('span', { class: 'sh-badge sh-badge--ok', text: 'Done' }) : null));
    }));
    const count = `${t.items.filter(l => ctx.progress.isLessonDone(l.id)).length}/${t.items.length} explored`;
    const section = h('section', { class: 'sh-track sh-chapter', 'aria-labelledby': 'sh-track-' + ti, dataset: { chapter: String(ti + 1) } });
    const button = h('button', { class: 'sh-chapter-toggle', type: 'button', 'aria-expanded': String(ti === 0), 'aria-controls': 'sh-track-list-' + ti },
      h('span', { class: 'sh-chapter-copy' }, h('span', { class: 'sh-chapter-index', text: `Field notes / ${String(ti + 1).padStart(2, '0')}` }),
        h('h2', { id: 'sh-track-' + ti, text: t.name }), h('span', { class: 'sh-track-progress', text: count }),
        h('span', { class: 'sh-chapter-action' }, ti === 0 ? 'Close track' : 'Open track', ico('ui.chevron-down', 20))),
      h('span', { class: 'sh-chapter-art', 'aria-hidden': 'true', html: sceneMarkup(TRACK_SCENE[ti]) }));
    grid.id = 'sh-track-list-' + ti; grid.hidden = ti !== 0;
    section.classList.toggle('is-open', ti === 0);
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      button.setAttribute('aria-expanded', String(open)); grid.hidden = !open; section.classList.toggle('is-open', open);
      button.querySelector('.sh-chapter-action').firstChild.textContent = open ? 'Close track' : 'Open track';
    });
    section.append(button, grid); return section;
  });

  const empty = lessons.length ? null : h('p', { class: 'sh-muted', text: 'Lessons are on their way.' });
  host.append(h('div', { class: 'sh-page sh-learn-page' }, head, bar, empty, sections));
  return { title: 'Learn' };
}
