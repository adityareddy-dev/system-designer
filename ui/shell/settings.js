// Settings store and the settings view (theme, motion, sound, shapes legend, data).
import { h, ico, clear, append } from './dom.js';
import { confirmDialog, toast, modal } from './overlay.js';
import { mountFeedback } from './feedback.js';
import { metrics } from '../../core/metrics.js';

export const SETTING_DEFAULTS = {
  theme: 'system', reducedMotion: 'system', quality: 'auto', soundMaster: 0.6, soundMuted: false,
  ambient: true, autoSlowOnEvent: true, highContrast: false, playerName: '', anonymousCounts: true,
};

const CHECK = {
  theme: (v) => ['system', 'light', 'dark'].includes(v),
  reducedMotion: (v) => ['system', 'reduce', 'full'].includes(v),
  quality: (v) => ['auto', 'high', 'medium', 'low'].includes(v),
  soundMaster: (v) => typeof v === 'number' && v >= 0 && v <= 1,
  soundMuted: (v) => typeof v === 'boolean',
  ambient: (v) => typeof v === 'boolean',
  autoSlowOnEvent: (v) => typeof v === 'boolean',
  highContrast: (v) => typeof v === 'boolean',
  playerName: (v) => typeof v === 'string' && v.length <= 24,
  anonymousCounts: (v) => typeof v === 'boolean',
};

export function createSettings(store, bus) {
  const saved = store.get('settings', {}) || {};
  const state = { ...SETTING_DEFAULTS };
  for (const k of Object.keys(SETTING_DEFAULTS)) if (k in saved && CHECK[k](saved[k])) state[k] = saved[k];
  return {
    get: (key) => state[key],
    set(key, value) {
      if (!(key in SETTING_DEFAULTS) || !CHECK[key](value)) return false;
      state[key] = value;
      store.set('settings', { ...state });
      bus.emit('settings', { key, value });
      return true;
    },
    all: () => ({ ...state }),
  };
}

function segmented(label, options, current, onPick) {
  const wrap = h('div', { class: 'sh-seg', role: 'radiogroup', 'aria-label': label });
  const btns = options.map(([value, text, iconId]) => {
    const b = h('button', { type: 'button', class: 'sh-seg-btn', role: 'radio', 'aria-checked': String(value === current), dataset: { value } },
      iconId ? ico(iconId, 18) : null, h('span', { text }));
    b.addEventListener('click', () => {
      onPick(value);
      btns.forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    });
    return b;
  });
  append(wrap, btns);
  return wrap;
}

function toggleRow(title, desc, checked, onChange, id) {
  const input = h('input', { type: 'checkbox', class: 'sh-switch-input', id, role: 'switch' });
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'sh-row', for: id },
    h('span', { class: 'sh-row-text' }, h('span', { class: 'sh-row-title', text: title }), desc ? h('span', { class: 'sh-row-desc', text: desc }) : null),
    h('span', { class: 'sh-switch' }, input, h('span', { class: 'sh-switch-track', 'aria-hidden': 'true' }, h('span', { class: 'sh-switch-thumb' }))));
}

function row(title, desc, control) {
  return h('div', { class: 'sh-row sh-row--stack' },
    h('span', { class: 'sh-row-text' }, h('span', { class: 'sh-row-title', text: title }), desc ? h('span', { class: 'sh-row-desc', text: desc }) : null),
    control);
}

function card(title, ...kids) {
  return h('section', { class: 'sh-card sh-settings-card' }, h('h2', { class: 'sh-card-title', text: title }), ...kids);
}

