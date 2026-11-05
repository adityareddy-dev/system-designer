// Scenario-specific event explanations used by the debrief.
export function eventDescription(def, vars = {}, description = def?.description || '') {
  if (def?.id === 'duplicate-delivery' && vars.share != null && description === def.description) {
    return `The queue redelivers ${vars.share} percent of messages. Without duplicate protection, some side effects are applied twice.`;
  }
  return description;
}
