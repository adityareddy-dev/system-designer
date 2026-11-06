// Clarification synonyms recognize engineering vocabulary while exposing uncertain matches.
const topics = [
  ['idempotency', /idempoten|dedup|duplicate|twice|exactly.once|double.charge|repeat.*(send|request|command)|same.*(asked|sent|request|message)/i],
  ['scale', /scale|load|demand|how many|volume|peak|traffic|throughput|tps|qps|rps|users|audience|per.second/i],
  ['retention', /retention|retain|ttl|how long|keep.*(data|record|mail|trace|log|reading)|days|years|stored|storage/i],
  ['durability', /durab|lose|loss|lost|rpo|rto|recovery.point|saved.*safe|safe.*file/i],
  ['latency', /latency|how fast|how soon|how quickly|speed|milliseconds|p99|response.time|instantly/i],
  ['freshness', /fresh|stale|mutab|immutable|ttl|out.of.date|few seconds old|five minutes ago|how often.*change|can.*change|cache.*ttl/i],
  ['deadline', /deadline|cutoff|late|delay|wait|seconds|minutes|hour 24|expire/i],
  ['ordering', /causal|fifo|order.*(message|edit|event)|sequence|ordering|same order|price.time|earliest/i],
  ['consistency', /consisten|own.*(write|change|like|post)|straight away|immediate.*balance|atomic|concurrent|last.*(seat|slot|room)/i],
  ['availability', /availab|reliab|uptime|slo|sla|outage|unavailable|goes down|breaks|fail.open|fail.closed|failover|survive|region.*fail/i],
  ['quota', /quota|cap|throttl|limit|rate.limit|slow.*down|429|over.limit/i],
  ['privacy', /privacy|private|gdpr|eras|sensitive|consent|opt(?:s|ed|ing)?.out|stop|plaintext|encrypt|delet.*account/i],
  ['security', /secur|auth|sign.?in|log.?in|logged.?in|password|attack|bot|abuse|access|who.*see/i],
  ['audit', /audit|compliance|regulat|prove|proof|businesses ask/i],
  ['async', /async|asynchron|block.*(caller|sender)|sender wait|accepted|delivered|afterwards|background/i],
  ['offline', /offline|disconnect|loses signal|no.*connection|reconnect|push|wake|sync/i],
  ['geography', /geo|where|region|continent|country|countries|latency.*distance|nearby|locality/i],
  ['skew', /hot|skew|popular|celebrity|equally|biggest|largest|same.*(stor|song|piece|prefix)|doorbuster/i],
  ['fanout', /fanout|follower|member|channel|group|recipient/i],
  ['billing', /bill|cost|price|paid|charge|payment|money|budget|dollar/i],
  ['scope', /scope|exclude|out.of.scope|must.*build|what.*support|essential|matter.*most/i],
  ['partition', /partition|shard|tenant|key|customer|noisy.neighbo/i],
  ['search', /search|index|query|queries|look.up|find.*(logs|trace)/i],
  ['media', /media|music|playback|video|audio|chunk|piece|segment|quality|bitrate|playback|buffer|prefetch/i],
  ['retry', /retr|backoff|attempt|poison|corrupt|cannot run|dead.?letter/i],
  ['publication', /publicat|publish|upload|version|rollout|roll.out|deploy|release|canary|rollback|roll.back/i],
  ['sampling', /sampl|every trace|late span|tail.buffer|exemplar/i],
  ['cardinality', /cardinality|series|label|active.state|measurement/i],
  ['fairness', /fair|priority|prioriti|first.come|queue|waiting.room|admission/i],
  ['accuracy', /exact|accur|approx|count|total|aggregate/i],
  ['invariants', /invariant|balance|ledger|trade|settle|reserve|stock|inventory|oversell/i],
  ['sessions', /session|token|revok|sign.out|logout/i],
  ['conflict', /conflict|merge|simultaneous|concurrent|same.*place|edit/i],
  ['routing', /rout|replica|discover|health.check|relay|direct.*connect|ring|join|setup/i],
];
const stop = new Set('a an the is it are can do does we to of in on and or for how what if who when with be must should would this that have'.split(' '));
const tokens = text => new Set((text.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 2 && !stop.has(w)));
export function questionAnalysis(text, questions) {
  const own = text.split(/[?\n]+/).map(s => s.trim()).filter(Boolean);
  const score = (line, question) => {
    const a = tokens(line), b = tokens(question.q);
    const lexical = [...b].filter(w => a.has(w) || [...a].some(v => v.length > 4 && w.startsWith(v.slice(0,-1)))).length;
    const shared = topics.filter(([,pattern]) => pattern.test(line) && pattern.test(question.q)).length;
    return { score: lexical + shared * 2, matched: shared > 0 || lexical >= Math.min(2, b.size || 2) };
  };
  const coverage = questions.map(q => own.some(line => score(line, q).matched));
  const closest = own.map(line => {
    const ranked = questions.map((q,i) => ({ i, ...score(line,q) })).sort((a,b) => b.score-a.score);
    return { text: line, question: ranked[0]?.i ?? 0, matched: ranked[0]?.matched || false };
  });
  return { coverage, closest };
}
