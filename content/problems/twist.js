// Applies a calibrated transfer without changing the original problem or saved design.
export function twistProblem(problem) {
  const twist = problem.twist;
  const requirements = { ...problem.requirements, ...twist.requirements };
  const [type, share] = Object.entries(requirements.mix).sort((a,b) => b[1] - a[1])[0];
  const numbers = [
    { label: 'New peak arrivals', value: requirements.peakRps, unit: 'requests/s', ask: true, how: `This transfer specifies about ${requirements.peakRps} arriving requests/s, before retries or event multipliers.` },
    { label: `Peak ${type} arrivals`, value: requirements.peakRps * share, unit: 'requests/s', ask: true, how: `${requirements.peakRps} × ${share} = ${requirements.peakRps * share} ${type} requests/s before retries.` },
    { label: 'New monthly cost ceiling', value: requirements.budgetPerMonth, unit: 'dollars/month', ask: true, how: `The binding operating ceiling is $${requirements.budgetPerMonth}/month. Existing stored data, retention and recovery promises still apply.` }
  ];
  return { ...problem, twistDay: true, warmUp: false, brief: twist.brief || problem.brief,
    numbers, requirements: { ...requirements, notes: ['Use the new arrival rate and ceiling for this transfer. Notes from the original brief below describe the base workload. Existing stored volume, data and recovery promises remain binding.', ...(requirements.notes || [])] }, events: twist.events,
    editorial: twist.design ? { ...problem.editorial, designs: [twist.design] } : problem.editorial };
}
