// Shared by the static front page and the live app.
const glyphs = {
  clients: '<rect x="3" y="5" width="13" height="10" rx="1"/><path d="M6 19h7"/><rect x="16" y="11" width="5" height="8" rx="1"/>',
  cdn: '<circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c5 4 5 12 0 16-5-4-5-12 0-16Z"/>',
  lb: '<path d="M4 12h6m0 0 6-6h4m-10 6 6 6h4"/><circle cx="4" cy="12" r="1"/>',
  api: '<rect x="4" y="4" width="16" height="6" rx="1"/><rect x="4" y="14" width="16" height="6" rx="1"/><path d="M7 7h2m-2 10h2"/>',
  cache: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3m-10-2h4"/>',
  db: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 4 14 4 14 0V6M5 12c0 4 14 4 14 0"/>',
};

export const TRAFFIC_NODES = [
  ['clients', 'Clients', 'Browser + phone'],
  ['cdn', 'CDN', 'Edge cache'],
  ['lb', 'Balancer', 'Regional routing'],
  ['api', 'App servers', '6 instances'],
  ['cache', 'Cache', '3 instances'],
  ['db', 'Store', 'Key-value'],
];

export function heroHtml() {
  const nodes = TRAFFIC_NODES.map(([id, label, detail]) => `<button type="button" class="tl-node" data-node="${id}" aria-pressed="${id === 'api'}" ${id === 'cdn' ? 'hidden' : ''} disabled>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[id]}</svg>
    <strong>${label}</strong><span>${detail}</span><i aria-hidden="true"></i></button>`).join('');
  return `<section class="tl-hero" aria-labelledby="tl-title">
    <div class="tl-intro">
      <p class="tl-kicker">SYSTEM DESIGN SIMULATOR</p>
      <h1 id="tl-title">What breaks<br> at <em>3× traffic?</em></h1>
      <p class="tl-lede">Run a URL shortener through a viral spike. Change the design, replay the same load, and see what it costs to keep serving.</p>
      <div class="tl-hero-actions"><a class="tl-primary" data-first-run href="#/practice/url-shortener">Run the spike <span aria-hidden="true">↗</span></a><a href="#/sandbox">Open sandbox</a></div>
      <p class="tl-free">Free to play · No account or email required</p>
    </div>
    <section class="tl-lab" aria-labelledby="tl-scenario">
      <header class="tl-header">
        <div><p>TRAFFIC LAB</p><h2 id="tl-scenario">URL shortener</h2></div>
        <span class="tl-event"><i></i>19:30 <b>Viral spike</b></span>
      </header>
      <div class="tl-toolbar">
        <div class="tl-designs" role="group" aria-label="Designs">
          <button type="button" data-design="baseline" aria-pressed="true" disabled>Six servers</button>
          <button type="button" data-design="scale" aria-pressed="false" disabled>Twelve servers</button>
          <button type="button" data-design="edge" aria-pressed="false" disabled>Six + CDN</button>
        </div>
        <button type="button" class="tl-run" disabled>Run simulation</button>
      </div>
      <div class="tl-stage">
        <div class="tl-wireframe" aria-label="Request path">${nodes}</div>
        <div class="tl-inspector"><strong>App servers</strong><span>6 instances · Select a component to inspect it.</span></div>
      </div>
      <div class="tl-measure">
        <div class="tl-meters">
          <div><span>Offered / sec</span><strong data-meter="offered">…</strong></div>
          <div><span>Served / sec</span><strong data-meter="served">…</strong></div>
          <div><span>Dropped / sec</span><strong data-meter="dropped">…</strong></div>
        </div>
        <div class="tl-plot">
          <div class="tl-legend"><span><i></i>Offered</span><span><i></i>Served</span><time>19:20</time></div>
          <svg viewBox="0 0 600 90" preserveAspectRatio="none" aria-hidden="true">
            <path class="tl-grid" d="M0 1H600 M0 30H600 M0 60H600 M0 89H600 M38 0V90 M150 0V90 M377 0V90"/>
            <path class="tl-marker" d="M38 0V90"/>
            <path class="tl-lost"/><path class="tl-offered"/><path class="tl-served"/>
          </svg>
          <div class="tl-axis"><span>19:20</span><span>20:00</span><span>21:00</span><span>22:00</span></div>
        </div>
        <div class="tl-scrub" hidden><label for="tl-replay">Replay</label><input id="tl-replay" type="range" min="0" value="0"></div>
        <p class="tl-status" role="status">Compare three designs against the same traffic day.</p>
      </div>
      <section class="tl-results" aria-label="Run comparison" hidden>
        <table><caption>Compare runs</caption><thead><tr><th scope="col">Design</th><th scope="col">Spike dropped</th><th scope="col">Day served</th><th scope="col">Worst p99</th><th scope="col">Est. / month</th></tr></thead><tbody></tbody></table>
      </section>
    </section>
  </section>`;
}
