// The home hero as plain HTML text. The game draws it (ui/shell/home.js) and tools/gen-site-pages.mjs writes the very same
// markup into index.html, so the first paint is the real hero and the game takes over without anything moving.
// No imports and no document access: it has to run in Node as well.

export const ARROW = '<svg class="sh-arr" viewBox="0 0 18 18" aria-hidden="true" focusable="false"><path d="M2 9h13M10 4l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
export const BENCH_W = 280; // width of a full load bar

// The three pictures of the bench: steady traffic, double traffic, one replica lost.
export const PHASES = [
  { label: 'Steady load', rate: '1,800/s', bars: [60, 60, 60], spare: ['40% spare', '40% spare', '40% spare'], text: 'Three replicas share 1,800 requests/s. Each has 40% spare.' },
  { label: 'Double traffic', rate: '3,600/s', bars: [120, 120, 120], spare: ['overloaded', 'overloaded', 'overloaded'], text: 'First limit: compute. Each replica gets 1,200/s but can serve about 1,000/s. About 600/s are rejected.' },
  { label: 'Lose a replica', rate: '1,800/s', bars: [90, 90, 0], spare: ['10% spare', '10% spare', 'down'], down: 2, text: 'One replica is down. The other two now carry 900/s each. Routing recovers, but headroom falls to 10%.' },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const barWidth = (v) => Math.round((Math.min(v, 100) / 100) * BENCH_W);
export const barFill = (v) => (v > 100 ? '#FF5B3A' : v >= 90 ? '#FFC93C' : '#2D5BFF');

function benchSvg(moving) {
  const first = PHASES[0];
  const replica = (i, y) => `<g data-replica="${i}"><rect x="266" y="${y + 4}" width="320" height="82" rx="8" fill="#141414"/><rect class="sh-rep-box" x="260" y="${y}" width="320" height="82" rx="8" fill="#FFFCF4" stroke="#141414" stroke-width="2.5"/>
    <text class="sh-svg-label" x="280" y="${y + 34}">Replica ${i + 1}</text><text class="sh-svg-small" x="560" y="${y + 34}" text-anchor="end" data-spare="${i}">${first.spare[i]}</text>
    <rect x="280" y="${y + 48}" width="${BENCH_W}" height="16" fill="#FFF4E0" stroke="#141414" stroke-width="2"/><rect class="sh-rep-bar" data-bar="${i}" x="280" y="${y + 48}" width="${barWidth(first.bars[i])}" height="16" fill="${barFill(first.bars[i])}"/>
    <path class="sh-rep-x" data-x="${i}" d="M296 ${y + 22}l16 16m0-16l-16 16" stroke="#B3261E" stroke-width="3" fill="none" opacity="0"/></g>`;
  const link = (d) => `<path class="sh-flow${moving ? ' is-moving' : ''}" d="${d}" fill="none" stroke="#141414" stroke-width="2.5"/>`;
  return `<svg viewBox="0 0 600 400" role="img" aria-labelledby="sh-bench-t sh-bench-d" focusable="false">
    <title id="sh-bench-t">A load balancer splitting traffic across three replicas</title>
    <desc id="sh-bench-d">Users send requests to a load balancer, which splits them across three replicas. Each replica shows how full it is.</desc>
    <text class="sh-svg-mono" x="2" y="176">Users</text>
    <path d="M2 190H54" stroke="#141414" stroke-width="2.5"/><path d="M62 190l-9-5v10z" fill="#141414"/>
    <rect x="70" y="158" width="120" height="86" rx="8" fill="#141414"/><rect x="64" y="152" width="120" height="86" rx="8" fill="#FFC93C" stroke="#141414" stroke-width="2.5"/>
    <text class="sh-svg-label" x="124" y="190" text-anchor="middle">Load</text><text class="sh-svg-label" x="124" y="214" text-anchor="middle">balancer</text>
    ${link('M190 195C222 195 222 61 252 61')}${link('M190 195H252')}${link('M190 195C222 195 222 329 252 329')}
    <path d="M260 61l-9-5v10z" fill="#141414"/><path d="M260 195l-9-5v10z" fill="#141414"/><path d="M260 329l-9-5v10z" fill="#141414"/>
    ${replica(0, 20)}${replica(1, 154)}${replica(2, 288)}</svg>`;
}

// ctaHtml: the buttons inside the call-to-action row (the game fills it in after drawing, so it may be empty).
export function heroHtml({ ctaHtml = '', note, gated = true, moving = true }) {
  const first = PHASES[0];
  const chips = PHASES.map((p, i) => `<button type="button" class="sh-bench-chip${i === 0 ? ' is-on' : ''}" aria-pressed="${i === 0}">${esc(p.label)}</button>`).join('');
  return `<section class="sh-hero"><div class="sh-hero-copy"><p class="sh-eyebrow">Free system design practice</p><h1 class="sh-display">Build the system. Survive the day.</h1><p class="sh-lead">A free browser game where you draw a system, run a full day of traffic through it, and read what held, what broke and what it cost.</p><div class="sh-gate"><div class="sh-cta-row">${ctaHtml}</div><p class="sh-gate-note" aria-live="polite">${esc(note)}</p></div><div class="sh-oss"><p>${gated ? 'Would rather not sign in? The whole game is open source (MIT). Run the code yourself.' : 'The whole game is open source (MIT). Read it, run it or fork it.'}</p><a class="sh-text-link" href="https://github.com/adityareddy-dev/system-designer" rel="noopener">Get the source on GitHub${ARROW}</a></div></div><figure class="sh-bench" aria-label="Try a capacity experiment" data-state="steady"><div class="sh-bench-head"><span class="sh-bench-title">Try it</span><div class="sh-bench-chips" role="group" aria-label="Pick a situation">${chips}</div></div><div class="sh-bench-readout"><strong class="sh-bench-rate">${first.rate}</strong><span>requests per second arriving</span></div><figcaption class="sh-bench-caption" role="status">${esc(first.text)}</figcaption><div class="sh-bench-svg">${benchSvg(moving)}</div><p class="sh-bench-foot">A simplified picture. Real numbers in the game are rounded estimates.</p></figure></section>`;
}
