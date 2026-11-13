// Repairs require a mechanism, a prediction and arithmetic before applying a player's count.
import { h, fmtInt, fmtNum } from './util.js';

// The peak the full day is tested at: the stated peak (a quarter of it on a drop day), times the biggest traffic surge the day schedules.
export function testedPeak(problem, catalog) {
  const base = (problem.requirements?.peakRps || 0) * (problem.traffic?.curve === 'drop' ? 0.1 : 1);
  let factor = 1;
  for (const ev of problem.events || []) {
    const effect = catalog?.eventById?.get(ev.id)?.effects?.find(e => e.op === 'traffic' && !e.params?.types);
    const f = Number(ev.params?.factor ?? effect?.params?.factor);
    if (effect && Number.isFinite(f) && f > factor) factor = f;
  }
  return { normal: base, event: base * factor, factor, rate: Math.round(base * factor * 100) / 100 };
}

function recoveryCase(result, ns, placed, node, el, catalog) {
  const event = result.events?.find(e => e.id === ns.eventId);
  const def = catalog.eventById.get(ns.eventId);
  const name = placed?.label || el?.name || 'the affected part';
  const zones = ns.knob === 'zones';
  const region = ns.eventId === 'region-outage';
  const incident = def?.effects?.some(e => e.params?.durationSec === 'untilFixed');
  const plan = zones ? `Spread ${name} across multiple zones and test the surviving capacity`
    : region ? 'Provide a working path in a second region and test failover for every required dependency'
    : event?.story?.fix || ns.text;
  const effect = zones ? 'Capacity outside the failed zone can keep serving; recheck headroom and failover delay'
    : region ? 'Requests can move outside the failed region; recheck recovery delay and data guarantees'
    : incident ? 'Shorter detection and repair can reduce the interruption; remeasure the recovery interval'
    : 'The diagnosed event may cause fewer failures; remeasure its impact and downstream limits';
  const measured = placed ? `${name}: ${placed.zones || 1} zone${placed.zones > 1 ? 's' : ''}, ≈ ${Math.round((node?.peakUtil || 0) * 100)}% peak busy and ≈ ${fmtInt(node?.failed || 0)} failed operations.` : '';
  return {
    kind: 'recovery',
    choices: [plan, 'Add capacity in the same failure boundary without changing recovery', 'Retry failures immediately'],
    effects: [effect, 'Pressure at the limiting boundary falls just by adding units in the failed location', 'Extra retries restore the unavailable dependency'],
    evidence: [measured, event?.story?.headline || def?.name, event?.story?.hurt].filter(Boolean).join(' '),
  };
}

