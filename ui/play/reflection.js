// A measured diagnosis check separates observed evidence from an ungraded prediction.
import { h } from './util.js';
export function reflectionTarget(result) {
  if (!result.nodes?.length || !result.graph?.nodes?.length) return null;
  if (result.firstFailure?.nodeId && result.nodes.some(n => n.id === result.firstFailure.nodeId)) {
    return { id: result.firstFailure.nodeId, kind: result.firstFailure.kind, percent: Math.round(result.firstFailure.util * 100), failed: true };
  }
  const busiest = result.nodes.filter(n => n.peakUtil > 0).sort((a,b) => b.peakUtil - a.peakUtil)[0];
  return busiest ? { id: busiest.id, percent: Math.round(busiest.peakUtil * 100), failed: false } : null;
}
export function reflectionCorrect(target, id, percent) {
  return id === target.id && Number.isFinite(percent) && Math.abs(percent - target.percent) <= 2;
}
export function renderReflection(result, catalog) {
  const target = reflectionTarget(result);
  if (!target) return null;
  const choice = h('select', { class: 'pl-input', required: true, 'aria-label': 'Your diagnosis' }, h('option', { value: '', text: 'Choose a part' }), result.graph.nodes.map(n => h('option', { value: n.id, text: `${n.id}: ${catalog.elementById.get(n.type)?.name || n.type}` })));
  const metric = h('input', { class: 'pl-input', type: 'number', required: true, step: 'any', min: '0', 'aria-label': 'Busy percent from the measured evidence' });
  const feedback = h('p', { role: 'status', class: 'pl-muted' });
  const time = result.firstFailure ? `${String(Math.floor(result.firstFailure.atMs / 3600000)).padStart(2,'0')}:${String(Math.floor(result.firstFailure.atMs / 60000) % 60).padStart(2,'0')}` : '';
  const form = h('form', { class: 'pl-reflection-form', onsubmit: e => {
    e.preventDefault();
    if (reflectionCorrect(target, choice.value, metric.value === '' ? NaN : Number(metric.value))) {
      feedback.textContent = target.failed ? `Evidence checked. The first material failure at ${time} was ${target.kind === 'capacity' ? 'capacity exhaustion' : target.kind === 'routing' ? 'a missing route, so extra capacity cannot repair it' : 'a dependency or outage, rather than exhausted capacity'}. The part was ${target.percent}% busy at that moment.` : `Evidence checked. This part peaked at ${target.percent}% busy. Headroom is only useful for this workload; a new request mix can move the limit.`;
      feedback.classList.add('pl-check-passed');
    } else feedback.textContent = `Recheck the ${target.failed ? 'first failure evidence' : 'part measurements'} below. Choose the part and read its busy percentage. A downstream symptom need not be the cause.`;
  } }, h('p', { text: target.failed ? `At ${time}, which part first explained the material failure? What percent busy was it then?` : 'Which part used most of its capacity during the day? What was its peak busy percentage?' }), choice, h('label', {}, h('span', { text: 'Measured busy percentage' }), metric), h('button', { class: 'pl-btn', type: 'submit', text: 'Check the evidence' }), feedback);
  const detail = h('details', { class: 'pl-reflection' }, h('summary', { text: 'Check your diagnosis' }), form);
  const n = result.graph.nodes.find(n => n.id === target.id);
  form.append(h('small', { class: 'pl-muted', text: target.failed ? `First failure evidence: ${n?.label || catalog.elementById.get(n?.type)?.name || target.id} · ${target.percent}% busy · ${target.kind}. Explain why that metric supports the cause before choosing a repair.` : 'Use the part measurements in score details. This check does not change your simulation score.' }));
  return detail;
}
