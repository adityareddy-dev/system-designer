// Direct paths from the basics into mechanisms, design judgment and independent practice.
import { h } from './dom.js';

export function nextTracks() {
  return h('section', { class: 'sh-next-tracks', 'aria-label': 'After the basics' },
    h('h2', { class: 'sh-h2', text: 'After the basics' }),
    h('div', { class: 'sh-next-paths' },
      h('a', { class: 'sh-next-path', href: '#/learn/consistent-hashing' },
        h('span', { class: 'sh-chapter-index', text: '01 / Work through the mechanism' }),
        h('h3', { text: 'Go deeper' }),
        h('p', { text: 'Replication, agreement, ordering and storage. Work through failure examples and calculations in five to eight minutes.' }),
        h('span', { class: 'sh-chapter-action', text: 'Explore the deeper lessons →' })),
      h('a', { class: 'sh-next-path', href: '#/learn/lead-interview' },
        h('span', { class: 'sh-chapter-index', text: '02 / Make the call' }),
        h('h3', { text: 'Lead the design' }),
        h('p', { text: 'Choose scope, defend tradeoffs, plan migrations and decide who operates the system.' }),
        h('span', { class: 'sh-chapter-action', text: 'Practice design judgment →' })),
      h('div', { class: 'sh-next-path' },
        h('span', { class: 'sh-chapter-index', text: '03 / Try it independently' }),
        h('h3', { text: 'Interview mode' }),
        h('p', { text: 'Open a problem and choose Interview mode. State assumptions, estimate load and defend your design before seeing repairs.' }),
        h('div', { class: 'sh-chip-wrap' }, h('a', { class: 'sh-chip', href: '#/practice?d=Medium', text: 'Medium problems' }), h('a', { class: 'sh-chip', href: '#/practice?d=Hard', text: 'Hard problems' })))));
}
