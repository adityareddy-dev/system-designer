// Draw original industry bench scenes with a distinct physical subject and a working route.
import fs from 'node:fs';
import { iconInner } from '../assets/icons/index.js';
const ink = '#182F40', teal = '#006E68', blue = '#4051A1', ochre = '#865400';
const path = (d, c = ink, w = 2) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const rect = (x,y,w,h,r=5,fill='#FFFEFA') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${ink}" stroke-width="2"/>`;
const text = (x,y,t,size=12,c=ink) => `<text x="${x}" y="${y}" font-family="monospace" font-size="${size}" fill="${c}">${t}</text>`;
const disk = (x,y) => `<circle cx="${x}" cy="${y}" r="5" fill="${teal}"/>`;
const subject = {
  core: rect(32,80,160,92)+path('M32 104h160M48 92h4m8 0h4m8 0h4M55 136h43m-12-12 14 12-14 12M112 124h56m-56 12h39m-39 12h50',blue),
  media: rect(30,64,166,112)+path('m92 92 38 28-38 28z',blue,3)+path('M44 192h18m7 0h5m8 0h80')+disk(62,192),
  social: rect(24,66,124,66)+rect(74,148,120,58)+path('m48 132-8 17 38-17M170 206l14 12-3-12M44 88h82m-82 16h56M91 168h82m-82 16h49',blue),
  fintech: rect(56,50,128,160)+path('M80 80h80M80 104h30m20 0h30M80 128h30m20 0h30M80 152h30m20 0h30M80 182h80',ochre)+path('m142 168 8 8 16-19',teal,3),
  health: rect(34,62,158,144)+path('M74 98h18V80h18v18h18v18h-18v18H92v-18H74z',teal)+path('M54 164h23l9-14 13 32 12-18h60',blue),
  civic: path('m26 106 90-48 90 48z',blue)+rect(40,112,152,14)+path('M56 126v66m38-66v66m44-66v66m38-66v66M32 196h168M28 210h176',blue,3),
  mobility: path('M30 178h170M45 150l28-52h92l28 52',blue)+rect(37,136,166,43)+`<circle cx="68" cy="180" r="15" fill="#FFFEFA" stroke="${ink}" stroke-width="3"/><circle cx="170" cy="180" r="15" fill="#FFFEFA" stroke="${ink}" stroke-width="3"/>`+path('M78 106v30m41-30v30m42-30v30M48 152h22m102 0h22',teal),
  travel: rect(26,85,180,98)+path('M26 116h180M68 85v98M40 99h12M40 135h12M40 156h12M94 145h86M94 158h42',blue)+text(90,110,'SEAT 24',15),
  iot: path('M106 146V88m-28 56V98m56 46V98',teal,3)+rect(60,146,92,48)+disk(79,170)+path('M56 70q50-48 100 0M72 86q34-32 68 0M91 102q15-13 30 0',blue,3),
  ai: rect(36,66,162,132)+path('M52 100h126M52 132h126M52 164h126',blue)+text(52,91,'01')+text(52,123,'02')+text(52,155,'03')+path('M94 85h70M94 117h46M94 149h24',teal,6),
  games: rect(28,90,178,92,25)+path('M55 135h38m-19-19v38',blue,5)+disk(155,123)+disk(173,141)+path('M106 90V66h44',teal),
  productivity: rect(30,72,118,138)+rect(74,50,118,138)+path('M96 83h70M96 105h70M96 127h70M96 149h42',blue)+path('M44 178v-25m-9 9 9-9 9 9m126 32v23m-9-9 9 9 9-9',teal),
  commerce: path('M30 80h22l20 88h100l24-65H58',blue,3)+path('M84 104v48m32-48v48m32-48v48M65 126h119',teal)+`<circle cx="85" cy="189" r="10" fill="#FFFEFA" stroke="${ink}" stroke-width="2"/><circle cx="163" cy="189" r="10" fill="#FFFEFA" stroke="${ink}" stroke-width="2"/>`,
  telecom: path('M113 70 68 204m45-134 45 134M89 140h48m-60 34h72M90 140l59 34m-12-34-60 34',blue,3)+path('M80 64q-30 30 0 60m66-60q30 30 0 60M65 48q-48 46 0 91m96-91q48 46 0 91',teal),
  devtools: rect(26,64,174,136)+path('M26 92h174M48 78h4m10 0h4m10 0h4M52 116l18 16-18 16m38 0h32',blue,3)+path('M48 178h129',teal,4),
};
const labels = { core: ['A short link', 'Resolve', 'Redirect'], media: ['A new release', 'Edge copies', 'Play'], social: ['One message', 'Fan out', 'Inboxes'], fintech: ['One payment', 'Record', 'Receipt'], health: ['A patient record', 'Authorize', 'Read'], civic: ['Deadline morning', 'Wait', 'Submit'], mobility: ['Positions in motion', 'Latest fix', 'Dispatch'], travel: ['The last seat', 'Reserve', 'Confirm'], iot: ['Devices wake together', 'Buffer', 'Process'], ai: ['A ranked result', 'Retrieve', 'Rank'], games: ['Find a fair match', 'Waiting pool', 'Match'], productivity: ['Every edit kept', 'Change log', 'Sync'], commerce: ['One item left', 'Reserve', 'Checkout'], telecom: ['A code in seconds', 'Rate limit', 'Deliver'], devtools: ['A change goes live', 'Build', 'Release'] };
fs.mkdirSync('assets/scenes', { recursive: true });
let i = 0;
for (const [id, drawing] of Object.entries(subject)) {
  const [title, first, last] = labels[id];
  const module = (x,y,type,label,color) => `<g transform="translate(${x} ${y})">${rect(0,3,84,64,8,'#C7D1D0')}${rect(0,0,84,64,8)}${path('M12 2h60',color,3)}<g transform="translate(28 13) scale(1.15)" fill="none" color="${color}" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconInner('el.'+type)}</g>${path('M12 54h60','#C7D1D0',4)}${path('M12 54h36',teal,4)}${text(0,84,label,11)}</g>`;
  const body = `${text(24,28,`BENCH / ${String(++i).padStart(2,'0')}`,10,blue)}${text(24,251,title,16)}${path('M236 48h180M236 218h180M236 43v10m180-10v10','#C7D1D0',1)}${path('M194 133h38V95h34m-34 38v42h34',blue)}${module(272,60,id === 'fintech' ? 'sql-primary' : id === 'iot' || id === 'civic' ? 'queue' : 'cache',first,ochre)}${module(318,156,id === 'devtools' ? 'worker-pool' : 'vm-fleet',last,teal)}${path('M314 124v18h46v14',blue)}${disk(224,133)}${disk(254,95)}${drawing}`;
  fs.writeFileSync(`assets/scenes/industry-${id}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440 280"><title>${title}</title><rect width="440" height="280" rx="12" fill="#F5F2E9"/>${body}</svg>\n`);
}
console.log('Drew 15 original industry scenes');
