// Step 2: estimate one to three figures on a log slider, then see the worked numbers.
import { h, fmtNum, approx } from './util.js';

const SL = 1000;

export function renderNumbers(host, { problem, guesses, onNext, onBack, snd }) {
  host.replaceChildren();
  const rows = problem.numbers || [];
  const list = h('div', { class: 'pl-nlist' });
  const checks = [];

  rows.forEach((row, i) => {
    const v = Math.max(row.value, 0.01);
    const lo = Math.max(0.1, 10 ** (Math.floor(Math.log10(v)) - 2));
    const hi = 10 ** (Math.ceil(Math.log10(v)) + 2);
    const toVal = (p) => lo * (hi / lo) ** (p / SL);
    const card = h('div', { class: 'pl-ncard' });
    card.append(h('div', { class: 'pl-nlabel', text: row.label }));
    const out = h('div', { class: 'pl-nout' });
    const result = h('div', { class: 'pl-nresult', 'aria-live': 'polite' });
    if (row.ask) {
      // A guess only counts once the slider has been moved; until then every thumb rests at the low end, unfilled.
      const touched = guesses[i] != null;
      const init = touched ? Math.round(SL * Math.log(guesses[i] / lo) / Math.log(hi / lo)) : 0;
      const slider = h('input', { class: 'pl-range' + (touched ? '' : ' pl-range--unset'), type: 'range', min: '0', max: String(SL), value: String(init), 'aria-label': `Your estimate: ${row.label}` });
      const show = () => {
        if (guesses[i] == null) { out.replaceChildren(h('span', { class: 'pl-muted pl-nunset', text: 'Drag the slider to make your guess' })); return; }
        out.replaceChildren(h('b', { text: fmtNum(guesses[i]) }), ' ', row.unit || '');
      };
      slider.addEventListener('input', () => {
        guesses[i] = toVal(+slider.value);
        slider.classList.remove('pl-range--unset');
        show(); syncReveal(); snd?.('ui.tap', { intensity: 0.3 });
      });
      show();
      card.append(out, slider, h('div', { class: 'pl-nscale' }, h('span', { text: fmtNum(lo) }), h('span', { text: 'log scale' }), h('span', { text: fmtNum(hi) })));
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
  // Check waits until every slider has been moved; Start drawing never waits.
  function syncReveal() {
    const left = rows.filter((r, i) => r.ask && guesses[i] == null).length;
    reveal.disabled = guesses.__revealed === true || left > 0;
    reveal.title = left > 0 ? `Move ${left === 1 ? 'the last slider' : 'each slider'} first` : '';
  }
  syncReveal();
  host.append(
    h('div', { class: 'pl-kicker', text: 'Step 2 · Numbers' }),
    h('h2', { class: 'pl-h2', text: 'Do the numbers first' }),
    h('p', { class: 'pl-muted', text: 'A rough estimate is enough. Within 2 times of the worked answer counts as a good guess.' }),
    list,
    h('div', { class: 'pl-panel-foot' },
      h('button', { class: 'pl-btn pl-btn--ghost', type: 'button', onClick: onBack }, 'Back'),
      reveal,
      h('button', { class: 'pl-btn pl-btn--primary', type: 'button', onClick: onNext }, 'Start drawing')),
  );
}
