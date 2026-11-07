// Carry measured parts from the traffic canvas into the report or interview defense.
import { h, iconEl, fmtNum, fmtUsd } from './util.js';
import { transitionScreen } from '../shell/motion.js';

export function failureEvidence(result, catalog) {
  const nodes = result.nodes || [], graph = result.graph?.nodes || [];
  const name = id => {
    const n = graph.find(n => n.id === id);
    return n?.label || catalog?.elementById.get(n?.type)?.name || n?.type || id;
  };
  const safety = result.slo?.safety || {};
  const promise = safety?.promiseFailures?.[0];
  if (promise) {
    // Keep repair instructions behind the report's prediction check.
    return { nodeId: promise.nodeId, heading: 'The requirement that missed', detail: promise.message.split(/(?<=[.!?])\s+/)[0] };
  }
  if (result.checks?.safety === false) {
    const step = result.nextStep?.kind === 'safety' ? result.nextStep : null;
    const facts = [safety.lostWrites > 0 && `${fmtNum(safety.lostWrites)} acknowledged writes lost.`,
      safety.duplicates > 0 && `${fmtNum(safety.duplicates)} duplicate effects.`,
      safety.staleReads > 0 && `${fmtNum(safety.staleReads)} stale reads.`,
      safety.compliance?.failed?.length && 'Required compliance checks failed.'].filter(Boolean);
    return { nodeId: step?.nodeId, heading: 'The safety requirement that missed', detail: facts.join(' ') };
  }
  const first = result.checks?.availability === true ? null : result.firstFailure;
  const waiting = result.queues?.find(q => q.id === first?.nodeId && q.lateMessages > 0);
  if (waiting) return { nodeId: waiting.id, heading: 'Where work waited too long', detail: `${name(waiting.id)}: oldest observed wait about ${fmtNum(waiting.maxWaitSec)} seconds against a ${fmtNum(waiting.limitSec)} second deadline; ${fmtNum(waiting.lateMessages)} jobs late.` };
  if (first?.nodeId) {
    const measure = nodes.find(n => n.id === first.nodeId);
    if (first.kind === 'routing') return { nodeId: first.nodeId, heading: 'Where the route stopped', detail: `${name(first.nodeId)}: requests had no complete delivery route.` };
    if (first.util === null) return { nodeId: first.nodeId, heading: 'The part to inspect', detail: `${name(first.nodeId)}: capacity was unavailable when requests first failed.` };
    const saturated = first.kind === 'capacity' && first.util >= 1 && measure?.failed > 0;
    return { nodeId: first.nodeId, heading: saturated ? 'The part that reached its limit' : 'The part to inspect',
      detail: `${name(first.nodeId)}: ${fmtNum(measure?.failed || 0)} failed requests · peak ${measure?.peakUtil > 5 ? 'over 500' : Math.round((measure?.peakUtil || 0) * 100)}% busy.` };
  }
  const cost = result.slo?.cost;
  if (cost?.budget > 0 && cost.perMonth > cost.budget) {
    const top = [...nodes].sort((a, b) => b.usd - a.usd)[0];
    return { nodeId: top?.id, heading: 'The part behind the cost', detail: `${name(top?.id)}: ≈ ${fmtUsd(top?.usd || 0)} a month.` };
  }
  if (result.checks?.latency === false) {
    const slow = Object.values(result.slo.latency.byType || {}).filter(t => t.costlyHop).sort((a, b) => a.shareOk - b.shareOk)[0];
    return { nodeId: slow?.costlyHop.nodeId, heading: 'The speed target that missed', detail: `Worst p99 was ≈ ${fmtNum(slow?.worstP99Ms ?? result.slo.latency.worstP99Ms)} ms against a ≈ ${fmtNum(slow?.targetMs ?? result.slo.latency.targetMs)} ms target.` };
  }
  const measured = [...nodes].filter(n => n.failed > 0).sort((a, b) => b.peakUtil - a.peakUtil)[0];
  return { nodeId: measured?.id, heading: measured?.peakUtil >= 1 ? 'The part that reached its limit' : 'The part to inspect',
    detail: result.verdict || 'Inspect the failed requirements and part measurements below.' };
}

export function runEvidence(result, { catalog, traces = [] } = {}) {
  const graph = result.graph;
  if (!graph?.nodes?.length) return [];
  if (!result.passed) {
    const part = graph.nodes.find(n => n.id === failureEvidence(result, catalog).nodeId);
    return part ? [part] : [];
  }
  let longest = [];
  const measured = new Set((result.nodes || []).filter(n => n.peakRequests > 0).map(n => n.id));
  const sources = graph.nodes.filter(n => catalog?.elementById.get(n.type)?.kind === 'source');
  for (const trace of traces) {
    const used = new Set(trace.edgeIds);
    const edges = graph.edges.filter(e => e.kind === 'flow' && used.has(e.id));
    const memo = new Map(), visiting = new Set();
    const walk = id => {
      if (!measured.has(id) || visiting.has(id)) return [];
      if (memo.has(id)) return memo.get(id);
      visiting.add(id);
      let tail = [];
      for (const e of edges) if (e.from === id) {
        const next = walk(e.to);
        if (next.length > tail.length) tail = next;
      }
      visiting.delete(id);
      const path = [id, ...tail]; memo.set(id, path); return path;
    };
    for (const source of sources) if (trace.nodeIds.includes(source.id)) {
      for (const e of edges) if (e.from === source.id) {
        const tail = walk(e.to);
        if (tail.length && tail.length + 1 > longest.length) longest = [source.id, ...tail];
      }
    }
  }
  const ids = longest.length > 5 ? [...longest.slice(0, 2), longest[Math.floor(longest.length / 2)], ...longest.slice(-2)] : longest;
  return ids.map(id => graph.nodes.find(n => n.id === id));
}

export function carryRunIntoReport({ host, stage, scene, result, catalog, traces, interview, reduced, render }) {
  const parts = runEvidence(result, { catalog, traces });
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
    if (render() === false) return;
    const report = host.querySelector('.pl-debrief');
    if (!report) return;
    const { heading, detail } = result.passed
      ? { heading: parts.length ? 'The path that held' : 'The day that held', detail: `${(result.slo.availability.actual * 100).toFixed(2)}% served through the day.` }
      : failureEvidence(result, catalog);
    const chain = h('div', { class: 'pl-run-chain', 'aria-label': parts.map(n => catalog.elementById.get(n.type)?.name).join(' to ') });
    parts.forEach((part, i) => {
      if (i) chain.append(h('span', { class: 'pl-run-arrow', 'aria-hidden': 'true', text: result.graph.edges.some(e => e.from === parts[i - 1].id && e.to === part.id) ? '→' : '…' }));
      chain.append(badge(part, i));
    });
    const evidence = h('section', { class: 'pl-run-evidence', 'data-outcome': result.passed ? 'pass' : 'fail' }, chain,
      h('div', { class: 'pl-run-evidence-copy' }, h('span', { class: 'pl-kicker', text: interview ? 'From traffic day to your defense' : 'From your traffic day' }),
        h('h3', { text: heading }), h('p', { text: detail })));
    report.prepend(evidence); report.classList.add('pl-report-arriving');
  }, { reduced, direction: 'forward', kind: 'run' }).finally(() => sources.forEach(el => el.remove()));
}
