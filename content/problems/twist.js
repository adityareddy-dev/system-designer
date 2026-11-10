// Applies a calibrated transfer without changing the original problem or saved design.
export function twistProblem(problem) {
  const twist = problem.twist;
  const requirements = { ...problem.requirements, ...twist.requirements };
  const [type, share] = Object.entries(requirements.mix).sort((a,b) => b[1] - a[1])[0];
  const crowd = twist.events.find(e => e.id === 'flash-crowd');
  const drop = problem.traffic?.curve === 'drop' && !!crowd;
  const normal = requirements.peakRps * (drop ? .1 : 1);
  const factor = drop ? crowd?.params?.factor || 25 : 1;
  const peak = normal * factor;
  const typeFactor = drop && (!crowd?.params?.types || crowd.params.types.includes(type)) ? factor : 1;
  const typePeak = +(normal * share * typeFactor).toPrecision(12);
  const numbers = [
    { label: drop ? 'New event peak arrivals' : 'New arrival rate setting', value: peak, unit: 'requests/s', ask: true, how: drop ? `${requirements.peakRps} × 0.1 on the drop curve = ${normal} normal requests/s; × ${factor} during the crowd = ${peak} event peak requests/s, before retries.` : `The arrival rate setting is ${requirements.peakRps} requests/s. The traffic curve and scheduled events multiply this setting; retries add internal work.` },
    { label: drop ? `Event peak ${type} arrivals` : `${type} arrival rate setting`, value: typePeak, unit: 'requests/s', ask: true, how: `${normal * typeFactor} × ${+share.toPrecision(12)} = ${typePeak} ${type} requests/s before retries${drop ? ' during the crowd' : ', before curve or event multipliers'}.` },
    { label: 'New monthly cost ceiling', value: requirements.budgetPerMonth, unit: 'dollars/month', ask: true, how: `The binding operating ceiling is $${requirements.budgetPerMonth}/month. Existing stored data, retention and recovery promises still apply.` }
  ];
  return { ...problem, twistDay: true, warmUp: false, brief: twist.brief || problem.brief,
    numbers, requirements: { ...requirements, notes: ['Use the new arrival rate and ceiling for this transfer. Notes from the original brief below describe the base workload. Existing stored volume, data and recovery promises remain binding.', ...(requirements.notes || [])] }, events: twist.events,
    editorial: twist.design ? { ...problem.editorial, designs: [twist.design] } : problem.editorial };
}
