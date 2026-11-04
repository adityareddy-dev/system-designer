// Icon access for the DOM: icon(id) gives a ready <svg>, iconInner(id) the drawable part only.
import { ATTRS, ICONS } from './data.js';

export const ICON_IDS = Object.keys(ICONS);

export function hasIcon(id) {
  return Object.prototype.hasOwnProperty.call(ICONS, id);
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Inner markup wrapped in a group that carries the icon's stroke and fill defaults, so it can sit in any <svg> or <g>.
export function iconInner(id) {
  const e = ICONS[id];
  if (!e) return '';
  return `<g ${ATTRS[e[0]]}>${e[1]}</g>`;
}

export function icon(id, { size = 24, title = '' } = {}) {
  const inner = iconInner(id);
  if (!inner) return '';
  const label = title ? ` role="img" aria-label="${esc(title)}"` : ' aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" focusable="false"${label}>${title ? `<title>${esc(title)}</title>` : ''}${inner}</svg>`;
}
