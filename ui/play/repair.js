// Repairs require a mechanism, a prediction and arithmetic before applying a player's count.
import { h } from './util.js';

function rawRepairCase(result, problem, catalog) {
  const ns = result.nextStep || {};
  const node = result.nodes?.find(n => n.id === ns.nodeId);
  const placed = result.graph.nodes.find(n => n.id === ns.nodeId);
  const el = placed && catalog.elementById.get(placed.type);
  if (node?.effectiveRpsPerUnit > 0 && node.peakRequests > 0 && ['units', 'autoscale'].includes(ns.knob) && el?.units?.max > 1) {
    const rate = Math.round(node.peakRequests * 100) / 100;
    const perUnit = Math.round(node.effectiveRpsPerUnit * 100) / 100;
    const floor = Math.max(el.units.min || 1, placed.zones || 1);
    const value = Math.min(el.units.max, Math.max(floor, Math.ceil(rate / (perUnit * .7))));
    return { kind: 'capacity', nodeId: node.id, word: el.units.label, rate, perUnit, value,
      choices: ['Increase this pool with measured headroom', 'Increase timeout and retry allowances for transient errors', 'Buffer the burst while keeping the same consumer capacity'], answer: 0,
      effects: ['Less waiting at this pool; downstream limits still need a test', 'More downstream throughput with unchanged waiting at this pool', 'Longer waiting but a lower external provider quota'], effect: 0,
      evidence: `${el.name}: ≈ ${rate} internal operations/s at the measured peak, including retries and repeat visits. One active unit processed ≈ ${perUnit} operations/s at full utilization. Target 70% utilization; minimum ${floor}, maximum ${el.units.max} units.`,
      calculation: `How many ${el.units.label} units cover that measured peak at 70% utilization? Round up, respect the minimum and cap at the maximum. If capped, reduce work as well.`,
      arithmetic: `ceil(${rate} ÷ (${perUnit} × 0.7)), bounded to ${floor}…${el.units.max} = ${value}. This is a trial size, not a recovery guarantee.`, unit: el.units.label };
  }
  const checks = result.checks || {};
  const route = /route|connect|path|finish anywhere|nothing was served/i.test(result.verdict + ' ' + ns.text);
  const safety = !route && checks.safety === false;
  const cost = !route && !safety && checks.cost === false;
  const type = Object.entries(problem.requirements.mix).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1])[0];
  const rate = problem.requirements.peakRps, percent = Math.round(type[1] * 10000) / 100;
  return { kind: 'manual', value: rate * percent / 100,
    choices: route ? ['Restore a complete path for the unserved request type', 'Increase an unrelated pool', 'Retry requests without a destination'] : safety ? ['Fix acknowledgement, uniqueness or proof at the failed safety boundary', 'Increase app capacity without changing the commit rule', 'Retry failed operations through a durable queue'] : cost ? ['Reduce the largest measured cost driver and test the resulting tradeoff', 'Raise retries to reduce the bill', 'Trim durability copies before checking the loss requirement'] : ['Reduce work or add capacity at the measured limiting boundary', 'Move work to an unbounded queue', 'Retry failures immediately'], answer: 0,
    effects: route ? ['Completion becomes possible; newly reached parts receive more load', 'A complete route guarantees latency and durability', 'Traffic disappears from the source'] : safety ? ['The failed invariant is protected; throughput alone cannot prove it', 'More throughput with the same duplicate-effect risk', 'Only the monthly bill changes'] : cost ? ['Cost may fall while headroom or freshness changes', 'Reliability is guaranteed to improve', 'Less stored history with unchanged recovery coverage'] : ['Pressure at the limiting boundary may fall; measure deadlines and downstream load', 'Queue acceptance proves completion', 'Retries remove external quotas'], effect: 0,
    evidence: `Your day served ${(result.slo.availability.actual * 100).toFixed(2)}% against ${(result.slo.availability.target * 100).toFixed(2)}%. Stated peak is ${rate} requests/s, of which ${percent}% are ${type[0]}.`,
    calculation: `How many ${type[0]} operations/s must your next experiment account for at the stated peak?`,
    arithmetic: `${rate} × ${percent} ÷ 100 = ${rate * percent / 100} operations/s.`, unit: 'operations/s' };
}

export function repairCase(result, problem, catalog) {
  const test = rawRepairCase(result, problem, catalog);
  const seed = [...problem.id].reduce((n,c) => Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const order = (items, correct, shift) => ({ items: [...items.slice(shift), ...items.slice(0,shift)], correct: (correct - shift + items.length) % items.length });
  const plans = order(test.choices, test.answer, seed % test.choices.length);
  const effects = order(test.effects, test.effect, (seed >>> 8) % test.effects.length);
  return { ...test, choices: plans.items, answer: plans.correct, effects: effects.items, effect: effects.correct };
}

export function repairCorrect(test, choice, effect, value) {
  return choice === test.answer && effect === test.effect && Number.isFinite(value) && Math.abs(value - test.value) <= (test.kind === 'capacity' ? 0 : Math.max(.01, test.value * .001));
}

export function renderRepair(result, problem, catalog, handlers) {
  const test = repairCase(result, problem, catalog);
  const select = (label, options) => h('label', {}, h('p', { text: label }), h('select', { class: 'pl-input', required: true }, h('option', { value: '', text: 'Choose' }), options.map((text, i) => h('option', { value: i, text }))));
  const plan = select('Which repair would you test?', test.choices);
  const prediction = select('What effect do you expect?', test.effects);
  const number = h('input', { class: 'pl-input', type: 'number', required: true, min: 0, step: test.kind === 'capacity' ? '1' : 'any', 'aria-label': `${test.calculation} (${test.unit})` });
  const feedback = h('p', { role: 'status', class: 'pl-muted' });
  const apply = h('button', { class: 'pl-btn pl-btn--primary', type: 'submit', text: 'Check my repair' });
  let checked = false;
  const form = h('form', { class: 'pl-sec pl-repair', 'aria-label': 'Work out a repair', onSubmit: event => {
    event.preventDefault();
    const chosen = plan.querySelector('select').value, effect = prediction.querySelector('select').value;
    const value = number.value === '' ? NaN : Number(number.value);
    if (!repairCorrect(test, chosen === '' ? null : Number(chosen), effect === '' ? null : Number(effect), value)) {
      checked = false;
      if (Number(chosen) !== test.answer || chosen === '' || Number(effect) !== test.effect || effect === '') feedback.textContent = 'Revisit the limiting boundary. Choose a repair and predict its direct effect before sizing it.';
      else { feedback.textContent = 'Recheck your arithmetic. ' + test.arithmetic; handlers.onAssisted?.(); }
      apply.textContent = 'Check my repair'; return;
    }
    if (checked) {
      if (test.kind === 'capacity') handlers.onSetNext?.({ nodeId: test.nodeId, units: value, word: test.word });
      else handlers.onBack?.();
      return;
    }
    checked = true;
    feedback.textContent = 'Plan, predicted effect and arithmetic checked. Compare the next full day with your prediction.';
    apply.textContent = test.kind === 'capacity' ? `Set my ${value} ${test.word} units` : 'Try my repair in Draw';
  } }, h('h3', { text: 'Work out the next experiment' }), h('p', { text: test.evidence }), plan, prediction,
  h('label', {}, h('p', { text: test.calculation }), number, h('small', { text: test.unit })), feedback, apply);
  form.addEventListener('input', () => { checked = false; apply.textContent = 'Check my repair'; });
  return form;
}
