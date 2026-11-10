// Candidate-led preparation, graph-specific defense and an honest local interview record.
import { h, fmtNum, fmtUsd } from './util.js';
import { estimateUnit, estimateFeedback } from './estimate-units.js';
import { mountDefense } from '../defense.js';
import { claimsFor, checkClaim, summarizeClaims } from '../../content/problems/defense-claims.js';

import { questionAnalysis } from './question-topics.js';
export function questionCoverage(text, questions) { return questionAnalysis(text, questions).coverage; }

export function defenseQuestions(problem, graph, result, catalog) {
  const name = n => n?.label || catalog.elementById.get(n?.type)?.name || n?.type;
  const pool = graph.nodes.find(n => catalog.elementById.get(n.type)?.kind === 'compute' && n.units > 1);
  const cache = graph.nodes.find(n => catalog.elementById.get(n.type)?.kind === 'cache');
  const store = graph.nodes.find(n => catalog.elementById.get(n.type)?.kind === 'store');
  const event = result.events?.find(e => e.hurt?.length) || result.events?.[0];
  const measured = result.nodes?.filter(n => n.peakUtil > 0).sort((a,b) => b.peakUtil - a.peakUtil)[0];
  const questions = [];
  if (cache) questions.push({ kind: 'cache', nodeId: cache.id, q: `Your ${name(cache)} just died. What reaches its downstream parts in the next minute?`, model: 'Hits become misses. Size and measure the origin for cold traffic, collapse repeated misses and refill gradually. A limiter protects capacity by rejecting work, which still affects availability.', checklist: ['Describe the cold miss rate', 'Check downstream spare capacity', 'Explain one protection and its availability cost'] });
  if (pool) {
    const routed = graph.edges.some(e => e.to === pool.id && catalog.elementById.get(graph.nodes.find(n => n.id === e.from)?.type)?.kind === 'router');
    questions.push({ kind: 'pool', nodeId: pool.id, q: `You drew ${pool.units} units of ${name(pool)}${routed ? ' behind a router' : ' without a separate router'}. How does one request choose a replica, and what happens when one fails?`, model: `The simulation treats a pool as one aggregate endpoint with internal distribution. ${routed ? 'Your router provides a visible entry point.' : 'Your graph leaves that routing implicit.'} A real deployment needs discovery, health checks and a distribution policy. With one replica gone, the remaining units receive more work; calculate N/(N−1) times the previous load and include detection delay.`, checklist: ['State where discovery and routing live', 'Explain health detection and redistribution', 'Calculate surviving capacity and account for delay'] });
  }
  if (store) questions.push({ kind: 'partition', nodeId: store.id, q: `What key would you use to partition ${name(store)}? Your largest customer grows tenfold. What happens?`, model: 'Choose a key from the workload, describe its distribution and show how one large tenant can exhaust a shard. Compare splitting a tenant across buckets with the extra read fanout and coordination. More nodes do not automatically split a single hot key.', checklist: ['Name a concrete partition key', 'Describe skew for the largest tenant', 'Explain mitigation and its read or consistency cost'] });
  if (event) questions.push({ kind: 'event', nodeId: event.hurt?.[0] || event.nodeIds?.[0] || measured?.id, q: `At ${new Date(event.atMs).toISOString().slice(11,16)}, ${event.name} hit. Which part, if any, failed first, and what evidence distinguishes capacity from routing or dependency failure?`, model: `${event.story?.headline || ''} ${event.story?.hurt || ''} ${result.nextStep?.text || ''} Correlate the event time with overloaded minutes and failed requests; a busy part alone is not proof of cause.`, checklist: ['Identify the affected path and time', 'Quote a measured utilization or failure metric', 'Distinguish the initiating cause from a downstream symptom'] });
  else if (measured) questions.push({ kind: 'capacity', nodeId: measured.id, q: `${name(graph.nodes.find(n => n.id === measured.id))} peaked at ${Math.round(measured.peakUtil * 100)}% busy. What extra workload would invalidate your design?`, model: 'Use spare capacity at the busiest hop, then account for the request mix and retries. A new workload may move the bottleneck. Verify it with a new load test rather than assuming linear scaling.', checklist: ['Use the observed peak', 'Name a workload change', 'Explain how to verify the new limit'] });
  const cost = result.slo.cost.perMonth;
  questions.push({ kind: 'cost', nodeId: null, q: `This costs about ${fmtUsd(cost)}/month. Remove 30%, about ${fmtUsd(cost * .3)}. What do you cut, and what breaks?`, model: `Start with the largest cost line: ${[...result.slo.cost.lines].sort((a,b) => (b.usd || b.perMonth || 0) - (a.usd || a.perMonth || 0))[0]?.label || 'inspect the cost breakdown'}. Compare reducing idle units, retained data and usage. Preserve the required durability and show the loss of burst or failure headroom. State the metric you would watch before keeping the saving.`, checklist: ['Identify a real cost line and saving', 'Name a resulting reliability, speed or data tradeoff', 'Describe a measurement and rollback threshold'] });
  if (questions.length < 3) questions.push({ kind: 'route', nodeId: graph.nodes.find(n => catalog.elementById.get(n.type)?.kind === 'source')?.id, q: `Your graph has ${graph.nodes.length} parts and ${graph.edges.filter(e => e.kind === 'flow').length} delivery connections. Trace a ${Object.keys(problem.requirements.mix)[0]} request from its source to an answer. Where can it stop?`, model: `${result.nextStep.text} A complete path must start at the source that sends that request type and end at a capable destination. A disconnected store does not help.`, checklist: ['Name the source and every hop', 'Identify the destination or missing route', 'Explain what the caller sees when a hop fails'] });
  if (questions.length < 3) questions.push({ kind: 'latency', nodeId: measured?.id, q: `Your users span ${Object.keys(problem.requirements.userRegions).join(', ')}. Which network round trips belong in your latency budget?`, model: 'Include the user-to-service trip and every synchronous cross-region dependency. Moving one service alone can leave the slowest round trip intact. Distinguish observed latency from requests that never got a response.', checklist: ['Trace user and dependency round trips', 'Separate service time from network time', 'Explain one region placement tradeoff'] });
  return questions.slice(0, 5).map(question => {
    const related = graph.nodes.find(n => n.id === question.nodeId);
    const metrics = result.nodes?.find(n => n.id === related?.id);
    const alternative = question.kind === 'cache' ? 'Compare coalesced refill with request shedding; state the availability cost.' : question.kind === 'partition' ? 'Compare tenant bucketing with a single tenant shard; state the read fanout cost.' : question.kind === 'pool' ? 'Compare health-aware routing with static distribution; state the detection-delay risk.' : question.kind === 'cost' ? 'Compare trimming idle capacity with reducing usage; state which required guarantee each risks.' : 'Compare a capacity repair with a routing or dependency repair; say which measured symptom distinguishes them.';
    const evidence = [
      ...(question.kind === 'cost' ? [...result.slo.cost.lines].sort((a,b) => (b.usd || b.perMonth || 0) - (a.usd || a.perMonth || 0)).slice(0,3).map(line => line.label + ': ≈ ' + fmtUsd(line.usd || line.perMonth || 0) + '/month.') : []),
      ...(question.kind === 'cache' ? graph.edges.filter(e => e.from === related.id && e.kind === 'flow').map(e => {
        const downstream = graph.nodes.find(n => n.id === e.to);
        const measured = result.nodes?.find(n => n.id === e.to);
        return 'Downstream origin: ' + name(downstream) + (measured ? ': peak ' + Math.round(measured.peakUtil * 100) + '% busy; ' + (measured.minutesOverloaded || 0) + ' overloaded minutes; ' + fmtNum(measured.failed || 0) + ' failed operations.' : ': no utilization was measured.');
      }) : []),
      'Your run: ' + (result.slo.availability.actual * 100).toFixed(2) + '% served, target ' + (result.slo.availability.target * 100).toFixed(2) + '%.',
      'Worst p99: ≈ ' + Math.round(result.slo.latency.worstP99Ms) + ' ms. Cost: ≈ ' + fmtUsd(cost) + '/month, budget ' + fmtUsd(result.slo.cost.budget) + '.',
      metrics ? name(related) + ': peak ' + Math.round(metrics.peakUtil * 100) + '% busy; ' + (metrics.minutesOverloaded || 0) + ' overloaded minutes; ' + fmtNum(metrics.failed || 0) + ' failed operations.' : 'No utilization was measured for this part. Do not infer spare capacity from missing data.',
      event ? 'Event at ' + new Date(event.atMs).toISOString().slice(11,16) + ': ' + event.name + '. ' + (event.story?.headline || '') + ' ' + (event.story?.hurt || '') : 'No event evidence was recorded.',
    ];
    const costQuestion = question.kind === 'cost';
    const measuredPoint = costQuestion ? 'Quote the largest monthly cost line, calculate the 30% saving, and compare the result with the ' + fmtUsd(result.slo.cost.budget) + ' budget.' : metrics ? 'Quote ' + name(related) + ' at ' + Math.round(metrics.peakUtil * 100) + '% peak busy and ' + (metrics.minutesOverloaded || 0) + ' overloaded minutes; relate it to the ' + (result.slo.availability.actual * 100).toFixed(2) + '% served result.' : 'Quote the event time and served share above; distinguish an unmeasured part from a part with available capacity.';
    const stopPoint = costQuestion ? 'Set a numeric stop threshold for served share or p99 after the cut, using the stated targets; name the previous capacity or retention setting to restore.' : 'Set a numeric failure or p99 stop threshold against the ' + (result.slo.availability.target * 100).toFixed(2) + '% served target; name the previous routing, retry or ownership configuration to restore.';
    return { ...question, claims: claimsFor(question, problem, graph, catalog, result), evidence, checklist: [question.checklist[0], measuredPoint, alternative, stopPoint] };
  });
}

