// Learn view: lessons grouped by track, with done marks and a suggested path.
import { h, ico } from './dom.js';
import { sceneMarkup } from '../../assets/scenes/index.js';
import { nextTracks } from './next-tracks.js';

const TRACK_ICON = {
  'Start': 'ui.play', 'Scale the front': 'ui.speed', 'Scale the data': 'ui.units', 'Work later': 'ui.clock',
  'Stay correct': 'ui.safety', 'Stay up': 'ui.shield', 'Business': 'ui.budget',
  'Go deeper': 'ui.search', 'Lead the design': 'ui.users',
};

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
        h('div', { class: 'sh-bench-scene', 'aria-hidden': 'true', html: sceneMarkup(l.id) }),
        h('span', { class: 'sh-lesson-title', text: l.title }),
        h('span', { class: 'sh-lesson-sum', text: l.summary || '' }),
        isNext ? h('span', { class: 'sh-badge', text: 'Suggested next' }) : isDone ? h('span', { class: 'sh-badge sh-badge--ok', text: 'Done' }) : null));
    }));
    return h('section', { class: 'sh-track', 'aria-labelledby': 'sh-track-' + ti },
      h('h2', { class: 'sh-h2', id: 'sh-track-' + ti }, ico(TRACK_ICON[t.name] || 'ui.learn', 20), t.name, h('small', { class: 'sh-track-progress', text: `${t.items.filter(l => ctx.progress.isLessonDone(l.id)).length}/${t.items.length} explored` })),
      grid);
  });

  const empty = lessons.length ? null : h('p', { class: 'sh-muted', text: 'Lessons are on their way.' });
  host.append(h('div', { class: 'sh-page' }, head, bar, nextTracks(), empty, sections));
  return { title: 'Learn' };
}
