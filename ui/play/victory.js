// A measured victory: replay the changed route, settle the numbers, then land the score.
import { h } from './util.js';
const svg = (tag, attrs = {}, ...kids) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); kids.forEach(k => el.append(k)); return el; };
import { iconInner } from '../../assets/icons/index.js';
import { pathsThrough } from '../../render/diagram.js';

export function victoryMetric(result, before) {
  const availability = result.slo.availability;
  if (before && before.availability >= availability.target) {
    const cost = result.slo.cost?.perMonth, budget = result.slo.cost?.budget;
    if (before.cost > budget && cost < before.cost) return { value: cost, from: before.cost, label: 'Cost / month', format: n => '≈ $' + Math.round(n).toLocaleString('en-US') };
    const p99 = result.slo.latency?.worstP99Ms;
    if (before.p99 > p99 * 1.01) return { value: p99, from: before.p99, label: 'Worst p99', format: n => Math.round(n).toLocaleString('en-US') + ' ms' };
  }
  return { value: availability.actual * 100, from: before?.availability != null ? before.availability * 100 : null,
    target: availability.target * 100, label: 'Requests served', format: n => n.toFixed(2) + '%' };
}

export function cleanSweep(result) {
  return result.passed && result.stars === 3 && result.score.total === 1000
    && !(result.efficiency || []).length && !(result.slo.safety?.promiseFailures || []).length;
}

export function victoryRepair(graph, original) {
  const baseline = new Map((original?.nodes || []).map(n => [n.id, n]));
  const changed = new Set(graph.nodes.filter(n => {
    const old = baseline.get(n.id);
    return !old || ['units', 'tier', 'zones', 'region'].some(k => old[k] !== n[k]) || JSON.stringify(old.knobs) !== JSON.stringify(n.knobs);
  }).map(n => n.id));
  const repaired = new Set([...changed].flatMap(id => [...pathsThrough(graph, id).edges]));
  const key = e => `${e.kind}:${e.from}>${e.to}`;
  const currentEdges = new Set(graph.edges.map(key)), oldEdges = new Set((original?.edges || []).map(key));
  let connectionChanged = false;
  for (const [g, otherEdges] of [[graph, oldEdges], [original, currentEdges]]) {
    for (const edge of g?.edges || []) {
      if (edge.kind !== 'flow' || otherEdges.has(key(edge))) continue;
      connectionChanged = true;
      changed.add(edge.from); changed.add(edge.to); repaired.add(edge.id);
      // Follow each side of the repaired connection without entering sibling branches.
      for (const [direction, start] of [['to', edge.from], ['from', edge.to]]) {
        const seen = new Set([start]), pending = [start];
        while (pending.length) {
          const id = pending.pop();
          for (const next of g.edges) {
            if (next.kind !== 'flow' || next[direction] !== id) continue;
            repaired.add(next.id);
            const target = next[direction === 'from' ? 'to' : 'from'];
            if (!seen.has(target)) { seen.add(target); pending.push(target); }
          }
        }
      }
    }
  }
  const changes = graph.nodes.filter(n => changed.has(n.id));
  const relevant = graph.edges.filter(e => e.kind === 'flow' && ((!changed.size && !connectionChanged) || repaired.has(e.id)));
  const ranks = new Map();
  const incoming = new Set(relevant.map(e => e.to));
  for (const n of graph.nodes) if (!incoming.has(n.id)) ranks.set(n.id, 0);
  for (let pass = 0; pass < graph.nodes.length; pass++) for (const e of relevant) if (ranks.has(e.from) && !ranks.has(e.to)) ranks.set(e.to, ranks.get(e.from) + 1);
  const route = [...relevant].sort((a, b) => (ranks.get(a.from) || 0) - (ranks.get(b.from) || 0));
  return { changes, route };
}