export function createInterview(problem) {
  return { stage: 'questions', questions: '', coverage: [], requirements: '', estimates: {}, committed: false, startedAt: Date.now(), run: false, defense: [], complete: false };
}

const button = (text, action, primary = true) => h('button', { class: 'pl-btn' + (primary ? ' pl-btn--primary' : ''), type: 'button', onClick: action }, text);
const writing = (label, value, update) => h('label', { class: 'pl-defense-field' }, h('span', { text: label }), h('textarea', { class: 'pl-input', rows: 5, required: true, minlength: 20, maxlength: 6000, text: value, onInput: e => update(e.target.value) }));

export function renderInterviewPrep(host, problem, state, ready, onStage = () => {}) {
  onStage(state.stage);
  host.replaceChildren(h('div', { class: 'pl-kicker', text: 'Interview mode · You lead' }), h('h2', { class: 'pl-h2', text: problem.title }), h('p', { class: 'pl-lead', text: problem.brief }));
  const draw = () => renderInterviewPrep(host, problem, state, ready, onStage);
  const notice = h('p', { role: 'status', class: 'pl-muted' });
  if (state.stage === 'questions') {
    host.append(h('p', { text: 'Ask your own questions before seeing the interviewer’s list. Include scale, scope and failure expectations. Matching checks keywords and topic synonyms. Unmatched wording gets a closest-topic comparison; it is not graded wrong.' }), writing('What would you ask?', state.questions, v => state.questions = v), notice,
      button('Commit questions', () => {
        if (state.questions.trim().length < 20) { notice.textContent = 'Write your questions first, at least 20 characters.'; return; }
        const analysis = questionAnalysis(state.questions, problem.clarify); state.coverage = analysis.coverage; state.closest = analysis.closest; state.stage = 'answers'; draw();
      }));
  } else if (state.stage === 'answers') {
    const topicLabel = i => {
      if (!state.coverage[i]) return 'Not matched automatically';
      const selfAssigned = state.closest?.some(row => row.selfAssigned === i);
      const automatic = state.closest?.some(row => row.matches?.some(match => match.question === i));
      return selfAssigned && !automatic ? 'Self-assigned topic' : 'Topic matched';
    };
    host.append(h('p', { text: `${state.coverage.filter(Boolean).length} of ${problem.clarify.length} topics recorded. Read every answer, including topics the wording check may have missed. Self-assigned topics are marked below.` }), ...problem.clarify.map((q,i) => h('section', { class: 'pl-sec' }, h('b', { text: `${topicLabel(i)} · ${q.q}` }), h('p', { text: q.a }), h('small', { text: `Design implication: ${implication(q)}` }))), button('Write requirements', () => { state.stage = 'requirements'; draw(); }));
    host.append(h('p', { class: 'pl-muted', text: 'This is a wording check. Automatic matches and self-assigned topics do not grade your questions.' }));
    host.append(...(state.closest || []).map(q => {
      if (q.matched) return h('section', { class: 'pl-sec' }, h('p', { text: `Your question: ${q.text}` }), (q.matches || [{ question: q.question, phrase: q.phrase }]).map(m => h('p', { class: 'pl-muted', text: `Matched phrase: “${m.phrase}”. Topic: ${problem.clarify[m.question]?.q}` })));
      const select = h('select', { class: 'pl-input', 'aria-label': 'Assign your question to a topic', onChange: e => {
        q.selfAssigned = e.target.value === '' ? null : Number(e.target.value);
        state.coverage = problem.clarify.map((_, i) => state.closest.some(row => row.matches?.some(m => m.question === i) || row.selfAssigned === i));
        draw();
      } }, h('option', { value: '', text: 'Choose a topic yourself' }), problem.clarify.map((topic, i) => h('option', { value: i, selected: q.selfAssigned === i, text: topic.q })));
      return h('section', { class: 'pl-sec' }, h('p', { text: `Your question: ${q.text}. No phrase matched. Closest topic to compare: ${problem.clarify[q.question]?.q}` }), select,
        q.selfAssigned != null ? h('small', { text: 'Self-assigned by you. This is a wording check.' }) : null);
    }));
  } else if (state.stage === 'requirements') {
    host.append(writing('What will you build, exclude, and measure? State your target numbers.', state.requirements, v => state.requirements = v), notice,
      button('Commit requirements', () => { if (state.requirements.trim().length < 20) { notice.textContent = 'State your scope and targets first.'; return; } state.stage = 'compare'; draw(); }));
  } else if (state.stage === 'compare') {
    const r = problem.requirements;
    host.append(h('div', { class: 'pl-interview-compare' }, h('section', {}, h('h3', { text: 'Your scope and targets' }), h('p', { text: state.requirements })), h('section', {}, h('h3', { text: 'The actual requirements' }), h('p', { text: `${fmtNum(r.peakRps)} req/s · ${r.availability * 100}% served · p99 ${r.latencyP99Ms.default} ms · ${fmtUsd(r.budgetPerMonth)}/month · ${r.dataSafety}` }), h('p', { text: Object.entries(r.mix).map(([t,v]) => `${t}: ${Math.round(v * 100)}%`).join(', ') }), h('p', { text: (r.notes || []).join(' ') }))), button('Estimate the workload', () => { state.stage = 'numbers'; draw(); }));
  } else if (state.stage === 'numbers') {
    host.append(h('p', { text: 'Type your estimates. Commit every estimate before seeing the arithmetic.' }), h('aside', { class: 'pl-number-assumptions' }, h('b', { text: 'Given workload' }), h('p', { text: `Peak: ≈ ${fmtNum(problem.requirements.peakRps)} req/s. Mix: ${Object.entries(problem.requirements.mix).map(([t,v]) => `${t} ${Math.round(v * 100)}%`).join(', ')}.` }), h('ul', {}, (problem.requirements.notes || []).map(text => h('li', { text })))));
    problem.numbers.forEach((source,i) => { const spec = estimateUnit(source), row = { ...source, unit: spec.unit }; host.append(h('label', { class: 'pl-defense-field' }, h('span', { text: `${row.label} (${row.unit})` }), h('input', { class: 'pl-input', type: 'number', min: String(spec.lo), max: String(spec.hi), step: 'any', value: state.estimates[i] == null ? '' : state.estimates[i] * spec.factor, onInput: e => state.estimates[i] = e.target.value === '' ? null : Number(e.target.value) / spec.factor }))); });
    host.append(notice, button('Commit estimates', () => { if (!problem.numbers.every((row,i) => { const spec = estimateUnit(row), value = state.estimates[i] * spec.factor; return Number.isFinite(state.estimates[i]) && (spec.percent ? value >= spec.lo && value <= spec.hi : value > 0); })) { notice.textContent = 'Enter a positive estimate for each count and a percent from 0 to 100 for each share.'; return; } state.committed = true; state.stage = 'worked'; draw(); }));
  } else {
    host.append(...problem.numbers.map((row,i) => h('section', { class: 'pl-sec' }, h('b', { text: row.label }), h('p', { text: `Your estimate: ${fmtNum(state.estimates[i] * estimateUnit(row).factor)} ${estimateUnit(row).unit}. Worked: ≈ ${fmtNum(estimateUnit(row).value)} ${estimateUnit(row).unit}.` }), h('p', { text: estimateFeedback(row, state.estimates[i]).text }), h('p', { text: row.how }))), h('p', { text: 'Draw independently. The day runs once, without edits. Afterward, defend your choices against the observed result. The 45-minute clock is a guide and never stops play.' }), button('Start drawing', () => { state.stage = 'ready'; ready(); }));
  }
}

