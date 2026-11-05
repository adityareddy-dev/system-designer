// The requirements card: always visible, collapsible on phones.
import { loadSummary, gradingContract } from './load-labels.js';
import { h, iconEl, fmtNum, fmtUsd, approx } from './util.js';
import { shapeSvg } from '../../assets/shapes.js';
import { latencyTarget } from '../../sim/engine.js';

const SAFETY = {
  'no-loss': 'No acknowledged write may be lost',
  'rpo-1m': 'At most 1 minute of writes may be lost',
  'best-effort': 'Best effort: small losses are tolerated',
};

export function createReqCard(host, { catalog, problem, advice = true }) {
  const r = problem.requirements || {};
  const world = catalog.world;
  const regionName = (id) => world.regions.find((x) => x.id === id)?.name || id;
  const root = h('section', { class: 'pl-req', 'aria-label': 'Requirements' });
  const head = h('button', { class: 'pl-req-head', type: 'button', 'aria-expanded': 'true', onClick: () => toggle() },
    iconEl('ui.info', 16), h('span', { class: 'pl-req-title', text: problem.title }), iconEl('ui.chevron-up', 16, 'pl-ic pl-req-chev'));
  const body = h('div', { class: 'pl-req-body' });
  if (problem.like) body.append(h('p', { class: 'pl-req-like', text: 'Think of ' + problem.like }));
  body.append(h('p', { class: 'pl-req-brief', text: problem.brief || '' }));

  const row = (iconId, label, val) => h('div', { class: 'pl-req-row' },
    iconEl(iconId, 16), h('span', { class: 'pl-req-k', text: label }), h('span', { class: 'pl-req-v' }, val));
  const rows = h('div', { class: 'pl-req-rows' });
  rows.append(row('ui.users', 'Users', r.users || '–'));
  rows.append(row('ui.rps', problem.warmUp ? 'Warm-up peak' : 'Normal peak', [approx(fmtNum(r.peakRps * (problem.traffic?.curve === 'drop' ? 0.1 : 1)) + ' req/s')]));
  if (loadSummary(problem)) body.append(h('p', { class: 'pl-muted', text: loadSummary(problem) }));
  const mixEl = h('span', { class: 'pl-mix' });
  for (const [t, share] of Object.entries(r.mix || {}).sort((a, b) => b[1] - a[1])) {
    const rt = catalog.requestById?.get(t);
    const fam = rt?.family || 'read';
    const chip = h('span', { class: 'pl-mix-chip', title: `${rt?.name || t}: ${Math.round(share * 100)}% of requests` });
    const sv = h('span', { class: 'pl-mix-shape', style: { color: `var(--req-${fam})` }, 'aria-hidden': 'true' });
    try { sv.innerHTML = shapeSvg(rt?.shape || 'circle', { size: 12, fill: 'currentColor' }); } catch { /* shape is optional */ }
    chip.append(sv, `${rt?.name || t} ${Math.round(share * 100)}%`);
    mixEl.append(chip);
  }
  rows.append(row('ui.filter', 'Mix', mixEl));
  // Effective targets per request type (a sign-in or a card payment keeps its own longer budget).
  // exactly the numbers the day is judged on: the stated target, and each type that keeps its own
  const lat = r.latencyP99Ms || {};
  const parts = [];
  const own = [];
  let usesDefault = false;
  for (const t of Object.keys(r.mix || {})) {
    const rt = catalog.requestById?.get(t);
    if (!rt || !rt.interactive) continue;
    const v = latencyTarget(lat, rt);
    if (v === lat.default) usesDefault = true;
    else own.push(`${(rt.plural || rt.name || t).toLowerCase()} ${fmtNum(v)} ms`);
  }
  if (lat.default != null && usesDefault) parts.push(own.length ? `${fmtNum(lat.default)} ms for the rest` : `${fmtNum(lat.default)} ms`);
  parts.unshift(...own);
  const latTxt = parts.join(', ');
  rows.append(row('ui.latency', 'Speed (p99)', [approx(latTxt || '–'), ' for 99 of 100 requests']));
  const av = r.availability ?? 0.99;
  rows.append(row('ui.availability', 'Uptime', `${(av * 100).toFixed(av >= 0.9999 ? 3 : av >= 0.999 ? 2 : 1)}% of requests succeed`));
  rows.append(row('ui.safety', 'Data safety', SAFETY[r.dataSafety] || r.dataSafety || '–'));
  if (r.readYourWrites) rows.append(row('ui.check', 'Fresh reads', 'People must see their own changes at once'));
  if (r.privateReads > 0) rows.append(row('ui.lock', 'Private reads', [approx(`${Math.round(r.privateReads * 100)}%`), ' of reads are personal; a shared CDN copy cannot answer them']));
  rows.append(row('ui.budget', 'Budget', [approx(fmtUsd(r.budgetPerMonth) + ' a month')]));
  const regs = Object.entries(r.userRegions || {}).map(([k, v]) => `${regionName(k)} ${Math.round(v * 100)}%`).join(', ');
  rows.append(row('ui.region', 'Where users are', regs + (r.homeRegion ? ` (home: ${regionName(r.homeRegion)})` : '')));
  if (r.compliance?.length) {
    const proofs = h('div');
    for (const id of r.compliance) {
      const def = world.complianceChecks.find((c) => c.id === id);
      const details = h('details', {}, h('summary', { text: def?.name || id }),
        h('p', { text: def?.text || '' }));
      const example = {
        encryption: 'Key management is a dependency of your servers, separate from the main request flow. Example: users → app server → SQL database, plus app server → Key management (or Hardware security module). Draw the key connection from the app server, not SQL. The game accepts a connected key service as proof.',
        'audit-log': 'An audit trail receives a copy of sensitive actions through a tap connection. Example: users → app server → SQL database, plus app server → Audit log. SQL database → Audit log is also accepted. Keep the main request path connected to the database.',
        backups: 'Connect Backups to every store holding customer data. Example: Backups → SQL database. This is a control connection beside the request path.',
      }[id];
      if (advice && example) details.append(h('p', { text: example }));
      else if (advice && def) details.append(h('p', { text: 'Add and connect ' + def.satisfiedBy.map((el) => catalog.elementById.get(el)?.name || el).join(' or ') + ' to provide this proof.' }));
      proofs.append(details);
    }
    rows.append(row('ui.shield', 'Must prove', proofs));
  }
  body.append(rows, h('p', { class: 'pl-muted', text: gradingContract(problem) }));
  if (r.notes?.length) body.append(h('ul', { class: 'pl-req-notes' }, r.notes.map((n) => h('li', { text: n }))));
  root.append(head, body);
  host.append(root);

  function toggle(force) {
    const open = force ?? root.classList.contains('pl-req--closed');
    root.classList.toggle('pl-req--closed', !open);
    head.setAttribute('aria-expanded', String(open));
  }
  if (matchMedia('(max-width: 899px)').matches) toggle(false);
  return { el: root, toggle };
}
