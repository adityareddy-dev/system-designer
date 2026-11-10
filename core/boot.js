// Catch startup and module failures even when the main game cannot load.
import { metrics } from './metrics.js';
addEventListener('error', e => {
  const script = e.target?.tagName === 'SCRIPT';
  if (script || e.error || e.message) metrics.reportError(e.error || { message: e.message }, script ? e.target.src : e.filename, script);
}, true);
addEventListener('unhandledrejection', e => metrics.reportError(e.reason, 'unknown', /dynamically imported module|module script|module specifier/i.test(String(e.reason?.message || ''))));
import('../main.js').catch(e => {
  metrics.reportError(e, 'main.js', true);
  const status = document.querySelector('.sh-boot');
  if (status) status.textContent = 'The game could not start. Please reload the page.';
});
