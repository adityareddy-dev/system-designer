// Step 2: estimate one to three figures on a log slider, then see the worked numbers.
import { estimateUnit, estimateFeedback } from './estimate-units.js';
import { loadSummary } from './load-labels.js';
import { h, fmtNum, approx } from './util.js';

const SL = 1000;

export function renderNumbers(host, { problem, guesses, onNext, onBack, snd, progress }) {
  host.replaceChildren();
  const rows = problem.numbers || [];
  const saved = progress?.get(problem.id)?.estimates;
  if (saved) rows.forEach((row, i) => { if (row.ask) guesses[i] = saved[i] ?? null; });
  const save = () => progress?.saveEstimates(problem.id, rows.map((row, i) => row.ask ? guesses[i] ?? null : null));
  const list = h('div', { class: 'pl-nlist' });
  if (problem.requirements?.notes?.length) list.append(h('aside', { class: 'pl-number-assumptions' }, h('b', { text: 'Use these assumptions' }), h('ul', {}, problem.requirements.notes.map(text => h('li', { text })))));
  const checks = [];

  const canonical = guesses;
  rows.forEach((source, i) => {
    const spec = estimateUnit(source);
    const row = { ...source, value: spec.value, unit: spec.unit };
    const guesses = new Proxy(canonical, { get: (a, k) => k === String(i) ? a[k] == null ? null : a[k] * spec.factor : a[k], set: (a, k, value) => { a[k] = k === String(i) && value != null ? value / spec.factor : value; return true; } });
    const v = Math.max(row.value, 0.01);
    const { integer, lo, hi } = spec;
    const toVal = (p) => spec.percent ? p / SL * 100 : lo * (hi / lo) ** (p / SL);
    const snap = (n) => Math.min(hi, Math.max(lo, integer ? Math.round(n) : n));
    const toPos = (n) => spec.percent ? n * SL / 100 : SL * Math.log(n / lo) / Math.log(hi / lo);
    const card = h('div', { class: 'pl-ncard' });
    card.append(h('div', { class: 'pl-nlabel', text: row.label + (i < 2 && problem.id === 'url-shortener' ? ' (normal peak)' : i < 2 && problem.id === 'concert-ticket-drop' ? ' (event peak)' : '') }));
    const out = h('div', { class: 'pl-nout' });
    const result = h('div', { class: 'pl-nresult', 'aria-live': 'polite' });
    if (row.ask) {
      // A guess counts once either control has been used.
      const touched = guesses[i] != null;
      if (touched) guesses[i] = snap(guesses[i]);
      const init = touched ? toPos(guesses[i]) : 0;
      const slider = h('input', { class: 'pl-range' + (touched ? '' : ' pl-range--unset'), type: 'range', min: '0', max: String(SL), value: String(init), 'aria-label': `Your estimate: ${row.label} (${row.unit})` });
      const input = h('input', { class: 'hp-input pl-ninput', type: 'number', min: String(lo), max: String(hi), step: integer ? '1' : 'any', value: touched ? String(guesses[i]) : '', 'aria-label': `Your estimate: ${row.label} (${row.unit || 'value'})` });
      const show = () => {
        if (guesses[i] == null) { out.replaceChildren(h('span', { class: 'pl-muted pl-nunset', text: 'Type an estimate or drag the slider' })); return; }
        out.replaceChildren(h('b', { text: fmtNum(guesses[i]) }), ' ', row.unit || '');
        slider.setAttribute('aria-valuetext', `${guesses[i]} ${row.unit || ''}`);
      };
      slider.addEventListener('input', () => {
        guesses[i] = snap(toVal(+slider.value));
        slider.value = String(toPos(guesses[i]));
        input.value = String(+guesses[i].toPrecision(12));
        slider.classList.remove('pl-range--unset');
        save(); show(); syncReveal(); snd?.('ui.tap', { intensity: 0.3 });
      });
      input.addEventListener('input', () => {
        guesses[i] = input.value === '' || !Number.isFinite(input.valueAsNumber) ? null : snap(input.valueAsNumber);
        slider.value = String(guesses[i] == null ? 0 : toPos(guesses[i]));
        slider.classList.toggle('pl-range--unset', guesses[i] == null);
        save(); show(); syncReveal();
      });
      input.addEventListener('change', () => { input.value = guesses[i] == null ? '' : String(guesses[i]); });
      show();
      card.append(out, h('div', { class: 'pl-ncontrols' }, slider, h('label', { class: 'pl-nentry' }, input, h('span', { text: row.unit || '' }))), h('div', { class: 'pl-nscale' }, h('span', { text: `${fmtNum(lo)} ${row.unit || ''}` }), h('span', { text: spec.percent ? 'percent, linear scale' : 'log scale' }), h('span', { text: `${fmtNum(hi)} ${row.unit || ''}` })));
    } else {
      // Not a guess: shown up front as a worked example.
      card.append(h('div', { class: 'pl-nworked' }, h('span', { class: 'pl-muted', text: 'Worked example: ' }),
        h('b', { text: fmtNum(row.value) + ' ' + (row.unit || '') }), ' ', approx('approx.'), h('div', { class: 'pl-muted', text: row.how || '' })));
    }
    card.append(result);
    list.append(card);
    checks.push(() => {
      if (!row.ask) return;
      const worked = h('div', { class: 'pl-nworked' },
        h('b', { text: fmtNum(row.value) + ' ' + (row.unit || '') }), ' ', approx('worked answer'),
        h('div', { class: 'pl-muted', text: row.how || '' }));
      let verdict = null;
      if (row.ask && guesses[i] != null) {
        const { cls, text } = estimateFeedback(source, canonical[i]);
        verdict = h('div', { class: 'pl-verdict pl-verdict--' + cls, text });
      }
      result.replaceChildren(...[verdict, worked].filter(Boolean));
    });
  });
  const revealed = guesses.__revealed === true;
  if (revealed) checks.forEach((c) => c());

  const hasAsk = rows.some((r) => r.ask);
  const reveal = h('button', {
    class: 'pl-btn', type: 'button',
    onClick: () => { guesses.__revealed = true; checks.forEach((c) => c()); reveal.disabled = true; snd?.('count'); },
  }, hasAsk ? 'Check my guesses' : 'Show the worked numbers');
  // Check waits until every estimate is entered; Start drawing never waits.
  function syncReveal() {
    const left = rows.filter((r, i) => r.ask && guesses[i] == null).length;
    reveal.disabled = guesses.__revealed === true || left > 0;
    reveal.title = left > 0 ? 'Enter an estimate for each question first' : '';
  }
  syncReveal();
  host.append(
    h('div', { class: 'pl-kicker', text: 'Step 2 · Numbers' }),
    h('h2', { class: 'pl-h2', text: 'Do the numbers first' }),
    h('p', { class: 'pl-muted', text: 'A rough estimate is enough. Within 2 times of the worked answer counts as a good guess.' }),
    h('p', { class: 'pl-muted', text: loadSummary(problem) }),
    list,
    h('div', { class: 'pl-panel-foot' },
      h('button', { class: 'pl-btn pl-btn--ghost', type: 'button', onClick: onBack }, 'Back'),
      reveal,
      h('button', { class: 'pl-btn pl-btn--primary', type: 'button', onClick: onNext }, 'Start drawing')),
  );
}
