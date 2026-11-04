// Sandbox traffic panel: a log-scale slider per request type, a curve picker, region shares and the event deck.
import { h, iconEl, fmtNum, debounce } from './util.js';
import { shapeSvg } from '../../assets/shapes.js';

const POS_MAX = 70; // position 0 is off; 1..70 spans 1 to 10 million req/s (10 steps per decade)
const posToRps = (p) => (p <= 0 ? 0 : Math.round(10 ** ((p - 1) / 10)));
const rpsToPos = (r) => (r <= 0 ? 0 : Math.min(POS_MAX, Math.round(Math.log10(r) * 10) + 1));

const CURVE_NAMES = {
  flat: 'Flat, all day', 'business-hours': 'Office hours', 'consumer-evening': 'Evening peak', commute: 'Commute rush', meals: 'Mealtimes',
  'market-hours': 'Market hours', 'global-follow-sun': 'Follows the sun', 'night-batch': 'Night batch', deadline: 'Deadline rush', drop: 'Ticket drop',
};

export const DEFAULT_TRAFFIC = { rps: { read: 600, write: 100, login: 50, search: 150 }, curve: 'consumer-evening', regions: { us: 0.7, eu: 0.3 } };

export function createTrafficPanel(host, { catalog, initial = DEFAULT_TRAFFIC, onChange, onFire }) {
  const state = { rps: { ...initial.rps }, curve: initial.curve, regions: { ...initial.regions } };
  const root = h('aside', { class: 'pl-traffic', 'aria-label': 'Traffic and events' });
  host.append(root);
  const emit = debounce(() => onChange?.(api.get()), 250);

  const types = catalog.requests.filter((r) => r.id !== 'attack');
  const sliders = h('div', { class: 'pl-tp-list' });
  for (const rt of types) {
    const val = h('b', { class: 'pl-mono' });
    const inp = h('input', { class: 'pl-range', type: 'range', min: '0', max: String(POS_MAX), value: String(rpsToPos(state.rps[rt.id] || 0)), 'aria-label': `${rt.name} requests per second` });
    const show = () => { const r = posToRps(+inp.value); val.textContent = r ? fmtNum(r) + '/s' : 'off'; };
    inp.addEventListener('input', () => { show(); state.rps[rt.id] = posToRps(+inp.value); emit(); });
    show();
    const shape = h('span', { class: 'pl-tp-shape', style: { color: `var(--req-${rt.family})` }, 'aria-hidden': 'true' });
    try { shape.innerHTML = shapeSvg(rt.shape, { size: 14, fill: 'currentColor' }); } catch { /* optional */ }
    sliders.append(h('label', { class: 'pl-tp-row', title: rt.description }, h('span', { class: 'pl-tp-top' }, shape, h('span', { text: rt.name }), val), inp));
  }

  const curveSel = h('select', { class: 'pl-select', 'aria-label': 'Traffic over the day' });
  Object.keys(catalog.world.curves).filter((k) => k !== 'note').forEach((k) => curveSel.append(h('option', { value: k, text: CURVE_NAMES[k] || k })));
  curveSel.value = state.curve;
  curveSel.addEventListener('change', () => { state.curve = curveSel.value; emit(); });

  const regionBox = h('div', { class: 'pl-tp-regions' });
  for (const r of catalog.world.regions) {
    const val = h('span', { class: 'pl-mono' });
    const inp = h('input', { class: 'pl-range', type: 'range', min: '0', max: '100', value: String(Math.round((state.regions[r.id] || 0) * 100)), 'aria-label': `Share of users in ${r.name}` });
    const show = () => { val.textContent = inp.value + '%'; };
    inp.addEventListener('input', () => { show(); state.regions[r.id] = +inp.value / 100; emit(); });
    show();
    regionBox.append(h('label', { class: 'pl-tp-row' }, h('span', { class: 'pl-tp-top' }, h('span', { text: r.name }), val), inp));
  }

  const groups = {};
  for (const e of catalog.events) (groups[e.group] ||= []).push(e);
  const GROUP_NAMES = { traffic: 'Traffic', data: 'Data', infra: 'Infrastructure', dependency: 'Dependencies', change: 'Changes', security: 'Security', cost: 'Cost', compliance: 'Compliance' };
  const deck = h('div', { class: 'pl-deck' });
  for (const [g, list] of Object.entries(groups)) {
    deck.append(h('div', { class: 'pl-deck-g', text: GROUP_NAMES[g] || g }),
      h('div', { class: 'pl-deck-row' }, list.map((e) => h('button', { class: 'pl-deck-b pl-sev-' + e.severity, type: 'button', title: e.description, onClick: () => onFire?.(e.id) },
        iconEl('ev.' + e.id, 18), h('span', { text: e.name })))));
  }

  const tab = (id, label, node) => ({ id, label, node });
  const tabs = [tab('traffic', 'Traffic', h('div', {}, h('div', { class: 'pl-tp-h', text: 'Requests per second at the peak' }), sliders, h('div', { class: 'pl-tp-h', text: 'Over the day' }), curveSel, h('div', { class: 'pl-tp-h', text: 'Where users are' }), regionBox)),
    tab('events', 'Event deck', h('div', {}, h('p', { class: 'pl-muted pl-small', text: 'Fire any event right now to see how your design copes.' }), deck))];
  const bar = h('div', { class: 'pl-tabs', role: 'tablist' });
  const pane = h('div', { class: 'pl-tp-pane' });
  function pick(id) {
    bar.querySelectorAll('button').forEach((b) => { const on = b.dataset.id === id; b.classList.toggle('pl-tab--on', on); b.setAttribute('aria-selected', String(on)); });
    pane.replaceChildren(tabs.find((t) => t.id === id).node);
  }
  tabs.forEach((t) => bar.append(h('button', { class: 'pl-tab', type: 'button', role: 'tab', 'data-id': t.id, onClick: () => pick(t.id) }, t.label)));
  // On a phone the panel starts folded so the diagram has room; the head opens it.
  const narrow = !!globalThis.matchMedia?.('(max-width: 899px)').matches;
  const fold = h('button', { class: 'pl-icon-btn pl-tp-fold', type: 'button', 'aria-expanded': String(!narrow), 'aria-label': 'Show or hide the traffic settings',
    onClick: () => setClosed(!root.classList.contains('pl-traffic--closed')) },
  iconEl(narrow ? 'ui.chevron-up' : 'ui.chevron-down', 18));
  function setClosed(closed) {
    root.classList.toggle('pl-traffic--closed', closed);
    fold.setAttribute('aria-expanded', String(!closed));
    fold.replaceChildren(iconEl(closed ? 'ui.chevron-up' : 'ui.chevron-down', 18));
  }
  if (narrow) root.classList.add('pl-traffic--closed');
  root.append(h('div', { class: 'pl-tp-head' }, iconEl('ui.sandbox', 18), h('b', { text: 'Sandbox traffic' }), fold), bar, pane);
  pick('traffic');

  const api = {
    el: root,
    isOpen: () => !root.classList.contains('pl-traffic--closed'),
    fold: setClosed,
    // Returns the problem fields the sandbox sim needs.
    get() {
      const entries = Object.entries(state.rps).filter(([, v]) => v > 0);
      const sum = entries.reduce((a, [, v]) => a + v, 0) || 1;
      const mix = Object.fromEntries(entries.map(([k, v]) => [k, v / sum]));
      const rs = Object.entries(state.regions).filter(([, v]) => v > 0);
      const rsum = rs.reduce((a, [, v]) => a + v, 0) || 1;
      return { peakRps: sum, mix, curve: state.curve, userRegions: Object.fromEntries(rs.map(([k, v]) => [k, v / rsum])) };
    },
    destroy() { emit.cancel(); root.remove(); },
  };
  return api;
}