export function renderSettings(hostEl, ctx) {
  const { settings, progress } = ctx;
  clear(hostEl);
  const page = h('div', { class: 'sh-page sh-page--narrow' });
  const set = (k, v) => { settings.set(k, v); };

  // Appearance
  const themeSeg = segmented('Theme', [['system', 'System', 'ui.theme-system'], ['light', 'Light', 'ui.theme-light'], ['dark', 'Dark', 'ui.theme-dark']], settings.get('theme'), (v) => set('theme', v));
  const appearance = card('Appearance',
    row('Theme', 'System follows your device.', themeSeg),
    toggleRow('High contrast', 'Stronger borders and text for hard lighting or low vision.', settings.get('highContrast'), (v) => set('highContrast', v), 'sh-s-contrast'));

  // Motion
  const motion = card('Motion and speed',
    row('Reduced motion', 'Replaces moving dots with still flow bands and turns off bounces.',
      segmented('Reduced motion', [['system', 'System'], ['reduce', 'Reduce'], ['full', 'Full motion']], settings.get('reducedMotion'), (v) => set('reducedMotion', v))),
    row('Graphics quality', 'Auto lowers effects on slower devices. Lower it if the canvas stutters.',
      segmented('Graphics quality', [['auto', 'Auto'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], settings.get('quality'), (v) => set('quality', v))),
    toggleRow('Slow down when something breaks', 'The traffic day drops to a calmer speed when an event starts, so you can watch it.', settings.get('autoSlowOnEvent'), (v) => set('autoSlowOnEvent', v), 'sh-s-slow'));

  // Sound
  const vol = h('input', { type: 'range', class: 'sh-range', min: '0', max: '100', step: '1', 'aria-label': 'Master volume' });
  vol.value = String(Math.round(settings.get('soundMaster') * 100));
  const volOut = h('output', { class: 'sh-range-out', text: vol.value + '%' });
  vol.addEventListener('input', () => { volOut.textContent = vol.value + '%'; set('soundMaster', Number(vol.value) / 100); });
  vol.addEventListener('change', () => { try { ctx.audio.play('ui.tap'); } catch { /* ignore */ } });
  const sound = card('Sound',
    toggleRow('Sound on', 'All sounds are made live in your browser. No downloads.', !settings.get('soundMuted'), (v) => { set('soundMuted', !v); if (v) { try { ctx.audio.unlock(); ctx.audio.play('ui.tap'); } catch { /* ignore */ } } }, 'sh-s-sound'),
    row('Volume', null, h('div', { class: 'sh-range-wrap' }, vol, volOut)),
    toggleRow('Ambient hum', 'A quiet bed that rises with traffic load.', settings.get('ambient'), (v) => set('ambient', v), 'sh-s-ambient'));

  // Shapes legend
  const legend = h('div', { class: 'sh-legend', role: 'list' });
  const shapesCard = card('Shapes and colours',
    h('p', { class: 'sh-muted', text: 'Every kind of request has its own shape as well as a colour, always on, so nothing depends on telling colours apart.' }), legend);
  fillLegend(legend, ctx);

  // Profile
  const name = h('input', { type: 'text', class: 'sh-input', maxlength: '24', placeholder: 'Shown on result cards and shared links', 'aria-label': 'Display name', autocomplete: 'nickname' });
  name.value = settings.get('playerName');
  name.addEventListener('change', () => set('playerName', name.value.trim().slice(0, 24)));
  const profile = card('Profile', row('Display name', 'Optional. It travels inside links you share.', name));

  // Data
  const statsText = () => {
    const stats = progress.stats();
    return `Progress is saved in this browser. ${stats.solved} problems solved, ${stats.lessonsDone} lessons done, ${stats.stars} stars.`;
  };
  const statsSummary = h('p', { class: 'sh-muted', text: statsText() });
  const fileIn = h('input', { type: 'file', accept: 'application/json,.json', class: 'sh-hidden', 'aria-label': 'Import progress file' });
  fileIn.addEventListener('change', async () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!progress.importAll(data)) throw new Error('bad');
      toast({ text: 'Progress imported.', level: 'ok' });
    } catch { toast({ text: 'That file is not a System Designer backup.', level: 'bad' }); }
    fileIn.value = '';
  });
  const data = card('Your data',
    statsSummary,
    h('div', { class: 'sh-btn-row' },
      h('button', { type: 'button', class: 'sh-btn', onclick: () => exportProgress(progress) }, ico('ui.download', 18), 'Export backup'),
      h('button', { type: 'button', class: 'sh-btn', onclick: () => fileIn.click() }, ico('ui.copy', 18), 'Import backup'),
      h('button', { type: 'button', class: 'sh-btn sh-btn--danger', onclick: async () => {
        const ok = await confirmDialog({ title: 'Reset all progress?', text: 'This clears stars, scores and finished lessons in this browser. It cannot be undone.', confirmLabel: 'Reset', danger: true });
        if (ok) { progress.reset(); toast({ text: 'Progress cleared.', level: 'info' }); statsSummary.textContent = statsText(); }
      } }, ico('ui.delete', 18), 'Reset progress'),
      fileIn));

  // Shortcuts
  const keys = [['Enter', 'Start the traffic day'], ['Space', 'Pause or resume'], ['1 to 7', 'Speed: 0, 0.25, 0.5, 1, 2, 4, 8 times'], ['F', 'Fit the view'], ['/', 'Search the toolbar'], ['H', 'Show a hint'], ['M', 'Mute'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo and redo'], ['Delete', 'Remove the selected element'], ['Ctrl+D', 'Duplicate'], ['Esc', 'Cancel']];
  const keysCard = card('Keyboard shortcuts', h('dl', { class: 'sh-keys' }, keys.map(([k, v]) => [h('dt', null, h('kbd', { class: 'sh-kbd', text: k })), h('dd', { text: v })])));

  const feedbackHost = h('div');
  const privacy = card('Privacy and feedback',
    metrics.countsAvailable()
      ? toggleRow('Anonymous usage counts', 'Helps us see what gets played and where the game breaks. No cookies or player ids. Browser privacy signals turn this off too.', settings.get('anonymousCounts'), v => set('anonymousCounts', v), 'sh-s-counts')
      : h('p', { class: 'sh-muted', text: 'Automatic usage counts and error reports are disabled.' }),
    h('a', { href: new URL('./privacy.html', document.baseURI).href, text: 'Read the privacy page' }),
    h('button', { type: 'button', class: 'sh-btn', 'data-feedback-general': '', text: 'Send feedback', onclick: event => {
      feedbackHost.replaceChildren(); mountFeedback(feedbackHost, ctx, 'general', null, true, event.currentTarget); feedbackHost.querySelector('input')?.focus();
    } }), feedbackHost);
  append(page, [h('h1', { class: 'sh-h1', text: 'Settings' }), appearance, privacy, motion, sound, shapesCard, profile, data, keysCard]);
  hostEl.append(page);
  const off = ctx.bus.on('settings', ({ key, value }) => {
    const label = { theme: 'Theme', reducedMotion: 'Reduced motion', quality: 'Graphics quality' }[key];
    if (label) page.querySelectorAll(`[role="radiogroup"][aria-label="${label}"] [role="radio"]`).forEach(b => b.setAttribute('aria-checked', String(b.dataset.value === value)));
  });
  return off;
}

async function fillLegend(legend, ctx) {
  try {
    const { shapeSvg } = await import('../../assets/shapes.js');
    for (const t of ctx.catalog.requests) {
      const item = h('div', { class: 'sh-legend-item', role: 'listitem' });
      const sw = h('span', { class: 'sh-legend-shape' });
      sw.style.color = `var(--req-${t.family})`;
      sw.innerHTML = shapeSvg(t.shape, { size: 22, fill: 'currentColor' });
      item.append(sw, h('span', { text: t.name }));
      legend.append(item);
    }
  } catch { legend.hidden = true; }
}

function exportProgress(progress) {
  try {
    const blob = new Blob([JSON.stringify(progress.exportAll(), null, 2)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'system-designer-progress.json' });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  } catch {
    modal({ title: 'Could not export', body: h('p', { text: 'This browser blocked the download.' }) });
  }
}
