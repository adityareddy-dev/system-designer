// Step 2: estimate one to three figures on a log slider, then see the worked numbers.
import { loadSummary } from './load-labels.js';
import { h, fmtNum, approx } from './util.js';

const SL = 1000;

export function renderNumbers(host, { problem, guesses, onNext, onBack, snd }) {
  host.replaceChildren();
  const rows = problem.numbers || [];
  const list = h('div', { class: 'pl-nlist' });
  const checks = [];

  rows.forEach((row, i) => {
    const v = Math.max(row.value, 0.01);
    const integer = /^(servers?|workers?|nodes?)$/i.test(row.unit || '');
    const lo = Math.max(integer ? 1 : 0.1, 10 ** (Math.floor(Math.log10(v)) - 2));
    const hi = 10 ** (Math.ceil(Math.log10(v)) + 2);
    const toVal = (p) => lo * (hi / lo) ** (p / SL);
    const snap = (n) => Math.min(hi, Math.max(lo, integer ? Math.round(n) : n));
    const toPos = (n) => SL * Math.log(n / lo) / Math.log(hi / lo);
    const card = h('div', { class: 'pl-ncard' });
    card.append(h('div', { class: 'pl-nlabel', text: row.label + (i < 2 && problem.id === 'url-shortener' ? ' (normal peak)' : i < 2 && problem.id === 'concert-ticket-drop' ? ' (event peak)' : '') }));
    const out = h('div', { class: 'pl-nout' });
    const result = h('div', { class: 'pl-nresult', 'aria-live': 'polite' });
    if (row.ask) {
      // A guess counts once either control has been used.
      const touched = guesses[i] != null;
      if (touched) guesses[i] = snap(guesses[i]);
      const init = touched ? toPos(guesses[i]) : 0;
      const slider = h('input', { class: 'pl-range' + (touched ? '' : ' pl-range--unset'), type: 'range', min: '0', max: String(SL), value: String(init), 'aria-label': `Your estimate: ${row.label}` });
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
        show(); syncReveal(); snd?.('ui.tap', { intensity: 0.3 });
      });
      input.addEventListener('input', () => {
        guesses[i] = input.value === '' || !Number.isFinite(input.valueAsNumber) ? null : snap(input.valueAsNumber);
        slider.value = String(guesses[i] == null ? 0 : toPos(guesses[i]));
        slider.classList.toggle('pl-range--unset', guesses[i] == null);
        show(); syncReveal();
      });
      input.addEventListener('change', () => { input.value = guesses[i] == null ? '' : String(guesses[i]); });
      show();
      card.append(out, h('div', { class: 'pl-ncontrols' }, slider, h('label', { class: 'pl-nentry' }, input, h('span', { text: row.unit || '' }))), h('div', { class: 'pl-nscale' }, h('span', { text: `${fmtNum(lo)} ${row.unit || ''}` }), h('span', { text: 'log scale' }), h('span', { text: `${fmtNum(hi)} ${row.unit || ''}` })));
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
        const ratio = Math.max(guesses[i] / v, v / guesses[i]);
        const cls = ratio <= 2 ? 'ok' : ratio <= 5 ? 'warn' : 'bad';
        const txt = ratio <= 2 ? 'Good guess: within 2 times.'
          : ratio <= 5 ? `Close: about ${ratio.toFixed(0)} times off.`
            : `About ${fmtNum(ratio)} times off. Worth redoing on paper.`;
        verdict = h('div', { class: 'pl-verdict pl-verdict--' + cls, text: txt });
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
