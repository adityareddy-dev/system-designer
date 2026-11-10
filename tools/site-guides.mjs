// Original guide prose with scenario numbers and links supplied by the game content.
import { esc, num, para, list, link, relative } from './site-template.mjs';
import { requirements, estimates, trafficDay } from './site-content.mjs';

export function makeGuides({ problems, lessons, catalog, accountLive }) {
  const byId = new Map(problems.map(p=>[p.id,p]));
  const lessonById = new Map(lessons.map(l=>[l.id,l]));
  const cacheFreshness = lessonById.get('caching').steps.find(s=>s.kind==='demo').goal.maxTtlSec;
  const make = (id,title,description,build) => {
    const file = `guides/${id}/index.html`;
    const p = (id,text) => { const item = byId.get(id); if (!item) throw Error('Unknown guide problem: '+id); return link(relative(file,`p/${id}/index.html`),text || item.title); };
    const l = (id,text) => { const item = lessonById.get(id); if (!item) throw Error('Unknown guide lesson: '+id); return link(relative(file,`learn/${id}/index.html`),text || item.title); };
    const play = (id,interview=false) => link(relative(file,`index.html#/practice/${id}${interview?'?interview=1':''}`),interview ? 'Open Interview mode' : 'Play this problem');
    return {id,file,title,description,body:build({p,l,play})};
  };
  const guides = [
    make('introducing-system-designer','Build the system. Survive the day. See why it held.',
      `Meet System Designer: a free browser game with ${problems.length} system design problems, ${lessons.length} lessons and a traffic day that puts your decisions to work.`, ({p,l})=>`
${para('A box labelled cache is easy to draw. Knowing what happens when that cache empties at lunchtime is harder. System Designer turns that gap into something you can play.')}
${para('Build a real architecture, press Start and fast-forward through a whole day of traffic. A link goes viral. A building loses power. A provider asks you to slow down. Every request flows through your design as moving light, so you can see where the work goes and where it gets stuck.')}
<h2>Start with a small system</h2>
<p>You do not need to know what a load balancer is. ${l('intro')} starts with a phone, a server and a database. When more people arrive, you add capacity, spread requests and remember repeated answers. The parts have a job before they have a name to memorise.</p>
<p>If you already build software, try the ${p('url-shortener')}. It sounds small: save a long address, return a short one, look it up later. Then ask how the same link behaves when a crowd taps it together. Read the constraints, make your estimate and see whether your explanation survives a day.</p>
<h2>The habit is the game</h2>
${list(['Clarify the promise. Ask what can wait, what must be fresh and what may never be lost.', 'Do the numbers. Turn the audience into requests, stored bytes and work at the busiest step.', 'Draw a design. Connect parts and tune the capacity and policies you can explain.', 'Run the traffic day. Watch spikes, outages, waiting work and recovery.', 'Read the debrief. Compare reliability, speed, data safety and monthly cost, then change one thing.'])}
${para('The debrief is written in plain words. It tells you which event hurt, where requests failed and what the design cost. Hints and editorials help you investigate. A traffic score is evidence about this workload, while the correctness checks ask you to reason about duplicates, crashes and ordering that a moving dot cannot prove.')}
<h2>More than one way to practise</h2>
${para(`There are ${lessons.length} lessons and ${problems.length} problems across ${new Set(problems.map(p=>p.group)).size} industries. Lessons focus on one mechanism. Problems put several mechanisms together, from small services to systems where an outage, an unfair customer or a late queue changes the answer.`)}
<p>Try ${p('notification-service')} when you want to separate accepting work from finishing it. Try ${p('chat-app')} when bad connections and repeated messages matter. Use ${l('lead-interview')} before a timed attempt. Interview mode on Medium and Hard problems asks you to lead the discussion and defend choices with evidence.</p>
${para('The daily challenge gives everyone the same seeded scenario for a date. A beat my design link carries the architecture with it, so a friend can replay it and compete. Sandbox leaves the score behind and lets you try a traffic pattern or event just to understand it.')}
<h2>Free, with no account needed</h2>
${para('Play in the browser. There is no download, no subscription and no sign-up wall. Your progress stays on this device in the browser.')}
${accountLive ? para('Optional Google or GitHub sign-in keeps progress across devices and adds challenge leaderboards. You can keep playing without it.'):''}
${para('Prices, capacities and timings are rounded teaching approximations. A simulation cannot certify a production system, but it can make a useful question concrete: what did this choice protect, what did it cost, and what would make you change it?')}
<p>Start with ${l('intro')}, then build the ${p('url-shortener')}. Predict the first bottleneck before you press Start.</p>`),
    make('how-to-practise-system-design','How to practise system design',
      'A practical loop for turning a diagram into a design you can explain: clarify, estimate, predict a failure, test it and revise one decision.',({p,l,play})=>`
${para('A whiteboard helps you organise an explanation. It does not tell you whether the workers can drain the queue, whether the database becomes the bottleneck after a cache miss, or whether a retry repeats a charge. A convincing diagram can hide all three.')}
${para('Practise the reasoning between the boxes. For each part, say which user promise it serves, which new failure it introduces and which measurement would make you remove it. That gives you something to test, rather than a picture to memorise.')}
<h2>Write the user promise first</h2>
<p>Take ${p('notification-service')}. Is success accepting a message, reaching a provider or reaching a phone? Those are different boundaries. The scenario measures provider acceptance and has a separate waiting deadline. Copy the actual promise into your notes before choosing a queue.</p>
${para('Ask who uses the system, which operation matters most, whether data changes and what a failure may lose. Keep assumptions visible. If a missing answer could reverse a decision, state both possibilities and ask about that one first.')}
<h2>Estimate the work that reaches each step</h2>
<p>Use ${l('back-of-envelope')} to turn a peak rate and request mix into a per-path load. A total request rate does not mean every request reaches the database. A cache removes repeated reads; a retry adds work; fanout turns one action into many writes.</p>
${para('Keep average, normal peak and event peak in separate rows. Size for the relevant peak with room for recovery. Then ask whether that room is already committed to a failed zone. Do not promise the same spare capacity twice.')}
<h2>Use a repeatable practice loop</h2>
${list(['Read the brief and answer the clarification questions without drawing.', 'Estimate the busiest request path and state the units of every number.', 'Build the simplest connected design that could keep the promises.', 'Write a prediction: name the first limiting part and the event that exposes it.', 'Run the whole day. Record the measured failure, its time and the affected request type.', 'Change one decision, predict its effect and run again.', 'Explain the improvement and its cost. Then test a different situation before calling the idea learned.'])}
<h2>Make one useful experiment</h2>
${para('Suppose requests fail after a spike. One explanation is too little server capacity. Another is repeated misses reaching the database. Adding servers and a cache at once cannot distinguish them. Change just the suspected boundary, keep the workload fixed and compare database load as well as success rate.')}
<p>The ${p('url-shortener')} is a useful first experiment because links do not change and reads dominate. Predict what happens when its cache empties, then compare your run with that prediction. ${play('url-shortener')}.</p>
<h2>Keep correctness separate from throughput</h2>
${para('A high score does not prove that a database transaction and an external payment happen atomically. Trace one logical operation through a lost reply and a crash. Where is its stable identity stored? When can a retry learn the result? What if the provider accepted work before your process stopped?')}
<p>Use ${l('idempotency-retries')} and the problem’s checked traces to practise that explanation. State what the traffic run measured and what still needs a protocol argument. Both matter in a design discussion.</p>
<h2>Finish with a decision you can defend</h2>
${para('Keep a short record: the promise, your estimate, the first failure, your change and the result. Include an alternative you rejected and the condition under which it becomes better. On the next attempt, begin from the brief again rather than copying the finished diagram.')}
${para('When ordinary Practice feels comfortable, use Interview mode on a Medium or Hard problem. Speak through clarification and estimates before building. Defend a choice using the run’s evidence and a tested claim. The goal is a clear chain from requirement to decision to observed result, not a perfect drawing.')}`),
    make('two-week-system-design-plan','A two-week system design interview plan',
      'Fourteen days of lessons, traffic experiments and design explanations, with Interview mode in the second week. Every task links to a real lesson or problem.',({p,l,play})=>{
      const days = [
        ['Start with one request',['intro','requests-and-latency'],'url-shortener','Practice','Follow a request from the user to the store and back. Name the work on that path and where the response-time target applies. Finish the introduction, then attempt the shortener without looking at the editorial. Save your first bottleneck prediction.'],
        ['Do the numbers',['back-of-envelope','load-balancing'],'url-shortener','Practice','Repeat the shortener. Separate its normal peak from its viral event. Estimate capacity with spare room, then check whether that spare room survives losing capacity. Record the difference between your estimate and the run.'],
        ['Remember repeated answers',['caching','cdn'],'news-site','Practice','Identify which reads can share an answer and how stale it may be. Predict the effect of a cold cache before running. Keep the original data separate from copies that can be rebuilt.'],
        ['Move work off the reply path',['queues-backpressure','idempotency-retries'],'package-tracking','Practice','Trace acceptance and completion separately. Write down the waiting deadline and the duplicate policy. Watch the age of waiting work as well as its count; a queue is only useful if work can finish in time.'],
        ['Keep copies honest',['replication-lag','consistency'],'restaurant-reservations','Practice','Explain where a newly saved booking is read back and what happens if a copy is behind. Write the rule that prevents conflicting reservations, then distinguish it from the traffic capacity you measured.'],
        ['Prepare for pressure',['rate-limiting','circuit-breakers','autoscaling'],'rate-limiter-service','Practice','Compare refusing excess work, waiting for it and adding capacity. State the limiter outage policy. A scheduled crowd can arrive before new servers are ready, so predict the first interval separately from later recovery.'],
        ['Review the first week',['cost','lead-interview'],'notification-service','Practice','Do a complete attempt with a written scope, estimates and one failure prediction. Read the debrief only after recording your explanation. Write the requirement, mechanism, alternative and measurement behind one decision.'],
        ['Lead the API discussion',['multi-tenancy'],'rate-limiter-service','Interview','Ask about per-customer fairness and shared counters before choosing a mechanism. Use the timed flow, then defend an outage policy and test one claim. Keep measured traffic results separate from written reasoning.'],
        ['Defend delayed work',['work-across-services','slos-error-budgets'],'notification-service','Interview','Clarify urgency, provider acceptance and expiry. Explain how a lost reply differs from a confirmed failure. Defend the queue policy with observed waiting time and a tested claim about a changed workload.'],
        ['Handle a weak connection',['realtime-connections','ordering-time'],'chat-app','Interview','Clarify ordering and the identity of a message across retries. Estimate message traffic separately from open connections. Explain the recovery path after a lost acknowledgement, then compare it with what the run proves.'],
        ['Protect a booking',['search-indexing','copies-quorums'],'hotel-booking','Interview','Separate search results from authoritative booking state. Explain what happens when a dependency is slow or a replica is behind. Defend which work can use an old copy and which operation must wait or fail.'],
        ['Bound fanout',['fanout','hot-keys'],'social-feed','Interview','Explain how an ordinary account and a celebrity change write amplification. State the promise for your own post. Test a claim about a hot item and defend the point at which you would change the policy.'],
        ['Design for the known rush',['multi-region','observability'],'concert-ticket-drop','Interview','Use the scenario’s event peak, not its quiet baseline, for admission planning. Trace a retry through seat holds and payments. Defend a failure experiment and identify the user promise that extra capacity alone cannot protect.'],
        ['Repeat and compare',['simplest-design','team-boundaries'],'chat-app','Interview','Start again from the brief without loading your old design. Compare the quality of your clarification, estimates and tested claims with day ten. Keep one concrete weakness to practise next and one unnecessary part you removed.']
      ];
      return `${para('Use this as a sequence of focused sessions, not a promise of interview success. If a mechanism still feels like a name on a box, repeat that day before moving on. Keep a notebook of predictions and results so progress means better decisions rather than more finished pages.')}
<h2>How to use each session</h2>${para('Read the linked lessons, try the named problem and write a short explanation afterwards. During the first week, use Practice to investigate failures. During the second week, use Interview mode on Medium and Hard problems before reading hints or reference designs. Its clock guides the session; the exercise is to lead the reasoning and test your claims.')}
${days.map(([title,ids,id,mode,task],i)=>`<section id="day-${i+1}"><h2>Day ${i+1}: ${esc(title)}</h2><p>Lessons: ${ids.map(x=>l(x)).join(' · ')}.</p><p>Problem: ${p(id)} · ${mode}.</p>${para(task)}<p>${play(id,mode==='Interview')}.</p></section>`).join('')}
<h2>What to keep after two weeks</h2>${list(['A scope and a user promise you can state before choosing services.', 'Estimates with units, peaks and downstream limits made explicit.', 'A failure trace that explains durability, ordering or duplicate handling.', 'An experiment with a prediction, result and reason for the next change.', 'A trade-off tied to a requirement and a condition that would reverse your choice.'])}
${para('A report is a record of one attempt. Revisit a different problem using the same mechanism, or try a New twist after passing in Practice, to check whether the idea transfers. Keep the traffic score separate from checked learning progress and from your own review of the written explanation.')}`;
    }),
  ];

  const walkthroughs = [
    ['url-shortener','URL shortener walkthrough',
      'Separate durable link storage from fast redirects, estimate the read path and test what happens when a popular link outgrows its cache.',({p,l})=>`
<h2>Start with the lookup, not the short code</h2>
${para('A redirect is a lookup from a short code to a long address. Saving a link creates the durable record. Following a link should do as little work as possible. In this scenario the mapping never changes, so a previously fetched answer remains useful.')}
${para('Choose how a new code becomes unique. A random code needs collision detection and a retry; a sequence is simple but guessable and needs an allocation policy. Persist the mapping before acknowledging creation. A fast redirect path cannot recover a link that was never safely stored.')}
<h2>A design that holds</h2>
${para('Keep the mappings in a key-value store, which retrieves a record by its key. Put application servers behind a load balancer so no single server takes every request. A memory cache serves repeated lookups. Public, immutable redirects may also be served from edge copies close to users, reducing both origin work and travel time.')}
${para('Follow both paths. A cache hit ends early. A miss reaches the authoritative mapping, then fills a copy. When many callers miss the same link, combine their fetches rather than asking the store once per caller. Collect click analytics after the redirect so a slow counter does not delay navigation.')}
<h2>The trade-offs</h2>
${para('A long cache lifetime works because the mapping is immutable. That same policy would need reconsidering if links could be edited, revoked or made private. Edge copies cost money per request and introduce another policy to operate. A server-only path can be cheaper but sends more work and network travel through the origin.')}
<h2>What breaks it</h2>
${para('The important test is not just warm-cache throughput. Empty the cache while a popular link is being opened. Look for the load that moves back to the store, and check whether autoscaling starts quickly enough. Keep spare capacity for the interval before new servers are ready.')}
<p>Study ${l('caching')} and ${l('cdn')}, then try the ${p('url-shortener')}. Make a baseline run, change one caching decision and compare the affected path. Explain which result would make you choose the simpler server-only design.</p>`],
    ['rate-limiter-service','Rate limiter walkthrough',
      'Build fair admission for a public API: estimate counters, choose a sharing policy and explain what happens when the limiter cannot answer.',({p,l})=>`
<h2>Decide what the limit means</h2>
${para('A limit needs an identity, a time window and a policy for bursts. A developer key is a better starting point than an IP address when many legitimate users share a network. Decide whether the allowance is global or local to a region. That choice determines how counters must be shared.')}
${para('A token bucket is one way to allow a short burst without permitting an unlimited sustained rate. Tokens accumulate up to a ceiling; a request spends one. A fixed window is easier to explain but can admit a burst on both sides of a boundary. Choose according to the promise, not the name of the algorithm.')}
<h2>A design that holds</h2>
${para('Put admission before expensive application work. Filter obvious attack traffic, identify the caller, check the allowance in fast memory and pass admitted work to the service. Rejected callers need a clear response and a sensible retry time so the limiter does not create its own retry storm.')}
${para('The read, decision and update of a shared counter need one atomic operation. Separate reads and writes let simultaneous requests spend the same allowance. Partition counters by caller, then examine whether one huge caller can still overload a single key.')}
<h2>The trade-offs</h2>
${para('Shared counters give a more exact combined allowance but add a network dependency. Independent local counters remove that hop but multiply the total permitted traffic unless the quota is divided. Divided quotas can leave one region rejecting callers while another has spare allowance.')}
${para('Choose an outage policy explicitly. Failing open keeps ordinary clients moving when the limiter fails, while exposing the service to abuse. Failing closed protects capacity but rejects legitimate work too. A limited local fallback can reduce the damage, but its allowance and reconciliation still need explaining.')}
<h2>What breaks it</h2>
${para('A bot may have no useful key, a hot caller may overwhelm one counter, and clients may retry faster than useful work completes. Test those separately. Buying more application capacity does not make a per-customer policy fair or a counter update atomic.')}
<p>Use ${l('rate-limiting')} to practise the admission rule and ${l('multi-tenancy')} to reason about fairness. In the ${p('rate-limiter-service')}, predict which work the limiter removes and explain the uptime cost of rejecting it.</p>`],
    ['chat-app','Chat system walkthrough',
      'Design message identity, durable acknowledgement and reconnect behavior before treating chat as a socket-count problem.',({p,l})=>`
<h2>Define one message</h2>
${para('A phone can lose a reply after the server saved a message. When it retries, the server must recognise the same intended message. Give it a stable identity on the device before the first send. Keep that identity across reconnects and retries.')}
${para('State what sent, delivered and read mean. Durable storage is a different promise from arrival on another phone. Decide where ordering applies, usually within a conversation, and how clients detect a missing sequence position after reconnecting. A timestamp by itself does not settle simultaneous events on different devices.')}
<h2>A design that holds</h2>
${para('Connection gateways keep sockets open for online recipients. Chat servers validate membership, deduplicate a message and append it to durable conversation storage before acknowledging it. Store the message identity and its outcome together so a crash does not leave an unprotected gap between a duplicate check and a write.')}
${para('Deliver live messages through the recipient’s connection. Use a cursor to fetch missed messages after reconnecting. Offline notifications ask the recipient to check for messages; they are a separate path with separate provider limits. A notification accepted by a provider is not proof that the phone received it.')}
<h2>The trade-offs</h2>
${para('Waiting for durable copies before acknowledging adds latency but protects acknowledged messages after failure. Holding sockets consumes memory even when no message is moving. Polling is simpler in some clients but repeatedly asks the server whether anything changed.')}
${para('Deduplication needs a retention policy. If its records disappear before an old client retries, a repeated message can look new. Per-conversation ordering avoids imposing a global order on unrelated conversations, but reconnect and gap repair still need a protocol.')}
<h2>What breaks it</h2>
${para('Lose a gateway, then let many devices reconnect together. Check spare connection capacity, history reads and duplicate sends at the same time. Next trace a crash after storage but before acknowledgement. A smooth traffic run cannot prove that this race preserves message identity.')}
<p>Work through ${l('realtime-connections')}, ${l('idempotency-retries')} and ${l('ordering-time')}. Then try ${p('chat-app')}. Explain one recovery trace in words and one capacity failure using the measured day.</p>`],
    ['social-feed','News feed walkthrough',
      'Estimate fanout work, keep posts authoritative and choose where to assemble feeds for ordinary accounts and celebrities.',({p,l})=>`
<h2>Choose the unit of work</h2>
${para('A post is one record, but it can create many feed updates. Start by separating post creation, follower delivery and reading a feed. The exercise begins with time order rather than ranking. The author must see their own post immediately; other feeds can be a few seconds behind.')}
${para('Use the scenario’s Numbers values below as separate estimates with stated assumptions. Its clarification describes a rough read-to-post ratio, while its scored request mix also includes events, notifications, search and login. Use that scored mix when sizing request paths rather than treating the rough ratio as the entire workload.')}
<h2>A design that holds</h2>
${para('Save the post as the source of truth. For ordinary accounts, place post identifiers into followers’ prepared feeds using queued workers. Feed reads then fetch a short list rather than scanning every followed account. Make workers restartable: a retry must not insert the same feed entry twice.')}
${para('Treat very large accounts differently. Instead of writing into every follower’s feed on each celebrity post, fetch those posts when a person opens their feed and merge them with prepared entries. Include the author’s own new post directly so delayed background fanout does not hide it from its creator.')}
<h2>The trade-offs</h2>
${para('Preparing feeds makes frequent reads cheap but multiplies writes by follower count. Assembling everything at read time saves those writes but moves work into the response path. A hybrid has more policy and operational complexity, so explain the measurement that justifies its threshold.')}
${para('A cached feed is a shortcut, not the only copy of the post. Rebuilding it should be possible from durable posts and follow relationships. Separate private feed contents from public media that many people can share at the edge.')}
<h2>What breaks it</h2>
${para('A celebrity post can grow the fanout backlog faster than workers drain it. A popular item can overload one cache partition. A cold cache can send many reads back to storage. Each is a different failure: adding shards may not split one hot key, and adding workers may only overload the destination faster.')}
<p>Use ${l('fanout')} and ${l('hot-keys')} before trying ${p('social-feed')}. Predict where work moves when you switch a large account from push to pull, then compare both write pressure and read latency.</p>`],
    ['notification-service','Notification service walkthrough',
      'Separate acceptance from sending, respect provider quotas and reason about expiry and unknown outcomes before claiming delivery once.',({p,l})=>`
<h2>Acceptance is a promise too</h2>
${para('The caller should not wait for an email or push provider to finish. It needs to know whether work was accepted durably. Give the request an identity, check the required preference policy and record the job before returning acceptance. Decide what the caller can safely retry if the reply is lost.')}
${para('Separate urgent messages from campaigns. A message that can wait through a provider outage has a different deadline from a login code. The scenario’s waiting deadline and provider-acceptance boundary below are the promises to test; they do not prove device receipt.')}
<h2>A design that holds</h2>
${para('Use durable queues to decouple callers from sending. Workers consume at a pace each provider allows, recheck preferences, track attempts and preserve the same logical key across retries. Keep an explicit state for work whose provider outcome is unknown.')}
${para('A local duplicate lookup alone cannot guarantee one external send after a crash. If a provider accepted the message but the worker died before recording that fact, a retry needs the provider’s idempotency support or a reconciliation path. State that dependency instead of claiming a queue solves it.')}
${para('Separate channels or urgency classes so one throttled provider cannot block everything. Quarantine permanently bad work with a dead-letter policy, meaning a place for failed jobs that need inspection rather than endless retries. Track oldest waiting age and terminal outcomes, not only queue length.')}
<h2>The trade-offs</h2>
${para('Buffering absorbs bursts but spends the delivery deadline. More workers only help while the destination has capacity. More providers add resilience but also quotas, costs and an ambiguous handover point where both may send the same message.')}
${para('Texts have a much smaller quota and a different bill from push or email in this scenario. Do not split traffic equally across channels without checking those limits. A cheap default channel is useful only if it meets the message’s product requirements.')}
<h2>What breaks it</h2>
${para('Throttle a provider and keep accepting new work. Ask whether spare sending capacity can clear the backlog before the oldest jobs expire. Next make one message fail repeatedly and check that urgent work still progresses. Finally trace a lost provider reply and explain how the next worker discovers the outcome.')}
<p>Use ${l('queues-backpressure')} and ${l('work-across-services')}, then try ${p('notification-service')}. Defend the difference between a fast acceptance response and a completed send using both the run and a crash trace.</p>`],
  ];
  for (const [id,title,description,body] of walkthroughs) {
    const item = byId.get(id);
    guides.push(make(id+'-walkthrough',title,description,helpers=>`
<p>This walkthrough uses the ${helpers.p(id)} scenario. Try an attempt first if you want to make your own choices before reading a possible approach.</p>
<h2>Requirements and scale</h2>${para(item.brief)}${requirements(item,catalog)}
<h2>Estimates to work through</h2>${estimates(item)}
${body(helpers)}
<h2>The day that tests the design</h2>${trafficDay(item,catalog)}
<p>${helpers.play(id)}. Keep one baseline, predict a change and compare the next full day. The in-game editorial has calibrated reference designs after you finish a traffic day.</p>`));
  }
  guides.push(make('caching-load-balancing-queues','Caching, load balancing and queues, explained by breaking things',
    'Three small experiments show what caching, load balancing and queues protect, what they cost and how each can fail.',({p,l})=>`
${para('These parts solve different problems. A load balancer shares work, a cache avoids repeated work and a queue postpones work. They often appear together, but adding all three without an explanation makes a failure harder to understand.')}
<h2>Experiment: spread the same work</h2>
<p>Open ${l('load-balancing')}. Before touching the controls, predict what happens when several servers exist but clients still send requests to one address. Extra capacity only helps if requests can reach it.</p>
${para('A load balancer selects a healthy server for each request. Remove one server and ask whether the remaining pool has enough room. Spreading work does not create capacity, and health routing does not make a slow database faster. Watch the whole path rather than stopping at the front-end pool.')}
${para('Compare an even rotation with choosing the least busy server when requests take different lengths of time. Then consider held-open connections: moving new requests is easier than moving an existing conversation. State which load the balancing policy actually sees.')}
<h2>Experiment: avoid repeated work</h2>
<p>Open ${l('caching')}. Its database is nearly full and repeated answers may be at most ${num(cacheFreshness)} seconds old. Put a cache on the request path and predict how many reads still reach the database. The lesson’s check questions ask how hit rate changes that work; remember that writes still need their own path.</p>
${para('A time to live, or TTL, bounds how long an answer may remain in that cache without refresh. More memory does not make an old answer fresh. Long-lived copies help stable public data, while balances or private responses need a different policy.')}
<p>Now use the ${p('url-shortener')} to test a cache stampede. When a copy empties, simultaneous misses can repeat the original work. Combining identical fetches limits that rush; spare storage capacity still matters for unrelated misses.</p>
<h2>Experiment: spend time instead of dropping work</h2>
<p>Open ${l('queues-backpressure')}. Work enters a queue before workers send it to the destination. Predict whether the backlog grows by comparing arrival and completion rates. Only completion capacity above new arrivals is available to drain old work.</p>
${para('A queue can make a short burst survivable, but it cannot make an indefinitely overloaded destination keep up. Watch the oldest waiting job against its deadline. A smaller queue with very old work can be worse for users than a larger queue that drains quickly.')}
<p>Try the ${p('notification-service')} next. Its providers have quotas. Increasing worker count beyond a quota adds contention or retries, not successful sends. Admission control tells callers when work cannot be accepted safely; backpressure slows producers when downstream work is already full.</p>
<h2>Combine them by following one request</h2>
${para('Say which step returns a reply. A cache hit may end before the application reaches storage. An accepted queued job may return before its external effect happens. A load balancer chooses a server, but that server still waits for its dependencies.')}
${list(['For balancing, measure healthy capacity and the work left after one unit fails.', 'For caching, measure hit rate, freshness and load while copies are cold.', 'For queues, measure arrivals, drain rate, oldest age and the deadline.', 'For all three, compare the monthly cost with the promise they protect.'])}
${para('Keep the workload fixed when comparing designs. Change one policy at a time and say what result would disprove your explanation. That habit is more useful than remembering where these boxes usually sit in a reference diagram.')}`));
  return guides;
}
