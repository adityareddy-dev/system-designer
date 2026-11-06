// Lesson text and interactive figure stages.
export default {
  "id": "logs-traces",
  "title": "Logs and traces",
  "track": "Go deeper",
  "minutes": 7,
  "summary": "Keep enough evidence to explain failures without indexing or retaining everything.",
  "steps": [
    {
      "kind": "read",
      "title": "An error chart rises, but why?",
      "text": "Checkout errors climb at 09:00. A metric identifies the service and time range. A linked trace shows a slow inventory call, and logs for that trace explain a timeout. Metrics summarize, traces connect causally related spans, and logs preserve detailed events. Collecting all three without useful links only creates three separate search problems.",
      "icon": "el.logs"
    },
    {
      "kind": "figure",
      "figure": "logs-traces",
      "view": "index",
      "title": "Index a little or index the words",
      "text": "Search the same log rows using a label-only index or word postings. Index bytes and rows examined are measured from this data."
    },
    {
      "kind": "figure",
      "figure": "logs-traces",
      "view": "sampling",
      "title": "Worked example: sampling trade-offs",
      "text": "The same 100 completed traces feed both samplers. Head decisions cannot know the outcome; tail decisions wait and pay to buffer the whole stream."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Raw spans",
          "value": "≈ 100 MB/s",
          "how": "10,000 × 20 × 500 B"
        },
        {
          "label": "Ten percent head sample",
          "value": "≈ 0.864 TB/day",
          "how": "100 MB/s × 86,400 × 0.1"
        },
        {
          "label": "Illustrative tail buffer",
          "value": "≈ 3 GB",
          "how": "100 MB/s × assumed 30 s average residence, before overhead and copies"
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "A trace fails at its last span. A consistent uniform 10% head sampler is independent of outcome. What can it promise?",
      "choices": [
        "Retention of the failed trace because the last span can revise the head decision",
        "About a 10% chance of retaining that trace, subject to delivery loss",
        "A 10% chance per span, giving almost every failed trace at least one span"
      ],
      "answer": 1,
      "why": "Head selection happens before the outcome and should propagate one trace decision, rather than independently sampling spans."
    },
    {
      "kind": "defend",
      "q": "Why not index every log word? Follow-up: support needs broad searches once a week.",
      "checklist": [
        "Compare frequent narrow searches with the cost of indexing every word",
        "Budget the weekly broad search as a bounded scan or short indexed tier",
        "Enforce tenant authorization, redaction and retention on both paths"
      ],
      "model": "A full-text index may be worth it if arbitrary searches are central to the product. If most users know the service and time, a label index plus chunk scans can spend much less on continuous indexing. I would measure scanned bytes and weekly search latency, then offer a bounded asynchronous scan or a shorter indexed retention tier for support. Tenant isolation, redaction and deadlines apply to either path. The choice depends on query frequency and acceptable waiting, not a universal winner."
    },
    {
      "kind": "read",
      "title": "Retain by value",
      "text": "Route all spans of a trace to the same tail decision group, bound memory and define the late-span policy. Head sampling protects the collector and network earlier; tail sampling can retain more failures but must first receive the data. A metric exemplar stores a link to a selected trace, not an entire label dimension. Propagate trace context across queues and mark asynchronous links where a parent-child tree is misleading. Retain security events and evidence of rare failures longer than routine debug output, under explicit policy. Record inclusion probabilities when they are known. A complex tail policy may not provide usable unbiased weights, so do not assume a configured baseline percentage corrects every sampled count. Protect the underlying user SLI from bias: count all eligible requests in metrics even if only some traces survive."
    },
    {
      "kind": "quiz",
      "q": "Most log searches specify a service and narrow time range. Which design avoids a continuous full-text indexing bill?",
      "choices": [
        "Index bounded stream labels and scan the selected chunks",
        "Index request ids as stream labels to narrow every search",
        "Index every token but reduce chunk compression to offset the write cost"
      ],
      "answer": 0,
      "why": "Bounded labels and time reduce candidate chunks. Request-id streams grow cardinality; full-text indexing adds ongoing work."
    },
    {
      "kind": "defend",
      "q": "Tail sampling keeps all errors. What could still be missing? Follow-up: the collector restarts halfway through a trace.",
      "checklist": [
        "Name upstream drops, late spans and buffer eviction as missing evidence",
        "Explain what collector restart loses without durable replay",
        "Use independent eligible-request counters for the error-rate SLI"
      ],
      "model": "It can keep all errors only among traces it receives and recognizes within its policy. Head-dropped spans, network loss, late spans or buffer eviction can hide the error. A collector restart loses in-memory assembly unless we provide durable buffering and replay. I would define these limits, route trace ids consistently, monitor sampling drops and keep an unbiased request counter outside the sampled trace path. Retaining an error trace is evidence, not proof that every error was observed."
    },
    {
      "kind": "quiz",
      "q": "Tail sampling keeps errors preferentially, and inclusion probabilities are unknown. What should supply the error-rate SLI?",
      "choices": [
        "Retained error traces divided by all retained traces",
        "Retained errors divided by the configured baseline sample fraction",
        "Complete eligible-request counters measured independently"
      ],
      "answer": 2,
      "why": "Outcome-dependent retention changes the denominator. A baseline fraction alone does not describe every trace's inclusion probability."
    }
  ],
  "takeaway": "Choose the index and sampling policy from the questions people need to answer."
};
