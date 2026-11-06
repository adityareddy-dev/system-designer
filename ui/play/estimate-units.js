// Display units preserve canonical saved estimates while presenting shares as percentages.
export function estimateUnit(row) {
  const fraction = /^of /.test(row.unit || '');
  const percent = fraction || /^(percent|%)$/.test(row.unit || '');
  const factor = fraction ? 100 : 1;
  const value = row.value * factor;
  const integer = /^(servers?|workers?|nodes?|shards?|GPUs|units)$/i.test(row.unit || '');
  return { factor, percent, value, unit: percent ? '%' : row.unit || 'count', integer,
    lo: percent ? 0 : Math.min(value, Math.max(integer ? 1 : .1, 10 ** (Math.floor(Math.log10(value)) - 2))),
    hi: percent ? 100 : 10 ** (Math.ceil(Math.log10(value)) + 2) };
}

export function estimateFeedback(row, canonical) {
  const { factor, percent, value } = estimateUnit(row);
  const entered = canonical * factor;
  if (percent && entered > 0 && entered <= 1 && value > 2 && Math.max(entered * 100 / value, value / (entered * 100)) <= 2)
    return { cls: 'warn', text: `Unit slip: enter a percent. ${entered} as a fraction means ${entered * 100}%.` };
  const ratio = entered > 0 ? Math.max(entered / value, value / entered) : Infinity;
  if (!percent && [1000, 1000000].some(scale => Math.max(entered * scale / value, value / (entered * scale)) < 1.1 || Math.max(entered / scale / value, value / (entered / scale)) < 1.1))
    return { cls: 'warn', text: `Possible unit slip: check the ${row.unit} label and convert your number before comparing.` };
  return { cls: ratio <= 2 ? 'ok' : ratio <= 5 ? 'warn' : 'bad', text: ratio <= 2 ? 'Good guess: within 2 times.' : ratio <= 5 ? `Close: about ${ratio.toFixed(0)} times off.` : Number.isFinite(ratio) ? `About ${Math.round(ratio)} times off. Worth redoing on paper.` : 'Zero is below the worked estimate. Recheck the workload.' };
}
