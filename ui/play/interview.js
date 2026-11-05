// Candidate-led preparation, graph-specific defense and an honest local interview record.
import { h, fmtNum, fmtUsd } from './util.js';

const STOP = new Set('about after again also are can could does each for from have how into many more must need our should that the their them there these this what when where which who why will with would your'.split(' '));
export function questionCoverage(text, questions) {
  const words = new Set(text.toLowerCase().match(/[a-z0-9]+/g) || []);
  return questions.map(q => {
    const keys = [...new Set((q.q.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 2 && !STOP.has(w)))];
    return keys.filter(k => words.has(k) || [...words].some(w => w.length > 3 && k.startsWith(w.slice(0, -1)))).length >= Math.min(2, Math.max(1, keys.length));
  });
}

export function defenseQuestions(problem, graph, result, catalog) {
  const name = n => n.label || catalog.elementById.get(n.type)?.name || n.type;
  const pool = graph.nodes.find(n => catalog.elementById.get(n.type)?.kind === 'compute' && n.units > 1);
  const cache = graph.nodes.find(n => catalog.elementById.get(n.type)?.kind === 'cache');
  const store = graph.nodes.find(n => catalog.elementById.get(n.type)?.kind === 'store');
  const event = result.events?.find(e => e.hurt?.length) || result.events?.[0];
  const measured = result.nodes?.filter(n => n.peakUtil > 0).sort((a,b) => b.peakUtil - a.peakUtil)[0];
  const questions = [];
  if (cache) questions.push({ q: `Your ${name(cache)} just died. What reaches its downstream parts in the next minute?`, model: 'Hits become misses. Size and measure the origin for cold traffic, collapse repeated misses and refill gradually. A limiter protects capacity by rejecting work, which still affects availability.', checklist: ['Describe the cold miss rate', 'Check downstream spare capacity', 'Explain one protection and its availability cost'] });
  if (pool) {
    const routed = graph.edges.some(e => e.to === pool.id && catalog.elementById.get(graph.nodes.find(n => n.id === e.from)?.type)?.kind === 'router');
    questions.push({ q: `You drew ${pool.units} units of ${name(pool)}${routed ? ' behind a router' : ' without a separate router'}. How does one request choose a replica, and what happens when one fails?`, model: `The simulation treats a pool as one aggregate endpoint with internal distribution. ${routed ? 'Your router provides a visible entry point.' : 'Your graph leaves that routing implicit.'} A real deployment needs discovery, health checks and a distribution policy. With one replica gone, the remaining units receive more work; calculate N/(N−1) times the previous load and include detection delay.`, checklist: ['State where discovery and routing live', 'Explain health detection and redistribution', 'Calculate surviving capacity and account for delay'] });
  }
  if (store) questions.push({ q: `What key would you use to partition ${name(store)}? Your largest customer grows tenfold. What happens?`, model: 'Choose a key from the workload, describe its distribution and show how one large tenant can exhaust a shard. Compare splitting a tenant across buckets with the extra read fanout and coordination. More nodes do not automatically split a single hot key.', checklist: ['Name a concrete partition key', 'Describe skew for the largest tenant', 'Explain mitigation and its read or consistency cost'] });
  if (event) questions.push({ q: `At ${new Date(event.atMs).toISOString().slice(11,16)}, ${event.name} hit. Which part failed first, and what evidence distinguishes capacity from routing or dependency failure?`, model: `${event.story?.headline || ''} ${event.story?.hurt || ''} ${result.nextStep?.text || ''} Correlate the event time with overloaded minutes and failed requests; a busy part alone is not proof of cause.`, checklist: ['Identify the affected path and time', 'Quote a measured utilization or failure metric', 'Distinguish the initiating cause from a downstream symptom'] });
  else if (measured) questions.push({ q: `${name(graph.nodes.find(n => n.id === measured.id))} peaked at ${Math.round(measured.peakUtil * 100)}% busy. What extra workload would invalidate your design?`, model: 'Use spare capacity at the busiest hop, then account for the request mix and retries. A new workload may move the bottleneck. Verify it with a new load test rather than assuming linear scaling.', checklist: ['Use the observed peak', 'Name a workload change', 'Explain how to verify the new limit'] });
  const cost = result.slo.cost.perMonth;
  questions.push({ q: `This costs about ${fmtUsd(cost)}/month. Remove 30%, about ${fmtUsd(cost * .3)}. What do you cut, and what breaks?`, model: `Start with the largest cost line: ${[...result.slo.cost.lines].sort((a,b) => (b.usd || b.perMonth || 0) - (a.usd || a.perMonth || 0))[0]?.label || 'inspect the cost breakdown'}. Compare reducing idle units, retained data and usage. Preserve the required durability and show the loss of burst or failure headroom. State the metric you would watch before keeping the saving.`, checklist: ['Identify a real cost line and saving', 'Name a resulting reliability, speed or data tradeoff', 'Describe a measurement and rollback threshold'] });
  if (questions.length < 3) questions.push({ q: `Your graph has ${graph.nodes.length} parts and ${graph.edges.filter(e => e.kind === 'flow').length} delivery connections. Trace a ${Object.keys(problem.requirements.mix)[0]} request from its source to an answer. Where can it stop?`, model: `${result.nextStep.text} A complete path must start at the source that sends that request type and end at a capable destination. A disconnected store does not help.`, checklist: ['Name the source and every hop', 'Identify the destination or missing route', 'Explain what the caller sees when a hop fails'] });
  if (questions.length < 3) questions.push({ q: `Your users span ${Object.keys(problem.requirements.userRegions).join(', ')}. Which network round trips belong in your latency budget?`, model: 'Include the user-to-service trip and every synchronous cross-region dependency. Moving one service alone can leave the slowest round trip intact. Distinguish observed latency from requests that never got a response.', checklist: ['Trace user and dependency round trips', 'Separate service time from network time', 'Explain one region placement tradeoff'] });
  return questions.slice(0, 5);
}

