import { runTrafficLab, TRAFFIC_DESIGNS, TRAFFIC_PROBLEM } from '../../sim/traffic-lab.js';
import { TRAFFIC_NODES } from './hero-markup.js';
import { h } from './dom.js';

const seconds = 7;
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const descriptions = {
  clients: 'Browser and mobile requests.',
  cdn: 'Answers cached redirects before they reach the apps.',
  lb: 'Distributes requests across app servers.',
  api: 'Looks up short links and accepts new ones.',
  cache: 'Holds recent redirects in memory.',
  db: 'Stores the mapping from short code to long URL.',
};

export function mountTrafficLab(hero, ctx) {
  const lab = hero.querySelector('.tl-lab');
  const pick = [...lab.querySelectorAll('[data-design]')];
  const nodes = [...lab.querySelectorAll('[data-node]')];
  const meter = Object.fromEntries([...lab.querySelectorAll('[data-meter]')].map(el => [el.dataset.meter, el]));
  const run = lab.querySelector('.tl-run');
  const firstRun = hero.querySelector('[data-first-run]');
  const status = lab.querySelector('.tl-status');
  const time = lab.querySelector('time');
  const plot = lab.querySelector('.tl-plot svg');
  const plotOffer = plot.querySelector('.tl-offered');
  const plotServe = plot.querySelector('.tl-served');
  const plotLoss = plot.querySelector('.tl-lost');
  const inspector = lab.querySelector('.tl-inspector');
  const results = lab.querySelector('.tl-results');
  const body = results.querySelector('tbody');
  const scrub = lab.querySelector('.tl-scrub');
  const slider = scrub.querySelector('input');
  const finished = new Map();
  let current = TRAFFIC_DESIGNS[0];
  let selected = 'api';
  let sample = null;
  let data = null;
  let points = null;
  let phase = 'idle';
  let animation = 0;
  let index = 0;
  let elapsed = 0;
  let previous = null;
  let disposed = false;

  function inspect() {
    const [, label] = TRAFFIC_NODES.find(([id]) => id === selected);
    const n = sample?.nodes[selected];
    inspector.firstElementChild.textContent = label;
    const detail = n
      ? `${integer.format(n.rps)} req/s · ${percent.format(n.util)} of modeled capacity`
      : selected === 'clients' && sample ? `${integer.format(sample.offeredRps)} req/s arriving` : descriptions[selected];
    inspector.lastElementChild.textContent = detail;
    nodes.forEach(el => el.setAttribute('aria-pressed', String(el.dataset.node === selected)));
  }

  function paint(at) {
    index = at;
    sample = data?.samples[at] || null;
    const { offeredRps, successRps, failRps } = sample || {};
    for (const [id, value] of Object.entries({ offered: offeredRps, served: successRps, dropped: failRps })) {
      meter[id].textContent = value == null ? '…' : integer.format(value);
    }
    lab.dataset.spike = String(!!sample?.active);
    lab.dataset.flow = String(!!sample && phase === 'running');
    time.textContent = sample?.clock || '19:20';
    time.dateTime = time.textContent;
    slider.value = at;
    slider.setAttribute('aria-valuetext', time.textContent);
    if (points) {
      const offered = points.offered.slice(0, at + 1);
      const served = points.served.slice(0, at + 1);
      plotOffer.setAttribute('d', 'M' + offered.join(' L'));
      plotServe.setAttribute('d', 'M' + served.join(' L'));
      plotLoss.setAttribute('d', 'M' + offered.join(' L') + ' L' + served.reverse().join(' L') + ' Z');
    } else {
      [plotOffer, plotServe, plotLoss].forEach(path => path.removeAttribute('d'));
    }
    for (const node of nodes) {
      const id = node.dataset.node;
      const n = sample?.nodes[id];
      node.dataset.load = n?.status || '';
      node.style.setProperty('--load', (Math.min(n?.util || 0, 1) * 100) + '%');
      const detail = TRAFFIC_NODES.find(([key]) => key === id)[2];
      node.querySelector('span').textContent = id === 'api' ? `${current.units} instances` : detail;
    }
    inspect();
  }

  function compare() {
    results.hidden = finished.size === 0;
    body.replaceChildren(...TRAFFIC_DESIGNS.filter(({ id }) => finished.has(id)).map(({ id, label }) => {
      const { spikeDropped, spikeOffered, availability, p99, cost } = finished.get(id);
      return h('tr', { dataset: { result: id, current: String(id === current.id) } },
        h('th', { scope: 'row', text: label }),
        h('td', { text: percent.format(spikeDropped / spikeOffered) }),
        h('td', { text: percent.format(availability) }),
        h('td', { text: integer.format(p99) + ' ms' }),
        h('td', { text: money.format(cost) }));
    }));
  }

  function complete() {
    phase = 'done';
    run.textContent = 'Run again';
    finished.set(current.id, data);
    scrub.hidden = false;
    paint(data.samples.length - 1);
    compare();
    status.textContent = `Run complete. ${integer.format(data.spikeDropped)} requests dropped during the spike.`;
  }

  function animate(now) {
    if (previous !== null) elapsed += now - previous;
    previous = now;
    const next = Math.floor(Math.min(1, elapsed / (seconds * 1000)) * (data.samples.length - 1));
    if (next === data.samples.length - 1) {
      complete();
      return;
    }
    if (next !== index) paint(next);
    animation = requestAnimationFrame(animate);
  }

  async function play() {
    if (phase === 'loading') return;
    if (phase === 'running') {
      cancelAnimationFrame(animation);
      phase = 'paused';
      lab.dataset.flow = 'false';
      run.textContent = 'Resume';
      status.textContent = `Paused at ${time.textContent}.`;
      return;
    }
    if (phase === 'paused') {
      phase = 'running';
      previous = null;
      lab.dataset.flow = 'true';
      run.textContent = 'Pause';
      status.textContent = 'Running the traffic day.';
      animation = requestAnimationFrame(animate);
      return;
    }
    const chosen = current;
    phase = 'loading';
    status.textContent = 'Preparing the traffic day.';
    try {
      const problem = await ctx.content.ensureProblem(TRAFFIC_PROBLEM);
      if (disposed || current !== chosen || phase !== 'loading') return;
      data = finished.get(chosen.id) || runTrafficLab(ctx.catalog, problem, chosen.id);
    } catch {
      if (!disposed && current === chosen && phase === 'loading') {
        phase = 'idle';
        status.textContent = 'The scenario could not load. Run it again to retry.';
      }
      return;
    }
    const maximum = Math.max(1, ...data.samples.map(s => s.offeredRps));
    const coordinates = rate => data.samples.map((s, i) => `${(i * 600 / (data.samples.length - 1)).toFixed(1)},${(89 - 84 * s[rate] / maximum).toFixed(1)}`);
    points = { offered: coordinates('offeredRps'), served: coordinates('successRps') };
    slider.max = data.samples.length - 1;
    if (ctx.reducedMotion()) {
      complete();
      return;
    }
    elapsed = 0;
    previous = null;
    phase = 'running';
    scrub.hidden = true;
    run.textContent = 'Pause';
    status.textContent = 'Running the traffic day.';
    paint(0);
    animation = requestAnimationFrame(animate);
  }

  function choose(id) {
    const next = TRAFFIC_DESIGNS.find(d => d.id === id);
    if (current === next) return;
    cancelAnimationFrame(animation);
    current = next;
    phase = 'idle';
    data = null;
    points = null;
    if (!next.edge && selected === 'cdn') selected = 'api';
    lab.querySelector('[data-node="cdn"]').hidden = !next.edge;
    pick.forEach(el => el.setAttribute('aria-pressed', String(el.dataset.design === id)));
    run.textContent = 'Run simulation';
    status.textContent = `${current.label} ready to run against the same traffic day.`;
    scrub.hidden = true;
    paint(0);
    compare();
  }

  pick.forEach(el => {
    el.disabled = false;
    el.addEventListener('click', () => choose(el.dataset.design));
  });
  nodes.forEach(el => {
    el.disabled = false;
    el.addEventListener('click', () => { selected = el.dataset.node; inspect(); });
  });
  slider.addEventListener('input', () => paint(Number(slider.value)));
  run.disabled = false;
  run.addEventListener('click', play);
  firstRun.addEventListener('click', (event) => {
    event.preventDefault();
    run.focus();
    play();
  });
  return () => { disposed = true; cancelAnimationFrame(animation); };
}
