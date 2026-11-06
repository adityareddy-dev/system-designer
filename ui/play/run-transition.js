// Carry measured parts from the traffic canvas into the report or interview defense.
import { h, iconEl, fmtNum, fmtUsd } from './util.js';
import { transitionScreen } from '../shell/motion.js';

export function runEvidence(result) {
  const graph = result.graph;
  if (!graph?.nodes?.length) return [];
  if (!result.passed) {
    const measured = [...(result.nodes || [])];
    const cost = result.slo.cost.perMonth > result.slo.cost.budget;
    measured.sort((a, b) => cost ? b.usd - a.usd : b.failed - a.failed || b.peakUtil - a.peakUtil);
    return [graph.nodes.find(n => n.id === measured[0]?.id) || graph.nodes[0]];
  }
  let longest = [];
  let visits = 0;
  const walk = (id, path) => {
    if (++visits > 2000 || path.includes(id) || path.length >= graph.nodes.length) return;
    const next = [...path, id];
    if (next.length > longest.length) longest = next;
    for (const e of graph.edges) if (e.kind === 'flow' && e.from === id) walk(e.to, next);
  };
  const targets = new Set(graph.edges.filter(e => e.kind === 'flow').map(e => e.to));
  for (const node of graph.nodes) if (!targets.has(node.id)) walk(node.id, []);
  if (!longest.length) longest = graph.nodes.map(n => n.id);
  const ids = longest.length > 5 ? [...longest.slice(0, 2), longest[Math.floor(longest.length / 2)], ...longest.slice(-2)] : longest;
  return ids.map(id => graph.nodes.find(n => n.id === id));
}

export function carryRunIntoReport({ host, stage, scene, result, catalog, interview, reduced, render }) {
  const parts = runEvidence(result);
  const sources = [];
  const origin = stage.getBoundingClientRect();
  const badge = (part, i) => h('span', { class: 'pl-run-token', 'data-outcome': result.passed ? 'pass' : 'fail', style: { viewTransitionName: `run-token-${i}` } }, iconEl('el.' + part.type, 28));
  if (!reduced) parts.forEach((part, i) => {
    const p = scene.worldToScreen(part.x, part.y), size = Math.max(24, Math.min(80, scene.stats().zoom * 72));
    const source = badge(part, i);
    Object.assign(source.style, { position: 'fixed', left: `${origin.x + p.x - size / 2}px`, top: `${origin.y + p.y - size / 2}px`, width: `${size}px`, height: `${size}px`, zIndex: '60', pointerEvents: 'none' });
    source.dataset.outcome = result.passed ? 'pass' : 'fail';
    document.body.append(source); sources.push(source);
  });
  return transitionScreen(() => {
    sources.forEach(el => el.remove());
    render();
    const report = host.querySelector('.pl-debrief');
    if (!report || !parts.length) return;
    const measure = result.nodes?.find(n => n.id === parts[0].id);
    const costMissed = result.slo.cost.perMonth > result.slo.cost.budget;
    const detail = result.passed ? `${(result.slo.availability.actual * 100).toFixed(2)}% served through the day.`
      : costMissed ? `${catalog.elementById.get(parts[0].type)?.name}: ≈ ${fmtUsd(measure?.usd || 0)} a month.`
      : `${catalog.elementById.get(parts[0].type)?.name}: ${fmtNum(measure?.failed || 0)} failed requests · peak ${Math.round((measure?.peakUtil || 0) * 100)}% busy.`;
    const chain = h('div', { class: 'pl-run-chain', 'aria-label': parts.map(n => catalog.elementById.get(n.type)?.name).join(' to ') });
    parts.forEach((part, i) => {
      if (i) chain.append(h('span', { class: 'pl-run-arrow', 'aria-hidden': 'true', text: result.graph.edges.some(e => e.from === parts[i - 1].id && e.to === part.id) ? '→' : '…' }));
      chain.append(badge(part, i));
    });
    const evidence = h('section', { class: 'pl-run-evidence', 'data-outcome': result.passed ? 'pass' : 'fail' }, chain,
      h('div', { class: 'pl-run-evidence-copy' }, h('span', { class: 'pl-kicker', text: interview ? 'From traffic day to your defense' : 'From your traffic day' }),
        h('h3', { text: result.passed ? 'The path that held' : costMissed ? 'The part behind the cost' : 'The part that reached its limit' }), h('p', { text: detail })));
    report.prepend(evidence); report.classList.add('pl-report-arriving');
  }, { reduced, direction: 'forward' }).finally(() => sources.forEach(el => el.remove()));
}