export function createInterview(problem) {
  return { stage: 'questions', questions: '', coverage: [], requirements: '', estimates: {}, committed: false, startedAt: Date.now(), run: false, defense: [], complete: false };
}

const button = (text, action, primary = true) => h('button', { class: 'pl-btn' + (primary ? ' pl-btn--primary' : ''), type: 'button', onClick: action }, text);
const writing = (label, value, update) => h('label', { class: 'pl-defense-field' }, h('span', { text: label }), h('textarea', { class: 'pl-input', rows: 5, required: true, minlength: 20, maxlength: 6000, text: value, onInput: e => update(e.target.value) }));

export function renderInterviewPrep(host, problem, state, ready) {
  host.replaceChildren(h('div', { class: 'pl-kicker', text: 'Interview mode · You lead' }), h('h2', { class: 'pl-h2', text: problem.title }), h('p', { class: 'pl-lead', text: problem.brief }));
  const draw = () => renderInterviewPrep(host, problem, state, ready);
  const notice = h('p', { role: 'status', class: 'pl-muted' });
  if (state.stage === 'questions') {
    host.append(h('p', { text: 'Ask your own questions before seeing the interviewer’s list. Include scale, scope and failure expectations. Matching checks shared keywords only; it cannot judge meaning.' }), writing('What would you ask?', state.questions, v => state.questions = v), notice,
      button('Commit questions', () => {
        if (state.questions.trim().length < 20) { notice.textContent = 'Write your questions first, at least 20 characters.'; return; }
        state.coverage = questionCoverage(state.questions, problem.clarify); state.stage = 'answers'; draw();
      }));
  } else if (state.stage === 'answers') {
    host.append(h('p', { text: `${state.coverage.filter(Boolean).length} of ${problem.clarify.length} topics matched. Read every answer, including topics the keyword check may have missed.` }), ...problem.clarify.map((q,i) => h('section', { class: 'pl-sec' }, h('b', { text: `${state.coverage[i] ? 'Found' : 'Missed'} · ${q.q}` }), h('p', { text: q.a }), h('small', { text: `Design implication: ${implication(q)}` }))), button('Write requirements', () => { state.stage = 'requirements'; draw(); }));
  } else if (state.stage === 'requirements') {
    host.append(writing('What will you build, exclude, and measure? State your target numbers.', state.requirements, v => state.requirements = v), notice,
      button('Commit requirements', () => { if (state.requirements.trim().length < 20) { notice.textContent = 'State your scope and targets first.'; return; } state.stage = 'compare'; draw(); }));
  } else if (state.stage === 'compare') {
    const r = problem.requirements;
    host.append(h('div', { class: 'pl-interview-compare' }, h('section', {}, h('h3', { text: 'Your scope and targets' }), h('p', { text: state.requirements })), h('section', {}, h('h3', { text: 'The actual requirements' }), h('p', { text: `${fmtNum(r.peakRps)} req/s · ${r.availability * 100}% served · p99 ${r.latencyP99Ms.default} ms · ${fmtUsd(r.budgetPerMonth)}/month · ${r.dataSafety}` }), h('p', { text: Object.entries(r.mix).map(([t,v]) => `${t}: ${Math.round(v * 100)}%`).join(', ') }), h('p', { text: (r.notes || []).join(' ') }))), button('Estimate the workload', () => { state.stage = 'numbers'; draw(); }));
  } else if (state.stage === 'numbers') {
    host.append(h('p', { text: 'Type your estimates. Commit every estimate before seeing the arithmetic.' }), h('aside', { class: 'pl-number-assumptions' }, h('b', { text: 'Given workload' }), h('p', { text: `Peak: ≈ ${fmtNum(problem.requirements.peakRps)} req/s. Mix: ${Object.entries(problem.requirements.mix).map(([t,v]) => `${t} ${Math.round(v * 100)}%`).join(', ')}.` }), h('ul', {}, (problem.requirements.notes || []).map(text => h('li', { text })))));
    problem.numbers.forEach((row,i) => host.append(h('label', { class: 'pl-defense-field' }, h('span', { text: `${row.label} (${row.unit})` }), h('input', { class: 'pl-input', type: 'number', min: '.000001', step: 'any', value: state.estimates[i] ?? '', onInput: e => state.estimates[i] = e.target.value === '' ? null : Number(e.target.value) }))));
    host.append(notice, button('Commit estimates', () => { if (!problem.numbers.every((_,i) => state.estimates[i] > 0 && Number.isFinite(state.estimates[i]))) { notice.textContent = 'Enter a positive estimate for each question.'; return; } state.committed = true; state.stage = 'worked'; draw(); }));
  } else {
    host.append(...problem.numbers.map((row,i) => h('section', { class: 'pl-sec' }, h('b', { text: row.label }), h('p', { text: `Your estimate: ${fmtNum(state.estimates[i])} ${row.unit}. Worked: ≈ ${fmtNum(row.value)} ${row.unit}.` }), h('p', { text: row.how }))), h('p', { text: 'Draw independently. The day runs once, without edits. Afterward, defend your choices against the observed result. The 45-minute clock is a guide and never stops play.' }), button('Start drawing', () => { state.stage = 'ready'; ready(); }));
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
  host.replaceChildren(h('div', { class: 'pl-debrief pl-interview-result' }, h('div', { class: 'pl-kicker', text: 'Interview mode · Defend your design' }), h('h2', { class: 'pl-h2', text: result.passed ? 'The system held. Explain the tradeoffs.' : 'The day found a limit. Explain the evidence.' }), h('p', { text: `${result.score.total}/1,000 · ${Math.round(result.slo.availability.actual * 1000) / 10}% served · ${fmtUsd(result.slo.cost.perMonth)}/month` }), h('p', { text: 'This is an honest self-check. Writing is required before each reveal. Checklist coverage is your assessment, separate from the simulated score.' })));
  const root = host.firstChild;
  const report = h('section', { class: 'pl-sec pl-interview-report', hidden: '' });
  const update = () => {
    if (!questions.every((_, i) => state.defense[i]?.revealed)) return;
    const covered = state.defense.reduce((a,d) => a + d.checked.filter(Boolean).length, 0);
    const total = questions.reduce((a,q) => a + q.checklist.length, 0);
    report.hidden = false;
    report.replaceChildren(h('h3', { text: 'Your interview report' }), h('p', { text: `Questions found: ${state.coverage.filter(Boolean).length}/${problem.clarify.length}. Defense coverage, self-assessed: ${covered}/${total}. Day score: ${result.score.total}/1,000.` }), h('p', { text: state.requirements }), ...problem.numbers.map((n,i) => h('p', { text: `${n.label}: estimated ${fmtNum(state.estimates[i])}, worked ≈ ${fmtNum(n.value)} ${n.unit}.` })), button('Save interview report', () => { state.complete = true; save({ questionCount: state.coverage.filter(Boolean).length, questionsTotal: problem.clarify.length, estimates: state.estimates, scope: state.requirements, questions: state.questions, defense: state.defense, covered, total, score: result.score.total, passed: result.passed }); report.append(h('p', { role: 'status', text: 'Saved on this device. Best coverage and best day score are kept separately.' })); }), h('a', { class: 'pl-btn', href: '#/practice/' + problem.id + '?interview=1', onClick: () => location.reload(), text: 'New interview' }));
  };
  questions.forEach((q,i) => {
    const d = state.defense[i] ||= { answer: '', revealed: false, checked: q.checklist.map(() => false) };
    const section = h('section', { class: 'pl-sec pl-defense-card' }, h('span', { class: 'pl-kicker', text: `Follow-up ${i + 1} of ${questions.length}` }), h('h3', { text: q.q }));
    const answer = writing('Your defense', d.answer, v => d.answer = v);
    const model = h('div', { class: 'pl-defense-model', hidden: d.revealed ? null : '' });
    model.append(h('b', { text: 'One strong answer' }), h('p', { text: q.model }), ...q.checklist.map((point,j) => h('label', { class: 'pl-defense-check' }, h('input', { type: 'checkbox', checked: d.checked[j] ? '' : null, onChange: e => { d.checked[j] = e.target.checked; update(); } }), h('span', { text: point }))));
    const status = h('p', { role: 'status' });
    const reveal = button('Reveal model answer and checklist', () => { if (d.answer.trim().length < 20) { status.textContent = 'Write your reasoning first, at least 20 characters.'; return; } d.revealed = true; model.hidden = false; answer.querySelector('textarea').readOnly = true; reveal.hidden = true; update(); });
    if (d.revealed) { reveal.hidden = true; answer.querySelector('textarea').readOnly = true; }
    section.append(answer, reveal, status, model); root.append(section);
  });
  root.append(report); update();
}
