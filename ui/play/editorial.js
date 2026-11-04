// Editorial: reference designs with reasoning, worked numbers, cost, trade-offs. Spoiler gate until solved.
import { h, iconEl, fmtNum, fmtUsd, approx } from './util.js';
import { iconInner } from '../../assets/icons/index.js';
import { referenceSettings } from './reference-settings.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

// Read-only wiring at the reference design's own spacing.
export function designDiagram(design, catalog) {
  const nodes = design.graph.nodes;
  const xs = nodes.map((n) => n.x), ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  // keep at least 150 px between columns and 76 px between rows, so a label fits under every box
  const colGap = Math.min(...nodes.flatMap((a) => nodes.filter((b) => b !== a && Math.abs(b.x - a.x) > 40).map((b) => Math.abs(b.x - a.x))), Infinity);
  const rowGap = Math.min(...nodes.flatMap((a) => nodes.filter((b) => b !== a && Math.abs(b.x - a.x) < 100 && Math.abs(b.y - a.y) > 30).map((b) => Math.abs(b.y - a.y))), Infinity);
  const kx = Number.isFinite(colGap) ? Math.min(3, Math.max(1, 150 / colGap)) : 1;
  const ky = Number.isFinite(rowGap) ? Math.min(3, Math.max(1, 76 / rowGap)) : 1;
  const padX = 90, padTop = 34, padBot = 56;
  const W = (maxX - minX) * kx + 2 * padX, Hh = (maxY - minY) * ky + padTop + padBot;
  const pos = new Map(nodes.map((n) => [n.ref, { x: (n.x - minX) * kx + padX, y: (n.y - minY) * ky + padTop, n }]));
  // drawn at 80 percent of its own size (labels near 10 px); a wide design scrolls sideways instead of shrinking
  const svg = s('svg', { viewBox: `0 0 ${Math.round(W)} ${Math.round(Hh)}`, class: 'pl-dg', role: 'img', 'aria-label': `Diagram of ${design.name}`, style: `width: ${Math.round(W * 0.8)}px` });
  const g = s('g', {});
  for (const [a, b] of design.graph.edges) {
    const p = pos.get(a), q = pos.get(b);
    if (!p || !q) continue;
    const dx = Math.max(30, Math.abs(q.x - p.x) / 2);
    g.append(s('path', { d: `M ${p.x + 20} ${p.y} C ${p.x + dx} ${p.y}, ${q.x - dx} ${q.y}, ${q.x - 20} ${q.y}`, class: 'pl-dg-edge' }));
  }
  for (const { x, y, n } of pos.values()) {
    const el = catalog.elementById.get(n.type);
    const grp = s('g', { transform: `translate(${x - 20} ${y - 20})` });
    const title = s('title');
    title.textContent = `${n.ref}: ${el?.name || n.type}`;
    grp.append(title);
    grp.append(s('rect', { width: 40, height: 40, rx: 11, class: 'pl-dg-node', style: `stroke: var(--cat-${el?.category || 'compute'})` }));
    const ic = s('g', { transform: 'translate(8 8)', class: 'pl-dg-ic', style: `color: var(--cat-${el?.category || 'compute'})` });
    try { ic.innerHTML = iconInner('el.' + n.type); } catch { /* icon optional */ }
    grp.append(ic);
    const t = s('text', { x: 20, y: 56, 'text-anchor': 'middle', class: 'pl-dg-label' });
    t.textContent = (n.units > 1 ? `${n.units}× ` : '') + (el?.name || n.type);
    grp.append(t);
    const ref = s('text', { x: 20, y: 71, 'text-anchor': 'middle', class: 'pl-dg-label' });
    ref.textContent = n.ref;
    grp.append(ref);
    g.append(grp);
  }
  for (const path of g.querySelectorAll('.pl-dg-edge')) {
    const length = path.getTotalLength?.();
    if (!length) continue;
    const p = path.getPointAtLength(length * 0.6), q = path.getPointAtLength(length * 0.6 + 1);
    g.append(s('path', { d: 'M -5 -4 L 0 0 L -5 4', transform: `translate(${p.x} ${p.y}) rotate(${Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI})`, class: 'pl-dg-edge' }));
  }
  svg.append(g);
  return svg;
}