export function showVictory(host, { result, before, original, catalog, reduced }) {
  if (!result.passed) return;
  const graph = result.graph;
  if (!graph?.nodes?.length) return;
  const { changes, route } = victoryRepair(graph, original);
  const x0 = Math.min(...graph.nodes.map(n => n.x)) - 62, y0 = Math.min(...graph.nodes.map(n => n.y)) - 50;
  const width = Math.max(...graph.nodes.map(n => n.x)) - x0 + 62, height = Math.max(...graph.nodes.map(n => n.y)) - y0 + 70;
  const art = svg('svg', { viewBox: `${x0} ${y0} ${width} ${height}`, role: 'img', 'aria-label': 'The repaired request path, highlighted in request order' });
  route.forEach((e, i) => {
    const a = graph.nodes.find(n => n.id === e.from), b = graph.nodes.find(n => n.id === e.to);
    if (!a || !b) return;
    art.append(svg('path', { d: `M${a.x} ${a.y}L${b.x} ${b.y}`, class: 'pl-victory-wire', style: `--beat:${220 + Math.min(i, 5) * 100}ms` }));
  });
  graph.nodes.forEach(n => {
    const g = svg('g', { transform: `translate(${n.x} ${n.y})`, class: changes.some(c => c.id === n.id) ? 'pl-victory-part is-repaired' : 'pl-victory-part' });
    g.append(svg('rect', { x: -30, y: -30, width: 60, height: 60, rx: 8 }));
    const symbol = svg('g', { transform: 'translate(-16 -16) scale(1.33)', fill: 'none', stroke: 'currentColor', 'stroke-width': 2 });
    symbol.innerHTML = iconInner('el.' + n.type); g.append(symbol);
    const name = catalog.elementById.get(n.type)?.name || n.type;
    g.append(svg('text', { x: 0, y: 49, 'text-anchor': 'middle' }, name.replace(/\s*\([^)]*\)/g, '')));
    art.append(g);
  });
  const clean = cleanSweep(result);
  const { value, from, target, label, format } = victoryMetric(result, before);
  const metric = h('strong', { text: format(value) });
  const root = h('section', { class: 'pl-victory' + (clean ? ' pl-victory--sweep' : ''), 'aria-label': 'What earned this pass' },
    h('div', { class: 'pl-victory-copy' }, h('span', { class: 'pl-small', text: clean ? 'All targets held · clean sweep' : 'All targets held · passed' }),
      h('div', { class: 'pl-victory-marks', 'aria-hidden': 'true' }, ...(clean ? [0,1,2] : [0]).map(i => h('span', { style: { animationDelay: `${700 + i * 100}ms` }, text: clean ? '★' : '✓' }))),
      h('h3', { text: clean ? 'Clean sweep' : changes.length ? 'Your repair carried the day' : 'Your path held through the day' }),
      h('p', { text: changes.length ? changes.map(n => catalog.elementById.get(n.type)?.name || n.type).join(' · ') : 'Follow the surviving request path.' }),
      h('div', { class: 'pl-victory-numbers' },
        from != null ? h('span', null, h('small', { text: 'Previous day' }), h('b', { text: format(from) })) : h('span', null, h('small', { text: 'Served target' }), h('b', { text: format(target) })),
        h('span', { text: '→', 'aria-hidden': 'true' }), h('span', null, h('small', { text: label }), metric))), art);
  const summary = host.querySelector('.pl-verdict-sec');
  if (summary) summary.insertBefore(root, summary.querySelector('.pl-score-row'));
  if (reduced) return;
  const score = host.querySelector('.pl-dial-n'), arc = host.querySelector('.pl-dial-arc');
  const start = performance.now(), total = Math.round(result.score.total);
  function frame(now) {
    if (!root.isConnected) return;
    const elapsed = now - start, k = Math.min(1, Math.max(0, (elapsed - 400) / 450));
    const beforeNumber = root.querySelector('.pl-victory-numbers b');
    if (beforeNumber) beforeNumber.textContent = format((from ?? target) * Math.min(1, Math.max(0, elapsed - 250) / 350));
    metric.textContent = format((from ?? target) + (value - (from ?? target)) * k);
    const landing = Math.min(1, Math.max(0, (elapsed - 850) / 400));
    if (score) score.textContent = Math.round(total * landing).toLocaleString('en-US');
    if (arc) { const c = 2 * Math.PI * 54; arc.setAttribute('stroke-dasharray', `${total * landing / 1000 * c} ${c}`); }
    if (elapsed < 1300) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
