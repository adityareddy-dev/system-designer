// Original lesson data. Worked figures are approximations, not engine measurements.
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
      "kind": "read",
      "title": "Index a little or index the words",
      "text": "A label-indexed log store maps bounded labels and time ranges to compressed chunks in object storage. It then scans selected chunks for words. Cheap ingestion and a small index suit known service and time filters; broad text searches may read many bytes. A full-text index maps words to matching records and speeds some searches, at the cost of index writes, storage and memory. Keep request ids as fields or structured metadata rather than creating millions of streams. Neither approach excuses access control or secret removal before export. Traces group spans by trace id and parent relationships; clocks can distort displayed duration, so causality is stronger than absolute timestamps."
    },
    {
      "kind": "read",
      "title": "Worked example: sampling trade-offs",
      "text": "Assume 10,000 traces/s, 20 spans/trace and 500 bytes/span before compression. Raw spans are about 100 MB/s or 8.64 TB/day. A 10% head sample keeps about 0.864 TB/day if chosen consistently for the whole trace. It cannot know that a later span will fail. Tail sampling waits for spans, then selects errors, slow traces and a baseline. A 30-second decision window holds roughly 3 GB of raw spans at this load, before metadata and replicas. Late or missing spans and collector failure can still yield incomplete traces. The sim does not implement sampling or trace assembly, so these are explicit worked assumptions."
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
          "label": "Tail buffer floor",
          "value": "≈ 3 GB",
          "how": "100 MB/s × 30 s, before overhead and copies"
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "A trace fails only at its last span. What can a 10% head sampler promise?",
      "choices": [
        "It keeps every failed trace",
        "It keeps roughly 10% if selection is independent of outcome",
        "It uses no network bandwidth for selected traces"
      ],
      "answer": 1,
      "why": "The decision is made before the outcome. Consistent trace-id selection avoids arbitrary partial traces."
    },
    {
      "kind": "defend",
      "q": "Why not index every log word? Follow-up: support needs broad searches once a week.",
      "checklist": [
        "Weigh frequent query shape against index cost",
        "Offer a bounded slower or separate search tier",
        "Account for access controls and retention"
      ],
      "model": "A full-text index may be worth it if arbitrary searches are central to the product. If most users know the service and time, a label index plus chunk scans can spend much less on continuous indexing. I would measure scanned bytes and weekly search latency, then offer a bounded asynchronous scan or a shorter indexed retention tier for support. Tenant isolation, redaction and deadlines apply to either path. The choice depends on query frequency and acceptable waiting, not a universal winner."
    },
    {
      "kind": "read",
      "title": "Retain by value",
      "text": "Route all spans of a trace to the same tail decision group, bound memory and define the late-span policy. Head sampling protects the collector and network earlier; tail sampling can retain more failures but must first receive the data. A metric exemplar stores a link to a selected trace, not an entire label dimension. Propagate trace context across queues and mark asynchronous links where a parent-child tree is misleading. Retain security events and evidence of rare failures longer than routine debug output, under explicit policy. Record sampling probabilities so sampled counts are not mistaken for exact totals. Protect the underlying user SLI from bias: count all eligible requests in metrics even if only some traces survive."
    },
    {
      "kind": "quiz",
      "q": "Most log searches specify service and a narrow time range. Which storage trade-off is plausible?",
      "choices": [
        "Index bounded labels and scan relevant chunks",
        "Index every request id as a new stream",
        "Discard time metadata and scan all history"
      ],
      "answer": 0,
      "why": "Narrow label and time selection can reduce scanning without a full-text index."
    },
    {
      "kind": "defend",
      "q": "Tail sampling keeps all errors. What could still be missing? Follow-up: the collector restarts halfway through a trace.",
      "checklist": [
        "Name pre-collector loss, decision windows and memory limits",
        "Persist or accept an explicit sampling loss boundary",
        "Keep complete metrics for rate calculations"
      ],
      "model": "It can keep all errors only among traces it receives and recognizes within its policy. Head-dropped spans, network loss, late spans or buffer eviction can hide the error. A collector restart loses in-memory assembly unless we provide durable buffering and replay. I would define these limits, route trace ids consistently, monitor sampling drops and keep an unbiased request counter outside the sampled trace path. Retaining an error trace is evidence, not proof that every error was observed."
    },
    {
      "kind": "quiz",
      "q": "Tail sampling preferentially keeps errors. Can you compute an unbiased error rate from retained traces alone?",
      "choices": [
        "Yes, divide retained errors by retained traces",
        "Yes, if the traces have timestamps",
        "Only with the selection model and weights; use complete request metrics for the SLI"
      ],
      "answer": 2,
      "why": "Outcome-dependent selection changes the sample. Retained traces alone do not represent all requests."
    }
  ],
  "takeaway": "Choose the index and sampling policy from the questions people need to answer."
};
