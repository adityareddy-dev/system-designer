// Original lesson data. Worked figures are approximations, not engine measurements.
export default {
  "id": "metrics-systems",
  "title": "How metrics systems work",
  "track": "Go deeper",
  "minutes": 7,
  "summary": "Series count, replication and query work decide the size of a metrics platform.",
  "steps": [
    {
      "kind": "read",
      "title": "One new label fills memory",
      "text": "A latency metric has labels for service, route, region and status. Someone adds request_id. Suddenly almost every request creates a new series. The sample rate did not change much, but the series metadata and index did. In a metrics system, each distinct metric name and label set identifies a time series.",
      "icon": "el.timeseries-db"
    },
    {
      "kind": "read",
      "title": "The ingest and storage path",
      "text": "Authenticate a tenant before accepting writes. Validate label counts, sizes and allowed dimensions. A distributor hashes tenant and series identity onto an ingest ring with several replicas across zones. Acknowledged writes need durable WAL records according to the chosen protocol. Ingesters keep recent data in memory and flush compressed immutable blocks to object storage. Indexes map labels and times to series and blocks. Compaction joins small blocks and removes expired data. Downsampling retains summaries for older ranges, but destroys some detail. Preserve count and sum when computing averages; averaging averages can lie. Counters and histogram aggregates require semantics-aware summaries."
    },
    {
      "kind": "read",
      "title": "Worked example: cardinality and bytes",
      "text": "Suppose 100 services each expose 20 routes in 3 regions with 5 status classes. If all combinations exist, one metric has 30,000 series. Sampling every 15 seconds gives 2,000 samples/s. At the catalog's roughly 1.5 compressed bytes/sample, 15 days hold about 3.89 GB of sample payload before replication, indexes and metadata. Multiplying by a million possible request ids can make the upper bound enormous, though actual cardinality depends on observed combinations. At an assumed 2 KB of active metadata per series, even 10 million active series need about 20 GB before samples. This example is not a simulated memory allocation."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Series combinations",
          "value": "≈ 30,000",
          "how": "100 × 20 × 3 × 5 observed combinations"
        },
        {
          "label": "Samples per second",
          "value": "≈ 2,000",
          "how": "30,000 ÷ 15 s"
        },
        {
          "label": "Fifteen-day payload",
          "value": "≈ 3.89 GB",
          "how": "2,000 × 1.5 B × 86,400 × 15; before index and replication"
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "You add a user id label while keeping samples/s fixed. Why can memory still rise?",
      "choices": [
        "More distinct series need more active metadata",
        "Compressed samples always grow to 1 MB each",
        "Queries no longer need an index"
      ],
      "answer": 0,
      "why": "Sample payload and per-series state are separate cost dimensions."
    },
    {
      "kind": "defend",
      "q": "Why does the bill rise when the sample count barely changes? Follow-up: which tenant limit do you add first?",
      "checklist": [
        "Distinguish samples, active series and churn",
        "Estimate per-series state and replicated payload",
        "Use several tenant limits with explicit rejection feedback"
      ],
      "model": "I would look at active series and new-series rate as well as samples/s. A request id can turn reused series into short-lived ones, increasing metadata, index and WAL work. If active metadata is about 2 KB, ten million series already need about 20 GB before sample buffers. I would cap active series and churn per tenant, reject with a reason, and show quota usage. Query scanned work needs separate limits. One universal requests/s limit cannot represent these costs."
    },
    {
      "kind": "read",
      "title": "Do not let queries starve writes",
      "text": "A query frontend splits long time ranges into bounded pieces and schedules them across workers. Each worker selects relevant blocks and series, then merges partial results. Cache immutable time-range results with tenant and query identity in the key. Fresh ranges need a short TTL or an explicit cutoff. Limit query concurrency, scanned bytes, range length, samples and wall time per tenant, independently of ingest limits. Limit active series, new-series rate and samples/s on writes. Fair queues let a small tenant make progress beside an expensive scan. Replication multiplies recent write work; object storage durability is a separate mechanism. Measure both query p99 and data freshness, since acknowledging buffered writes is not the same as making them queryable."
    },
    {
      "kind": "quiz",
      "q": "Two windows contain 10 requests averaging 10 ms and 90 requests averaging 100 ms. What preserves the combined average?",
      "choices": [
        "Average 10 and 100 to get 55 ms",
        "Keep only the faster window",
        "Keep sum and count; combined average is 91 ms"
      ],
      "answer": 2,
      "why": "The windows carry different numbers of observations. Their averages cannot be weighted equally."
    },
    {
      "kind": "defend",
      "q": "Why keep both a WAL and object blocks? Follow-up: a node dies before its next flush.",
      "checklist": [
        "Explain recent-write durability and replay",
        "State acknowledgement and zone replication policy",
        "Separate durable acceptance from query freshness"
      ],
      "model": "The WAL recovers recent accepted data that has not reached an immutable block. A local WAL alone does not survive loss of that host or zone, so the acknowledgement policy must require durable copies in the promised failure domains. Blocks provide durable, cheap historical storage after upload and verification. Recovery replays WAL records without creating duplicate logical samples. I would measure replay time and visibility lag separately from ingest success."
    },
    {
      "kind": "quiz",
      "q": "A tenant stays under ingest quotas but scans 30 days in 100 parallel queries. Which control addresses this?",
      "choices": [
        "Only reduce WAL retention",
        "Per-tenant query concurrency and scanned-work limits",
        "Add request ids as indexed labels"
      ],
      "answer": 1,
      "why": "Write admission cannot bound read-side work. Query fairness needs its own controls."
    }
  ],
  "takeaway": "Budget series, samples, replicated bytes and scanned query work separately."
};
