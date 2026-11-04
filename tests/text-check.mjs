// Lists problem text that quotes a latency, uptime or budget figure, next to the calibrated requirement, for review.
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const imp = (f) => import(pathToFileURL(path.resolve(f)).href);
const { problems } = await imp('content/problems/index.js');
const cal = (await imp('content/problems/calibration.js')).default;
for (const p of problems) {
  const c = cal[p.id]?.requirements;
  if (!c || !(c.latencyP99Ms || c.availability)) continue;
  const texts = [p.brief, ...(p.clarify || []).map((x) => x.a), ...(p.requirements.notes || [])];
  const hits = texts.filter((t) => /\d\s?ms\b|millisecond|\d+(\.\d+)?\s?(%|percent)|nines/i.test(t || ''));
  if (hits.length) console.log(`== ${p.id} now ${JSON.stringify(p.requirements.latencyP99Ms)} avail ${p.requirements.availability}\n  - ${hits.join('\n  - ')}`);
}
