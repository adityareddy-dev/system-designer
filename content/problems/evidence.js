// Workload assumptions separate device ingestion from human queries and leave estimates for the player.
const SOURCE_TYPES = {
  'fleet-telemetry': { 'iot-device': ['telemetry'], 'admin-console': ['read', 'report'] },
  'industrial-sensors': { 'iot-device': ['telemetry', 'event'], 'admin-console': ['read', 'report'] },
  'ev-charging-network': { 'iot-device': ['telemetry', 'event'], 'mobile-app': ['read', 'write', 'login'] },
  'ride-hailing-dispatch': { 'iot-device': ['location'], 'mobile-app': ['read', 'write', 'payment', 'notify'] },
  'smart-home-hub': { 'iot-device': ['telemetry', 'event', 'message'], 'mobile-app': ['read', 'notify', 'message'] },
  'smart-power-grid': { 'iot-device': ['telemetry', 'event', 'notify'], 'web-browser': ['read', 'write'], 'admin-console': ['read', 'report', 'write'] },
  'firmware-rollout': { 'iot-device': ['read', 'telemetry', 'event'], 'admin-console': ['read', 'write'] },
};
const NOTES = {
  'rate-limiter-service': ['Estimate memory for 2 million counters at about 100 bytes per key, including overhead.'],
  'login-sso': ['Use the peak and request mix to split sign-ins from session checks.'],
  'object-storage': ['Uploads average a few MB. Use the request mix to work out their peak rate.'],
  'video-on-demand': ['Each viewer fetches one 2 MB chunk every 4 seconds.'],
  'live-streaming': ['Each live piece is 1 MB and covers 2 seconds.'],
  'food-delivery': ['Use the payment share to estimate order rate. Card data stays with the payment company.'],
  'restaurant-reservations': ['Estimate bookings from the write share at the Friday peak.'],
  'hotel-booking': ['Split peak traffic into searches, page views and booking steps using the request mix.'],
  'concert-ticket-drop': ['Use the rush multiplier and the request mix to estimate seat holds and payments.'],
  'smart-home-hub': ['Each hub sends a batch of device states every few minutes.'],
  'smart-power-grid': ['Each reading is about 100 bytes; estimate long-term storage before adding copies.'],
  'industrial-sensors': ['Machines send readings throughout the day, without a quiet night.'],
  'shopping-cart': ['Use the write share to estimate peak cart changes.'],
  'flash-sale-inventory': ['Inventory is limited. Use the request mix to estimate how fast buy attempts arrive.'],
  'black-friday-marketplace': ['Use the peak and mix to estimate payment and search rates separately.'],
  'bulk-sms-campaigns': ['Carrier throughput is fixed. Estimate peak sending rate before sizing the queue.'],
  'ci-cd-pipeline': ['A build takes about 5 minutes and produces a 5 MB artifact. Convert peak batch arrivals into concurrent work.'],
};
export function applyEvidence(problem) {
  const replacement = NOTES[problem.id];
  const revealsAnswer = note => problem.numbers.some(n => n.ask && n.value >= 10 &&
    [String(n.value), n.value.toLocaleString('en-US')].some(v => new RegExp('(?<![0-9])' + v.replaceAll('.', '\\.') + '(?![0-9])').test(note)));
  const notes = replacement ? [...replacement, ...(problem.requirements.notes || []).filter(note => !revealsAnswer(note))] : problem.requirements.notes;
  return { ...problem,
    traffic: SOURCE_TYPES[problem.id] ? { ...problem.traffic, sourceTypes: SOURCE_TYPES[problem.id] } : problem.traffic,
    requirements: replacement ? { ...problem.requirements, notes } : problem.requirements,
    events: problem.events.map(e => e.id === 'thundering-herd' && !e.text && !(e.params?.types || []).includes('login') ? { ...e, text: {
      name: 'Synchronized rush', description: 'Many callers send requests together instead of spreading them over time.',
      debrief: { headline: 'A synchronized rush hit {node}.', hurt: '{failed} requests failed during the rush.', fix: 'Spread scheduled work over time and keep spare capacity on the affected path. A rate limiter protects downstream work by rejecting excess calls, so it cannot by itself meet every availability target.' },
    } } : e),
  };
}