function referencePreview(design, catalog, homeRegion) {
  const svg = designDiagram(design, catalog);
  const width = svg.viewBox.baseVal.width;
  const viewport = h('div', { class: 'pl-dg-wrap', tabindex: '0', role: 'region', 'aria-label': 'Reference diagram. Scroll to inspect the wiring.', style: { maxHeight: '420px', overflow: 'auto' } }, svg);
  let zoom = 0.8;
  const status = h('output', { class: 'pl-muted pl-small', 'aria-live': 'polite' });
  const out = h('button', { class: 'pl-icon-btn', type: 'button', 'aria-label': 'Zoom out reference diagram', onClick: () => setZoom(zoom / 1.25) }, iconEl('ui.zoom-out'));
  const into = h('button', { class: 'pl-icon-btn', type: 'button', 'aria-label': 'Zoom in reference diagram', onClick: () => setZoom(zoom * 1.25) }, iconEl('ui.zoom-in'));
  function setZoom(value) {
    zoom = Math.max(0.1, Math.min(2, value));
    svg.style.width = `${width * zoom}px`;
    svg.style.minWidth = '0';
    status.textContent = `${Math.round(zoom * 100)}%`;
    out.disabled = zoom <= 0.1;
    into.disabled = zoom >= 2;
  }
  setZoom(zoom);
  return h('section', { class: 'pl-sec', 'aria-label': 'Reference preview' },
    h('div', { class: 'pl-ed-actions' }, h('b', { text: 'Reference preview' }), out, into,
      h('button', { class: 'pl-btn', type: 'button', onClick: () => { setZoom((viewport.clientWidth - 2) / width); viewport.scrollTop = 0; viewport.scrollLeft = 0; } }, iconEl('ui.fit'), 'Fit'), status),
    h('p', { class: 'pl-muted pl-small', text: 'Read-only. Zoom in and scroll to follow the arrows. Settings below include defaults.' }), viewport,
    h('table', { class: 'pl-table' }, h('caption', { text: 'Reference settings' }),
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', text: 'Part' }), h('th', { scope: 'col', text: 'Settings' }))),
      h('tbody', {}, design.graph.nodes.map((node) => h('tr', {},
        h('th', { scope: 'row', text: `${node.ref}: ${catalog.elementById.get(node.type)?.name || node.type}` }),
        h('td', { text: referenceSettings(node, catalog, homeRegion) }))))));
}

