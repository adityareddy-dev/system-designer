// Creates the host element for a play canvas, mounts ui/play, and tears it down safely.
import { h, clear } from './dom.js';

// PixiJS is only needed on canvas routes, so it is fetched the first time one opens.
let pixiLoad = null;
export function loadPixi() {
  if (globalThis.PIXI) return Promise.resolve();
  if (!pixiLoad) {
    pixiLoad = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/pixi.js@8.6.6/dist/pixi.min.js';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { pixiLoad = null; s.remove(); reject(new Error('The drawing library could not be loaded. Check your connection and reload.')); };
      document.head.append(s);
    });
  }
  return pixiLoad;
}

export function mountPlayHost(parent, ctx, opts) {
  const host = h('div', { class: 'sh-play-host' });
  // Tells index.html's preload script that the first screen is up, so it can fetch the workbench code now.
  try { document.dispatchEvent(new Event('sd:play')); } catch { /* optional */ }
  const status = h('div', { class: 'sh-play-status', role: 'status' }, opts.placeholder || null, h('span', { text: 'Loading the workbench' }));
  host.append(status);
  parent.append(host);
  let controller = null;
  let dead = false;

  const ready = (async () => {
    try {
      const [{ mountPlay }] = await Promise.all([import('../play/play.js'), loadPixi()]);
      if (dead) return null;
      const c = await mountPlay(host, ctx, opts);
      if (dead) { try { c.destroy(); } catch { /* ignore */ } return null; }
      controller = c;
      status.remove();
      return c;
    } catch (err) {
      if (dead) return null;
      clear(host);
      host.append(h('div', { class: 'sh-play-status sh-play-status--bad', role: 'alert' },
        h('strong', { text: 'The workbench could not start.' }),
        h('span', { text: String(err && err.message ? err.message : err) })));
      ctx.bus.emit('toast', { text: 'Could not start the workbench.', level: 'bad' });
      return null;
    }
  })();

  return {
    host,
    ready,
    get controller() { return controller; },
    destroy() {
      dead = true;
      if (controller) { try { controller.destroy(); } catch { /* ignore */ } controller = null; }
      host.remove();
    },
  };
}
