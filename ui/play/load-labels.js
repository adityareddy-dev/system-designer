// Named sizing loads shared by the brief, worked answers and debrief.
import { fmtNum } from './util.js';

export function loadSummary(problem) {
  const peak = problem.normalPeakRps ?? problem.requirements?.peakRps;
  const viral = (problem.events || []).find(e => e.id === 'viral-spike');
  const factor = viral?.params?.factor || 3;
  if (problem.id === 'url-shortener') return `${problem.warmUp ? `Warm-up peak: ≈ ${fmtNum(problem.requirements.peakRps)} req/s, no viral spike. ` : ''}Normal peak: ≈ ${fmtNum(peak)} req/s. Request rates and server counts in Numbers use the normal peak; Event peak on the full day: up to ≈ ${fmtNum(peak * factor)} req/s (${factor} times the scheduled load at ${viral?.at || '19:30'}).`;
  if (problem.id === 'concert-ticket-drop') return `Normal peak: ≈ ${fmtNum(peak * 0.1)} req/s. Event peak: ≈ ${fmtNum(peak * 0.1 * ((problem.events || []).find(e => e.id === 'flash-crowd')?.params?.factor || 25))} req/s. Numbers use the event peak for request rates and an assumed 2,000 holds/s for sell-out time.`;
  return '';
}

export function gradingContract(problem) {
  const share = problem.requirements?.latencyBar ?? (problem.difficulty === 'Easy' ? 0.9 : 0.95);
  return `Speed passes when p99 meets the targets above for at least ${Math.round(share * 100)}% of the day (${Math.round((1 - share) * 1440)} slow minutes allowed). Each interactive request type must also meet its own target for at least 80% of its measured time. Reliability, data safety and budget must pass too.`;
}