export function renderEditorial(host, { problem, catalog, passed, onLoad, onClose, onShown }) {
  host.replaceChildren();
  const ed = problem.editorial;
  const root = h('div', { class: 'pl-editorial' });
  host.append(root);
  if (!ed) {
    root.append(h('h2', { class: 'pl-h2', text: 'Editorial' }), h('p', { class: 'pl-muted', text: 'No editorial for this problem yet.' }), h('button', { class: 'pl-btn', type: 'button', onClick: onClose }, 'Close'));
    return;
  }

  function show() {
    root.replaceChildren();
    onShown?.();
    const designs = ed.designs || [];
    let cur = 0;
    const view = h('div', { class: 'pl-ed-design' });
    const tabs = h('div', { class: 'pl-tabs', role: 'tablist', 'aria-label': 'Reference designs' });
    const paint = () => {
      tabs.querySelectorAll('button').forEach((b, i) => { b.classList.toggle('pl-tab--on', i === cur); b.setAttribute('aria-selected', String(i === cur)); });
      const d = designs[cur];
      view.replaceChildren();
      if (!d) return;
      // Measured in the game: a design that does not hold its own day says so, with what happened.
      const holds = d.expect?.passed !== false;
      view.append(...[
        holds ? null : h('p', { class: 'pl-ed-warn' }, iconEl('ui.warn', 16),
          h('span', {}, h('b', { text: 'Does not pass this day. ' }), `Measured in the game: ${d.expect.verdict || 'it misses at least one target.'} It is shown to teach the pattern and where it stops, not as an answer to copy.`)),
        d.why ? h('p', { class: 'pl-ed-why', text: d.why }) : null,
        referencePreview(d, catalog, problem.requirements?.homeRegion),
        h('div', { class: 'pl-ed-expect' },
          h('span', { class: 'pl-chip ' + (holds ? 'pl-chip--ok' : 'pl-chip--warn') }, iconEl(holds ? 'ui.check' : 'ui.warn', 14), holds ? 'Passes the day' : 'Does not pass'),
          d.expect?.score != null ? h('span', { class: 'pl-chip' }, iconEl('ui.trophy', 14), 'Score ', approx(Math.round(d.expect.score).toLocaleString('en-US'))) : null,
          d.expect?.costPerMonth != null ? h('span', { class: 'pl-chip' }, iconEl('ui.cost', 14), approx(fmtUsd(d.expect.costPerMonth) + '/mo')) : null,
          h('span', { class: 'pl-chip' }, `${d.graph.nodes.length} parts`)),
        h('div', { class: 'pl-ed-actions' },
          h('button', { class: 'pl-btn', type: 'button', onClick: () => onLoad?.(d, { run: false }) }, iconEl('ui.download', 16), 'Load onto my canvas'),
          h('button', { class: 'pl-btn pl-btn--primary', type: 'button', onClick: () => onLoad?.(d, { run: true }) }, iconEl('ui.play', 16), 'Load and run it'))].filter(Boolean));
    };
    designs.forEach((d, i) => tabs.append(h('button', { class: 'pl-tab', type: 'button', role: 'tab', onClick: () => { cur = i; paint(); } }, d.name, d.expect?.passed === false ? ' · does not pass' : '')));

    root.append(...[
      h('div', { class: 'pl-ed-top' }, h('div', {}, h('div', { class: 'pl-kicker', text: 'Editorial' }), h('h2', { class: 'pl-h2', text: problem.title })),
        h('button', { class: 'pl-icon-btn', type: 'button', 'aria-label': 'Close editorial', onClick: onClose }, iconEl('ui.close', 20))),
      h('p', { class: 'pl-lead', text: ed.summary }),
      designs.length > 1 ? tabs : null, view].filter(Boolean));
    if (problem.numbers?.length) {
      root.append(h('section', { class: 'pl-sec' }, h('h3', { text: 'The numbers' }),
        h('table', { class: 'pl-table' }, h('tbody', {}, problem.numbers.map((n) => h('tr', {}, h('th', { scope: 'row', text: n.label }), h('td', {}, approx(`${fmtNum(n.value)} ${n.unit || ''}`)), h('td', { class: 'pl-muted', text: n.how || '' })))))));
    }
    if (ed.tradeoffs?.length) root.append(h('section', { class: 'pl-sec' }, h('h3', { text: 'Trade-offs' }), h('ul', { class: 'pl-list' }, ed.tradeoffs.map((t) => h('li', { text: t })))));
    if (ed.realWorld) root.append(h('section', { class: 'pl-sec' }, h('h3', { text: 'In the real world' }), h('p', {}, ed.realWorld, ' ', approx('figures are approximate'))));
    paint();
  }

  if (passed) show();
  else {
    root.append(
      h('div', { class: 'pl-kicker', text: 'Editorial' }), h('h2', { class: 'pl-h2', text: 'This has spoilers' }),
      h('p', { class: 'pl-lead', text: 'The editorial shows full reference designs. You have not passed this problem yet. Want to see it anyway?' }),
      h('div', { class: 'pl-panel-foot' },
        h('button', { class: 'pl-btn pl-btn--ghost', type: 'button', onClick: onClose }, 'Keep trying'),
        h('button', { class: 'pl-btn pl-btn--primary', type: 'button', onClick: show }, 'Show me the spoilers')));
  }
}
