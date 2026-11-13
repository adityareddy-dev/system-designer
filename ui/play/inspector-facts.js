// Capacity and live status wording for the inspector.
import { fmtNum, STATUS_NAMES, STATUS_TEXT } from './util.js';

export function capacityText(el, node, tiers) {
  const perUnit = el.capacity.rps * (tiers[node.tier || 'M']?.capacity ?? 1);
  const units = el.units?.max === 1 ? 1 : (node.units ?? el.units?.default ?? 1);
  const unit = (el.capacity.unit || '').replace(/^.*?per second\s+/, '');
  const detail = el.units?.max === 1 ? unit : `${fmtNum(perUnit)} req/s ${unit.startsWith('per ') ? unit : 'per ' + (el.units?.label || 'unit')}`;
  const writes = el.capacity.writeRps ? ` (about ${fmtNum(el.capacity.writeRps * (tiers[node.tier || 'M']?.capacity ?? 1) * units)} of them writes)` : '';
  return `${fmtNum(perUnit * units)} req/s total${writes}, ${detail} at 100% busy`;
}

export function inspectorStatus(s) {
  const status = typeof s.status === 'number' ? STATUS_NAMES[s.status] : s.status;
  const name = STATUS_NAMES.includes(status) ? status : 'ok';
  const lowLoad = Number.isFinite(s.util) && s.util < .7;
  const service = name === 'ok' || (lowLoad && name !== 'down') ? '' : STATUS_TEXT[name];
  const failing = s.failRps > 0.5 ? 'Requests failing' : '';
  if (s.status == null) return { name: 'ok', text: 'Not measured yet' };
  return { name, text: name === 'down' ? 'Down' : ['Available', service, failing].filter(Boolean).join(' · ') };
}