function rawRepairCase(result, problem, catalog) {
  const ns = result.nextStep || {};
  const node = result.nodes?.find(n => n.id === ns.nodeId);
  const placed = result.graph.nodes.find(n => n.id === ns.nodeId);
  const el = placed && catalog.elementById.get(placed.type);
  const checks = result.checks || {};
  const route = !!ns.routingIssue;
  const kind = ns.kind || (checks.availability === false ? 'reliability' : checks.latency === false ? 'latency' : checks.safety === false ? 'safety' : checks.cost === false ? 'cost' : null);
  const safety = !route && kind === 'safety';
  const cost = !route && kind === 'cost';
  const latency = !route && kind === 'latency';
  const capacity = !route && ['reliability', 'latency'].includes(kind) && (checks.availability === false || checks.latency === false);
  if (capacity && node?.peakUtil > .7 && node.effectiveRpsPerUnit > 0 && node.peakRequests > 0 && node.peakUnits > 0 && ['units', 'autoscale'].includes(ns.knob) && el?.units?.max > 1) {
    const rate = Math.round(node.peakRequests * 100) / 100;
    const perUnit = Math.round(node.effectiveRpsPerUnit * 100) / 100;
    const active = node.peakUnits, installed = node.peakInstalledUnits || active;
    const activeNeeded = Math.ceil(node.peakRequests / (node.effectiveRpsPerUnit * .7));
    const floor = Math.max(el.units.min || 1, placed.zones || 1);
    const value = Math.min(el.units.max, Math.max(floor, Math.ceil(activeNeeded * installed / active)));
    return { kind: 'capacity', nodeId: node.id, word: el.units.label, rate, perUnit, value,
      choices: ['Increase this pool with measured headroom', 'Increase timeout and retry allowances for transient errors', 'Buffer the burst while keeping the same consumer capacity'], answer: 0,
      effects: ['Less waiting at this pool; downstream limits still need a test', 'More downstream throughput with unchanged waiting at this pool', 'Longer waiting but a lower external provider quota'], effect: 0,
      evidence: `${el.name}: ≈ ${rate} internal operations/s at the measured peak, including retries and repeat visits. One active unit processed ≈ ${perUnit} operations/s at full utilization. At that peak, ${active} of ${installed} installed units survived. Target 70% utilization; minimum ${floor}, maximum ${el.units.max} units.`,
      calculation: `How many installed ${el.units.label} units cover that measured peak at 70% utilization while preserving the surviving share? Round up the active requirement, then multiply by ${installed} ÷ ${active} and round up again. Respect the minimum and cap at the maximum. If capped, reduce work as well.`,
      arithmetic: `ceil(peak work ÷ (effective capacity per active unit × 0.7)) = ${activeNeeded} active units. Then ceil(${activeNeeded} × ${installed} ÷ ${active}), bounded to ${floor}…${el.units.max} = ${value} installed units. Calculations use unrounded measurements. This is a trial size, not a recovery guarantee.`, unit: el.units.label };
  }
  const type = Object.entries(problem.requirements.mix).filter(([,v]) => v > 0).sort((a,b) => b[1]-a[1])[0];
  const tested = testedPeak(problem, catalog), rate = tested.rate, percent = Math.round(type[1] * 10000) / 100;
  const manual = { kind: 'manual', value: rate * percent / 100,
    choices: route ? ['Restore a complete path for the unserved request type', 'Increase an unrelated pool', 'Retry requests without a destination'] : safety ? ['Fix acknowledgement, uniqueness or proof at the failed safety boundary', 'Increase app capacity without changing the commit rule', 'Retry failed operations through a durable queue'] : cost ? ['Reduce the largest measured cost driver and test the resulting tradeoff', 'Raise retries to reduce the bill', 'Trim durability copies before checking the loss requirement'] : latency ? ['Reduce network travel, synchronous hops or processing time on the slow request path', 'Restore a complete path for the unserved request type', 'Increase timeout and retry allowances without shortening response time'] : ['Reduce work or add capacity at the measured limiting boundary', 'Move work to an unbounded queue', 'Retry failures immediately'], answer: 0,
    effects: route ? ['Completion becomes possible; newly reached parts receive more load', 'A complete route guarantees latency and durability', 'Traffic disappears from the source'] : safety ? ['The failed invariant is protected; throughput alone cannot prove it', 'More throughput with the same duplicate-effect risk', 'Only the monthly bill changes'] : cost ? ['Cost may fall while headroom or freshness changes', 'Reliability is guaranteed to improve', 'Less stored history with unchanged recovery coverage'] : latency ? ['Lower p99 latency for served requests; recheck availability and data guarantees', 'Completion becomes possible; newly reached parts receive more load', 'Longer timeouts make the same response arrive sooner'] : ['Pressure at the limiting boundary may fall; measure deadlines and downstream load', 'Queue acceptance proves completion', 'Retries remove external quotas'], effect: 0,
    evidence: `Your day served ${(result.slo.availability.actual * 100).toFixed(2)}% against ${(result.slo.availability.target * 100).toFixed(2)}%. ${latency ? `Worst p99 was ≈ ${result.slo.latency.worstP99Ms} ms against a target of ≈ ${result.slo.latency.targetMs} ms. ` : ''}${tested.factor > 1 ? `The day was tested at a peak of ${fmtNum(rate)} requests/s (${fmtNum(tested.normal)} normal, ${tested.factor} times that in the surge), of which ${percent}% are ${type[0]}.` : `The day was tested at a peak of ${fmtNum(rate)} requests/s, of which ${percent}% are ${type[0]}.`}`,
    calculation: `How many ${type[0]} operations/s must your next experiment account for at the tested peak?`,
    arithmetic: `${rate} × ${percent} ÷ 100 = ${rate * percent / 100} operations/s.`, unit: 'operations/s' };
  if (!route && ['reliability', 'latency'].includes(kind) && (ns.knob === 'zones' || ns.eventId && !['units', 'autoscale', 'tier'].includes(ns.knob))) {
    const recovery = recoveryCase(result, ns, placed, node, el, catalog);
    return { ...manual, ...recovery, evidence: `${recovery.evidence} ${manual.evidence}` };
  }
  return manual;
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
