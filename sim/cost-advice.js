// Cost experiments follow the price dimensions and controls of each catalog part.
export function costAdvice(el) {
  const c = el.cost || {}, knobs = el.knobs || [], actions = [];
  let knob;
  if (c.perThousandUsers) actions.push('This is billed per active user. The workload fixes that user count; compare a different authentication design or provider rather than reducing server capacity.');
  if (c.perMillion) actions.push('This is billed per request. Remove redundant calls and unnecessary retries, or reuse safe answers before this service.');
  if (c.perGB) actions.push('This is billed per GB transferred. Reduce payloads and repeated transfers; compare the edge and origin bill together.');
  if (c.perGBMonth) {
    actions.push('This is billed per GB stored each month. Keep the promised retention and recovery policy; compare compression, deduplication and cheaper storage for older data.');
    if (['queue', 'tap'].includes(el.kind) && knobs.includes('retentionDays')) { actions.push('Only lower Keep for (days) when it still covers the required history and replay window.'); knob = 'retentionDays'; }
  }
  if (c.perUnit) {
    if (knobs.includes('units') && el.units.max > 1) { actions.push('Units have a monthly price. Test a smaller pool against the full peak and failure day before keeping the saving.'); knob = 'units'; }
    else if (knobs.includes('tier')) { actions.push('Size changes the monthly price. Test a smaller size against the full peak and failure day.'); knob = 'tier'; }
  }
  if (knobs.includes('sampling')) { actions.push('Lower Sample rate only if the remaining evidence still answers your incident questions.'); knob = 'sampling'; }
  if (!actions.length) actions.push(c.base ? 'This is a fixed monthly charge. Remove it only if another part still supplies its required behavior.' : 'This part has no direct charge. Check the storage, transfer and services it causes elsewhere.');
  return { text: actions.join(' '), ...(knob ? { knob } : {}) };
}
