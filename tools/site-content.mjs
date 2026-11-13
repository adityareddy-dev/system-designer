// Readable problem and lesson bodies derived from the game's authored content and catalog.
import { latencyTarget, queueLimitFor } from '../sim/engine.js';
import { makeInstance } from '../sim/events.js';
import { esc, num, pct, para, list, link, relative } from './site-template.mjs';

const SAFETY = { 'no-loss':'No acknowledged write may be lost.', 'rpo-1m':'At most 1 minute of writes may be lost.', 'best-effort':'Best effort: small losses are tolerated.' };
const CURVE = {flat:'Fairly steady traffic throughout the day', 'consumer-evening':'Consumer traffic, busiest in the evening', 'business-hours':'Traffic concentrated in working hours', commute:'Morning and evening commute peaks', meals:'Lunch and evening meal peaks', 'market-hours':'Traffic concentrated around market hours', 'global-follow-sun':'Traffic following users around the world', 'night-batch':'Most background work runs at night', deadline:'Traffic builds toward a deadline', drop:'A quiet baseline followed by the scheduled rush'};
const field = (k,v)=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`;
export function requirements(p, catalog) {
  const r = p.requirements;
  const request = id => catalog.requestById.get(id);
  const region = id => catalog.world.regions.find(x=>x.id===id)?.name || id;
  const rows = [
    ['Who uses it',r.users],
    ...(r.monthlyUsers ? [['Audience in plain numbers',num(r.monthlyUsers) + (r.users?.includes('month') ? ' people per month' : ' users or devices')]]:[]),
    ['Normal peak',`≈ ${num(r.peakRps * (p.traffic?.curve==='drop' ? .1 : 1))} requests per second`],
    ['Request mix',Object.entries(r.mix).map(([id,share])=>`${request(id)?.name || id}: ${pct(share)}`).join('; ')],
    ['Speed for 99 of 100 requests',Object.keys(r.mix).filter(id=>request(id)?.interactive).map(id=>`${request(id)?.name || id}: ≈ ${num(latencyTarget(r.latencyP99Ms, request(id)))} ms`).join('; ') || 'Background workload; see waiting deadlines'],
    ['Successful requests',pct(r.availability)],
    ['Data safety',SAFETY[r.dataSafety] || r.dataSafety],
    ['Monthly budget',`≈ $${num(r.budgetPerMonth)}`],
    ...(r.storageTb != null ? [['Data at rest',`≈ ${num(r.storageTb)} TB`]]:[]),
    ['Where users are',Object.entries(r.userRegions || {}).map(([id,share])=>`${region(id)}: ${pct(share)}`).join('; ')],
    ...(r.homeRegion ? [['Home region',region(r.homeRegion)]]:[]),
    ['Waiting deadlines',Object.keys(r.mix).map(id=>`${request(id)?.name || id}: ${num(queueLimitFor(r,request(id)))} seconds`).join('; ')],
    ...(r.retentionDays ? [['Minimum retained history',`${num(r.retentionDays)} days on authoritative stores`]]:[]),
    ...(r.maxRetentionDays ? [['Maximum retained history',`${num(r.maxRetentionDays)} day`]]:[]),
    ...(r.readYourWrites ? [['Fresh reads','People must see their own changes. At most 0.1% of reads may be stale in the model.']]:[]),
    ...(r.privateReads ? [['Personal reads',`${pct(r.privateReads)} of reads are private; a shared public copy cannot answer them.`]]:[]),
    ...(r.compliance?.length ? [['Required proofs',r.compliance.map(id=>catalog.world.complianceChecks.find(c=>c.id===id)?.name || id).join('; ')]]:[])
  ];
  return `<dl class="site-facts">${rows.map(([k,v])=>field(k,v)).join('')}</dl><p class="site-note">≈ marks an approximation, just as in the game. Waiting deadlines measure the age of queued work and are separate from interactive response time.</p>${list(r.notes || [])}`;
}
export function estimates(p) {
  return `<dl class="site-facts">${(p.numbers || []).map(n=>field(n.label,`≈ ${num(n.value)} ${n.unit}. ${n.how}`)).join('')}</dl>`;
}
const effectFact = ({op,params:p}, catalog) => {
  const out = [];
  if (op==='traffic') {
    const types = p.types?.map(id => catalog.requestById.get(id)?.name || id);
    out.push(`${types ? 'Traffic for ' + types.join(', ') : 'Traffic'} reaches ${num(p.factor)} times the scheduled load; rises over ${num(p.rampSec)} seconds, holds for ${num(p.holdSec)} seconds and eases over ${num(p.decaySec)} seconds.${types ? ' Other request types keep their scheduled load.' : ''}`);
  }
  if (op==='attack') out.push(`Extra attack traffic is ${p.factorOfPeak === 1 ? 'equal to' : p.factorOfPeak === 0.5 ? 'half of' : num(p.factorOfPeak) + ' times'} the configured peak.`);
  if (op==='fail' && p.errorRate != null) out.push(`Failed calls: ${pct(p.errorRate)}.`);
  if (op==='fail' && p.addLatencyMs != null) out.push(`Added response time: ≈ ${num(p.addLatencyMs)} ms.`);
  if (['fanout','costMultiplier','capacity'].includes(op)) out.push(`${op==='fanout' ? 'Work' : op==='costMultiplier' ? 'Billed usage' : 'Available capacity'} multiplier: ${num(p.factor)}.`);
  if (p.perHour != null) out.push(`Capacity lost per hour: ${pct(p.perHour)}.`);
  if (p.addMs != null) out.push(`Added startup time: ≈ ${num(p.addMs)} ms.`);
  if (p.restartSec != null) out.push(`Restart window: ≈ ${num(p.restartSec)} seconds.`);
  if (p.share != null) out.push(`Affected share: ${pct(p.share)}.`);
  if (p.rpsCapFactor != null) out.push(`Provider capacity falls to ${pct(p.rpsCapFactor)} of its configured quota.`);
  if (p.lagSec != null) out.push(`Copy lag: ≈ ${num(p.lagSec)} seconds.`);
  if (p.recoverSec != null) out.push(`Recovery window: ≈ ${num(p.recoverSec)} seconds.`);
  if (p.durationSec != null) out.push(p.durationSec === 'untilFixed' ? 'Lasts until detected and repaired.' : `${op === 'retryAmplify' ? 'Retries keep adding load for' : op === 'fail' ? 'The failure lasts' : 'Duration:'} ≈ ${num(p.durationSec)} seconds.`);
  return out.join(' ');
};
// Quantities belong to the merged effect facts, not the catalog's default story.
const EVENT_STORY = {
  'flash-crowd': 'A scheduled launch brings a sudden rush of requests.',
  'celebrity-fanout': 'A popular account posts, multiplying the work needed to update follower feeds.',
  'db-failover': 'The primary database dies. Recovery depends on the standby and failover settings.',
  'zone-outage': 'An availability zone loses power or network access.',
  'region-outage': 'A whole cloud region goes down.',
  'slow-dependency': 'An outside service slows down. Your servers fill with requests waiting on it.',
  'dependency-outage': 'An outside service fails calls during an outage.',
  'retry-storm': 'A brief failure causes clients to retry, adding load while the service recovers.',
  'ddos-attack': 'A botnet floods the system with junk requests.',
  'bot-scraping': 'Bots try stolen passwords and scrape pages, adding unwanted traffic.',
  'bad-deploy': 'A new version ships with a bug and some requests fail.',
  'noisy-neighbor': 'A competing workload reduces the capacity available to the live service.',
  'cold-start': 'A burst needs new serverless instances, adding startup delay.',
  'duplicate-delivery': 'The queue redelivers messages. Without duplicate protection, side effects may be applied twice.',
  'network-partition': 'Your regions cannot talk to each other during the partition.',
  'dns-misconfig': 'A wrong DNS record sends users to an unavailable address until the cached mistake expires.',
  'data-corruption': 'A buggy data change damages rows, and replicas copy the damage.',
  'cardinality-explosion': 'A metric label creates many more distinct series, increasing the bill.',
  'gpu-shortage': 'Demand rises while the cloud cannot supply more GPUs.',
  'schema-migration-lock': 'A schema change locks a busy table, blocking writes.',
  'overseas-launch': 'A launch brings users who are far from your servers.',
};
export function trafficDay(p,catalog) {
  const events = (p.events || []).map((entry,i)=>{
    const inst = makeInstance(catalog,entry,i,catalog.world.sim.dayMs);
    const time = entry.at || `${Math.floor(entry.atMs/3600000).toString().padStart(2,'0')}:${Math.floor(entry.atMs/60000)%60}`;
    return `<li><h3>${esc(time)} · ${esc(inst.name)}</h3>${para(entry.text?.description ?? EVENT_STORY[inst.id] ?? inst.def.description)}${para(inst.effects.map(effect => effectFact(effect, catalog)).filter(Boolean).join(' '))}</li>`;
  }).join('');
  return `${para((CURVE[p.traffic.curve] || p.traffic.curve) + '. The clock covers 00:00 to 24:00 in the home region. Events add pressure on top of that normal traffic.')}${events ? `<ol>${events}</ol>`:para('This scenario has no scheduled disruptions. Test whether the design meets the steady workload.')}`;
}
export function relatedProblems(p,problems) {
  return problems.filter(q=>q.id!==p.id).map((q,i)=>({q,i,rank:q.concepts.filter(c=>p.concepts.includes(c)).length*3+(q.group===p.group?2:0)})).sort((a,b)=>b.rank-a.rank || a.i-b.i).slice(0,4).map(x=>x.q);
}
export function problemBody(p,catalog,problems,lessonById,file,action='') {
  const concepts = p.concepts.map(id=>lessonById.get(id)).filter(Boolean);
  const strong = [p.hints?.[0], p.correctness?.responsibility, ...(p.editorial.tradeoffs || []).slice(0,2)].filter(Boolean);
  return `<div class="site-split"><aside class="site-aside site-panel" aria-label="Play this problem"><span class="site-tag">${esc(p.difficulty)}</span><h2>Play this problem</h2>${para('Draw your design, run a full traffic day and see how it holds.')}${action}</aside><div class="site-prose site-cols"><section id="brief"><h2>The brief</h2>${para(p.brief)}${p.like ? para('Think of '+p.like+'.'):''}</section>