function implication(q) {
  const t = (q.q + ' ' + q.a).toLowerCase();
  if (/retain|keep|days|years|storage/.test(t)) return 'Retention changes stored volume, copy cost and the recovery plan.';
  if (/lose|loss|duplicate|payment|exactly/.test(t)) return 'Durability and duplicate handling decide which write paths are acceptable.';
  if (/latency|fresh|change|stale/.test(t)) return 'Freshness and latency decide where an answer can be cached or copied.';
  return 'Use this constraint to choose the request path, capacity and failure headroom.';
}

export function renderInterviewResult(host, problem, state, result, catalog, save) {
  const questions = defenseQuestions(problem, result.graph, result, catalog);
  const root = h('div', { class: 'pl-debrief pl-interview-result' },
    h('div', { class: 'pl-kicker', text: 'Interview mode · Defend your design' }),
    h('h2', { class: 'pl-h2', text: result.passed ? 'The system held. Explain the tradeoffs.' : 'The day found a limit. Explain the evidence.' }),
    h('p', { text: result.score.total + '/1,000 · ' + fmtUsd(result.slo.cost.perMonth) + '/month' }),
    h('p', { text: 'Write before each reveal, then predict whether the listed claim holds or fails. Replays test your design against that prediction. Writing review and predictions are separate from the day score.' }));
  host.replaceChildren(root);
  const priorities = h('section', { class: 'pl-interview-priorities', 'aria-live': 'polite' });
  root.append(priorities);
  const report = h('section', { class: 'pl-sec pl-interview-report', hidden: '' });
  const controls = [];
  const update = () => {
    report.hidden = true;
    report.replaceChildren();
    const gaps = questions.flatMap((q,i) => Object.values(state.defense[i]?.claims || {}).filter(c => c.applied !== false && c.matched === false).map(c => 'Follow-up ' + (i + 1) + ': your prediction did not match the replay. ' + q.claims.find(claim => claim.id === c.claimId)?.text));
    priorities.replaceChildren(h('h3', { text: 'What to work on next' }), h('p', { text: gaps[0] || 'Commit a prediction for each follow-up and inspect its trace. If an experiment is not tested, use its trace to choose an applicable boundary.' }), h('small', { text: 'Replays compare your committed position with the measured outcome. The written answer still needs human review.' }));
    if (!questions.every((_, i) => state.defense[i]?.revealed && Object.keys(state.defense[i]?.claims || {}).length)) return;
    const outcomes = state.defense.flatMap(d => Object.values(d.claims || {}));
    const summary = summarizeClaims(outcomes);
    const { covered, total, held, failed, untested } = summary;
    const saveButton = button(state.complete ? 'Interview report saved' : 'Save interview report', () => {
      if (state.complete) return;
      save({ questionCount: state.coverage.filter(Boolean).length, questionsTotal: problem.clarify.length,
        estimates: state.estimates, scope: state.requirements, questions: state.questions, topicMatches: state.closest,
        defense: state.defense.map((d,i) => ({ ...d, question: questions[i].q, evidence: questions[i].evidence, checklist: questions[i].checklist, claimDefinitions: questions[i].claims })), coverageKind: 'computed-predictions', ...summary, score: result.score.total, passed: result.passed });
      state.complete = true;
      controls.forEach(control => control.lock());
      root.querySelectorAll('.pl-defense-card').forEach(card => card.open = false);
      update();
    });
    saveButton.disabled = state.complete;
    report.hidden = false;
    report.replaceChildren(h('h3', { text: 'Your interview report' }),
      h('p', { text: 'Question topics recorded: ' + state.coverage.filter(Boolean).length + '/' + problem.clarify.length + '. Predictions matched: ' + covered + '/' + total + ' tested. Claims held: ' + held + '; failed: ' + failed + '. Not tested by this replay: ' + untested + '. Day score: ' + result.score.total + '/1,000.' }),
      h('p', { text: state.requirements }),
      ...problem.numbers.map((n, i) => h('p', { text: n.label + ': estimated ' + fmtNum(state.estimates[i] * estimateUnit(n).factor) + ' ' + estimateUnit(n).unit + ', worked ≈ ' + fmtNum(estimateUnit(n).value) + ' ' + estimateUnit(n).unit + '.' })), saveButton,
      ...(state.complete ? [h('p', { role: 'status', text: 'Saved on this device with your predictions and replay traces. Best prediction results and best day score are kept separately.' })] : []),
      h('a', { class: 'pl-btn', href: '#/practice/' + problem.id + '?interview=1', onClick: () => location.reload(), text: 'New interview' }));
  };
  questions.forEach((q, i) => {
    const d = state.defense[i] ||= { answer: '', revealed: false, checked: q.checklist.map(() => false) };
    const section = h('details', { class: 'pl-sec pl-defense-card', open: true }, h('summary', { text: 'Follow-up ' + (i + 1) + ': ' + q.q }),
      h('span', { class: 'pl-kicker', text: 'Follow-up ' + (i + 1) + ' of ' + questions.length }), h('h3', { text: q.q }));
    const columns = h('div', { class: 'pl-defense-columns' });
    section.append(columns);
    const response = h('div', { class: 'pl-defense-response' });
    const evidence = h('aside', { class: 'pl-defense-evidence' }, h('h4', { text: 'Evidence from your run' }), q.evidence.map(text => h('p', { text })));
    columns.append(response, evidence);
    controls.push(mountDefense(response, q, d, { id: 'pl-defense-' + i, locked: state.complete, checkClaim: claim => checkClaim(claim, { problem, graph: result.graph, result, catalog }), onReveal: update, onChange: () => {
      if (d.revealed && q.checklist.every((_,j) => d.checked[j]) && Object.keys(d.claims || {}).length === q.claims.length) {
        const restoreFocus = section.contains(document.activeElement);
        section.open = false;
        if (restoreFocus) section.querySelector('summary').focus();
      }
      update();
    } }));
    evidence.append(response.querySelector('.pl-defense-model'));
    root.append(section);
  });
  root.append(report); update();
}
