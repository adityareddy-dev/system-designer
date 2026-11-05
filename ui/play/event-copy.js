// Scenario-specific event explanations used by the debrief.
export function eventDescription(def, vars = {}) {
  if (def?.id === 'duplicate-delivery' && vars.share != null) {
    return `The queue redelivers ${vars.share} percent of messages. Without duplicate protection, some side effects are applied twice.`;
  }
  return def?.description || '';
}
