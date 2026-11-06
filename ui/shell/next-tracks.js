// Direct paths from the basics into mechanisms, design judgment and independent practice.
import { h } from './dom.js';

export function nextTracks() {
  return h('section', { class: 'sh-card', 'aria-label': 'After the basics' },
    h('h2', { class: 'sh-h2', text: 'After the basics' }),
    h('p', { class: 'sh-muted' }, h('a', { href: '#/learn/consistent-hashing', text: 'Go deeper' }), ': Work through replication, agreement, ordering and storage with failure examples and calculations.'),
    h('p', { class: 'sh-muted' }, h('a', { href: '#/learn/lead-interview', text: 'Lead the design' }), ': Practice choosing scope, defending tradeoffs, planning migrations and assigning operating responsibility.'),
    h('p', { class: 'sh-muted' }, 'Try Interview mode on ', h('a', { href: '#/practice?d=Medium', text: 'Medium' }), ' and ', h('a', { href: '#/practice?d=Hard', text: 'Hard problems' }), '. Open a problem and choose Interview mode to state your assumptions, estimate load and defend a design before seeing repairs.'));
}