<section id="requirements"><h2>Users, scale and requirements</h2>${requirements(p,catalog)}</section>
<section><h2>Questions that shape the design</h2>${(p.clarify || []).map(c=>`<h3>${esc(c.q)}</h3>${para(c.a)}`).join('')}</section>
<section id="traffic-day"><h2>The traffic day</h2>${trafficDay(p,catalog)}</section>
<section><h2>What a strong design has to handle</h2>${list(strong)}${para('Make a prediction, run a full traffic day, then compare the result. The in-game editorial opens after a finished day and includes measured reference designs.')}</section>
<section><h2>Concepts to practise</h2>${listLinks(concepts.map(l=>[relative(file,`learn/${l.id}/index.html`),l.title]))}</section></div></div>
<section><h2>Related problems</h2>${problemCards(relatedProblems(p,problems),file)}</section>`;
}
export const listLinks = rows => `<ul>${rows.map(([href,text])=>`<li>${link(href,text)}</li>`).join('')}</ul>`;
export function problemCards(problems,file) {
  return `<ul class="site-grid">${problems.map(p=>`<li><span class="site-tag">${esc(p.difficulty)}</span><h3>${link(relative(file,`p/${p.id}/index.html`),p.title)}</h3>${para(p.brief)}</li>`).join('')}</ul>`;
}
export function lessonBody(l,problems,file) {
  const reads = l.steps.filter(s=>s.kind==='read'||s.kind==='figure').map(s=>`<section><h2>${esc(s.title || 'The idea')}</h2>${para(s.text)}${s.diagram ? `<h3>${esc(s.diagram.label)}</h3>${list(s.diagram.parts.map(([label,text])=>label+': '+text))}`:''}</section>`).join('');
  const captions = l.steps.filter(s=>s.kind==='script').flatMap(s=>s.beats).map(b=>b.caption).filter(t=>t && !t.includes('{'));
  const demos = l.steps.filter(s=>s.kind==='demo');
  const numbers = l.steps.filter(s=>s.kind==='numbers').flatMap(s=>s.rows);
  const checks = l.steps.filter(s=>s.kind==='quiz'||s.kind==='defend');
  return `<div class="site-prose site-cols">${reads}${captions.length ? `<section><h2>Your first traffic day</h2>${list(captions)}</section>`:''}
${demos.length ? `<section><h2>Try the idea</h2>${demos.map(s=>para(s.prompt)).join('')}</section>`:''}
${numbers.length ? `<section><h2>Key numbers</h2><dl class="site-facts">${numbers.map(n=>field(n.label,`${n.value}. ${n.how}`)).join('')}</dl></section>`:''}
<section><h2>Check your reasoning</h2>${para('Think through these questions before opening the lesson. In the game you can test the idea and compare your reasoning.')}${list(checks.map(s=>s.q))}</section>
<section class="site-panel"><h2>The key point</h2>${para(l.takeaway)}</section></div>
<section><h2>Practise this idea</h2>${problemCards(problems.filter(p=>p.concepts.includes(l.id)).slice(0,4),file)}${l.id==='intro' ? listLinks([[relative(file,'p/url-shortener/index.html'),'Try the URL shortener next']]):''}</section>`;
}
