// Small labelled reading diagrams. The diagrams supplement, rather than replace, the explanation.
import { h } from './dom.js';
const briefs = {
 'requests-and-latency':'People in Europe wait too long for a complete request. Both the app and its stored data start far away.',
 'back-of-envelope':'Peak load is 9,000 requests/s. One size M app server handles about 1,000 requests/s. Keep at least 25% of total app capacity spare.',
 'load-balancing':'Traffic rises from about 2,550 requests/s overnight to 3,000/s at peak. One size M app server handles about 1,000/s. Retries are off. Leave room for a server being replaced.',
 caching:'Repeated database reads nearly fill the database. People can accept an answer up to 60 seconds old.',
 cdn:'Twenty thousand people a second request the same pages. The origin servers cannot serve them all.',
 autoscaling:'An evening rush and an unpredictable viral spike will arrive. Extra servers take time to become ready.',
 'replication-lag':'At peak, the database receives 8,280 reads/s and 720 writes/s. A size M copy handles about 8,000 reads/s or 2,000 writes/s. Keep primary busy below 70%. Copies may lag.',
 sharding:'Incoming writes exceed one database’s write capacity. Read capacity is not the binding limit.',
 'hot-keys':'One item receives a third of all reads. Most other items are quiet.',
 'search-indexing':'Search reads overwhelm the database. People need useful search results after records change.',
 'storage-tiers':'The system stores 120 TB. Most objects are old and seldom opened. The monthly bill is too high.',
 'queues-backpressure':'A short write burst exceeds database capacity. Jobs have deadlines, and accepting a job does not mean it has finished.',
 fanout:'A celebrity post produces 25 times the normal write load. Readers still expect their feeds to work.',
 'realtime-connections':'Chat connections and messages overwhelm the app servers. People need messages while their connection stays open.',
 consistency:'People must see their own edits immediately. Copies can be behind the latest committed write.',
 'idempotency-retries':'Some payment jobs arrive twice. A repeated delivery must not charge the customer twice.',
 'rate-limiting':'Junk traffic competes with useful requests for server capacity.',
 'circuit-breakers':'The map service has become slow. Requests waiting on it tie up the rest of the system.',
 'multi-region':'The home region will fail at noon. People still need the service during that outage.',
 observability:'A bad release will reach users at noon. Time to notice and time to recover both affect them.',
 cost:'The system costs too much for its traffic. Reduce the monthly bill while preserving the user outcome.',
 'security-compliance':'An audit arrives at noon. The service needs evidence of how it controls access and protects its data.',
 'ai-serving':'Generation capacity will be scarce at noon. Some incoming questions repeat earlier questions.',
};
export const predictionBrief = id => briefs[id];
export function lessonVisualStyles(){
 if(document.querySelector('[data-lesson-visuals]'))return;
 const style=h('style',{'data-lesson-visuals':'',text:`
 .sh-reading-figure{margin:0;display:grid;gap:12px;padding:20px;border:1px solid var(--border-strong);border-radius:8px;background:var(--canvas)}
 .sh-reading-figure figcaption{font:12px var(--font-mono);color:var(--cat-compute);letter-spacing:.04em}
 .sh-reading-parts{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px}
 .sh-reading-parts li{position:relative;border-top:2px solid var(--accent);padding-top:12px;display:grid;align-content:start;gap:6px;min-width:0}
 .sh-reading-parts[data-flow] li+li:before{content:'→';position:absolute;left:-20px;top:8px;color:var(--text-3)}
 .sh-reading-parts strong{font:600 18px var(--font-display);color:var(--text)}
 .sh-reading-parts span{font-size:14px;line-height:1.5;color:var(--text-2)}
 .sh-estimate-form{display:grid;gap:16px;padding:24px;border:1px solid var(--border-strong);background:var(--canvas);border-radius:8px}
 .sh-estimate-form label{display:grid;gap:8px}.sh-estimate-form .sh-input{width:100%;max-width:360px}
 .sh-estimate-receipt{border-left:3px solid var(--cat-compute);padding-left:12px;font-size:14px;color:var(--text-2)}
 .sh-demo-prompt[hidden],.sh-demo-stage[hidden],.sh-demo-guidance[hidden],.sh-estimate-form[hidden],.sh-estimate-receipt[hidden],.sh-lp-card--demo .sh-btn[hidden]{display:none}
 @media(max-width:719px){.sh-reading-figure{padding:16px}.sh-reading-parts{grid-template-columns:1fr;gap:22px}.sh-reading-parts[data-flow] li+li:before{content:'↓';left:auto;right:4px;top:-23px}.sh-estimate-form{padding:16px}}
 `});document.head.append(style);
}
export function readingDiagram(diagram){
 return h('figure',{class:'sh-reading-figure'},h('figcaption',{text:diagram.label}),
  h(diagram.flow?'ol':'ul',{class:'sh-reading-parts','data-flow':diagram.flow?'true':null},diagram.parts.map(([label,detail])=>h('li',null,h('strong',{text:label}),h('span',{text:detail})))));
}
