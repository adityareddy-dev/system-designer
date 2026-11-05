// A small schematic pool makes allocation and skipping failed servers visible.
import { h } from './dom.js';
export function allocate(loads, down, mode, cursor) {
  const alive = loads.map((_, i) => i).filter(i => !down.has(i));
  if (!alive.length) return -1;
  if (mode === 'least-requests') return alive.reduce((best, i) => loads[i] < loads[best] ? i : best, alive[0]);
  for (let k = 0; k < loads.length; k++) { const i = (cursor + k) % loads.length; if (!down.has(i)) return i; }
  return -1;
}
export function mountAllocation(host, ctx) {
  let mode = 'round-robin', cursor = 0, count = 0;
  const down = new Set(), jobs = [[], [], []];
  const slots = jobs.map((_, i) => h('div', { class: 'sh-pool-slot' }, `Server ${i + 1}`, h('b', { text: '0' }), h('span', { text: i === 0 ? 'Slow jobs' : 'Quick jobs' })));
  const out = h('p', { role: 'status', class: 'sh-small sh-muted', text: 'Schematic allocation. Watch the slow server hold work longer.' });
  const picker = h('select', { class: 'sh-select', 'aria-label': 'Pool allocation policy', onchange: e => { mode = e.target.value; } }, h('option', { value: 'round-robin', text: 'Round robin' }), h('option', { value: 'least-requests', text: 'Least requests' }));
  const fail = h('button', { class: 'sh-btn', type: 'button', onclick: () => { if (down.has(1)) down.delete(1); else { down.add(1); jobs[1] = []; } fail.textContent = down.has(1) ? 'Recover server 2' : 'Fail server 2'; } }, 'Fail server 2');
  const root = h('details', { class: 'sh-allocation', open: !globalThis.matchMedia?.('(max-width:719px)').matches }, h('summary', { text: 'Watch a small pool' }), h('div', { class: 'sh-btn-row' }, picker, fail), h('div', { class: 'sh-pool' }, slots), out);
  host.append(root);
  const timer = setInterval(() => {
    if (!root.open || document.hidden) return;
    count++;
    for (let i = 0; i < 3; i++) jobs[i] = jobs[i].filter(end => end > count);
    const chosen = allocate(jobs.map(q => q.length), down, mode, cursor);
    if (chosen >= 0) { jobs[chosen].push(count + (chosen === 0 ? 8 : 2)); cursor = (chosen + 1) % 3; }
    slots.forEach((slot, i) => { slot.classList.toggle('is-arrival', !ctx.reducedMotion() && i === chosen); slot.classList.toggle('is-down', down.has(i)); slot.querySelector('b').textContent = down.has(i) ? '×' : jobs[i].length; });
    out.textContent = `Request ${count} → server ${chosen + 1}. ${down.has(1) ? 'Server 2 is down and skipped. ' : ''}${mode === 'least-requests' ? 'Choose the fewest unfinished jobs.' : 'Take turns among healthy servers.'} Counts show unfinished jobs; time is schematic.`;
  }, 800);
  return () => clearInterval(timer);
}
