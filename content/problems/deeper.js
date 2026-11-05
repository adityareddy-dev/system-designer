// Advanced problems. Each brief states the scored boundary and protocol obligations.
export default {
  "group": {
    "id": "devtools",
    "title": "Developer platforms"
  },
  "problems": [
    {
      "difficulty": "Hard",
      "requires": {},
      "palette": null,
      "daily": false,
      "id": "logs-platform",
      "title": "Logs platform",
      "like": "a label-indexed log service like Loki",
      "concepts": [
        "logs-traces",
        "consistent-hashing",
        "storage-engine",
        "multi-tenancy",
        "slos-error-budgets"
      ],
      "brief": "Build a shared log service for 2,000 teams. Collectors send compressed chunks, and on-call engineers find logs by tenant, service and time before filtering their words. A wide search or a runaway label must not stop other teams from investigating an outage.",
      "clarify": [
        {
          "q": "Do we need arbitrary word search with no service or time filter?",
          "a": "It is allowed as a bounded asynchronous scan. Normal interactive queries specify tenant, service and a narrow time range. A label index is enough for this path; a full-text index is an optional paid tier."
        },
        {
          "q": "What counts as an accepted chunk?",
          "a": "The API verifies a stable tenant-scoped chunk id and checksum, durably uploads the chunk, then acknowledges it. Search visibility may lag by up to a minute while index metadata is published. Collectors retain unacknowledged chunks and retry the same identity with backoff."
        },
        {
          "q": "What is retained?",
          "a": "Keep ordinary compressed logs for 30 days and selected audit streams for a separate agreed retention policy. Redact secrets at collection. Never use request ids or user ids as stream labels."
        },
        {
          "q": "How is the traffic represented?",
          "a": "The batch type represents a 100 MB compressed chunk, as in the catalog. Read represents a small chunk or index lookup, not an arbitrary full-text scan. Query fan-out, index cardinality and scanned bytes need separate sizing."
        }
      ],
      "requirements": {
        "users": "2,000 tenant teams (approx.)",
        "monthlyUsers": 20000,
        "peakRps": 100,
        "mix": {
          "batch": 0.01,
          "read": 0.99
        },
        "latencyP99Ms": {
          "default": 1000,
          "batch": 5000
        },
        "availability": 0.999,
        "dataSafety": "no-loss",
        "readYourWrites": false,
        "compliance": [],
        "budgetPerMonth": 22000,
        "storageTb": 259.2,
        "userRegions": {
          "us": 1
        },
        "homeRegion": "us",
        "notes": [
          "At the flat planning rate, 1 chunk/s × 100 MB is about 8.64 TB/day and 259.2 TB over 30 days, before metadata and audit exceptions (approx.).",
          "The score measures durable chunk acceptance and small reads. It does not model label index construction, text scan work, tenant fairness or redaction.",
          "A catalog batch represents a 100 MB object upload, not one message sent through a standard queue. Object chunks are immutable. Stable chunk ids and sequence ranges make retries reconcilable; index publication follows durable upload.",
          "The current sim applies a global request mix. All source paths share a real authenticated front door. workloadPlan records source-specific rates for a later engine; it is descriptive and does not affect this score."
        ]
      },
      "traffic": {
        "curve": "flat",
        "sources": {
          "partner-system": 1
        }
      },
      "starter": {
        "nodes": [
          {
            "ref": "clients",
            "type": "partner-system",
            "x": -660,
            "y": 0,
            "locked": true,
            "label": "Collectors and query clients",
            "knobs": {
              "retries": 2,
              "backoff": "exponential-jitter"
            }
          }
        ],
        "edges": []
      },
      "workloadPlan": [
        {
          "sourceRef": "clients",
          "entryRef": "lb",
          "peakRps": 1,
          "mix": {
            "batch": 1
          },
          "role": "collector chunks"
        },
        {
          "sourceRef": "clients",
          "entryRef": "lb",
          "peakRps": 99,
          "mix": {
            "read": 1
          },
          "role": "small query lookups"
        }
      ],
      "events": [
        {
          "id": "noisy-neighbor",
          "at": "09:00"
        },
        {
          "id": "zone-outage",
          "at": "12:00"
        },
        {
          "id": "retry-storm",
          "at": "18:00"
        }
      ],
      "eventPool": [
        "cache-stampede",
        "disk-full"
      ],
      "numbers": [
        {
          "label": "Compressed ingest bandwidth",
          "value": 100,
          "unit": "MB/s",
          "how": "100 requests/s × 0.01 chunks × 100 MB/chunk (approx.).",
          "ask": true
        },
        {
          "label": "Thirty-day chunk payload",
          "value": 259.2,
          "unit": "TB",
          "how": "100 MB/s × 86,400 × 30 ÷ 1,000,000 MB/TB (approx.).",
          "ask": true
        },
        {
          "label": "One broad scan at 2 GB/s",
          "value": 4320,
          "unit": "seconds",
          "how": "8.64 TB ÷ 2 GB/s, about 72 minutes for one full day, ignoring indexes and parallelism (approx.).",
          "ask": true
        }
      ],
      "hints": [
        "Choose the index from the normal query shape. Which labels keep stream count bounded?",
        "Keep immutable chunk uploads durable and separate from expensive query work. Limit scanned bytes and concurrency per tenant.",
        "Use an authenticated front door and admission limits. Upload complete chunks directly to object storage, then publish label-index metadata. Cache immutable chunk reads with tenant-aware keys. Budget label-index memory and query fan-out separately."
      ],
      "editorial": {
        "summary": "Authenticate tenants before admission. Collectors upload already compressed chunks through the API to object storage. Acknowledge only after durable object acceptance, then publish label and time metadata idempotently. Queries select chunks through that index before scanning text. The API fleet includes index publication, query coordination and reconciliation. The graph measures object uploads and small reads; it is a simplified label-indexed service, not a claim to reproduce Loki's ingest protocol.",
        "designs": [
          {
            "name": "Durable chunks and bounded label queries",
            "why": "Batch uploads go directly from the API to object storage; reads can use the cache. A 100 MB chunk is an object, not a standard queue message. The API publishes a derived label index only after the chunk is durable and exposes the indexing watermark. A reconciler finds uploaded chunks whose publication was interrupted. Chunk metadata must preserve enough information to rebuild the index.",
            "graph": {
              "nodes": [
                {
                  "ref": "clients",
                  "type": "partner-system",
                  "x": -660,
                  "y": 0,
                  "locked": true,
                  "label": "Collectors and query clients",
                  "knobs": {
                    "retries": 2,
                    "backoff": "exponential-jitter"
                  }
                },
                {
                  "ref": "lb",
                  "type": "regional-lb",
                  "x": -480,
                  "y": 0,
                  "units": 3,
                  "zones": 3
                },
                {
                  "ref": "limits",
                  "type": "rate-limiter",
                  "x": -300,
                  "y": 0,
                  "units": 3,
                  "zones": 3,
                  "knobs": {
                    "limitRps": 1000,
                    "mode": "fail-closed"
                  }
                },
                {
                  "ref": "api",
                  "type": "vm-fleet",
                  "x": -120,
                  "y": 0,
                  "units": 6,
                  "zones": 3,
                  "knobs": {
                    "retries": 1,
                    "backoff": "exponential-jitter"
                  }
                },
                {
                  "ref": "cache",
                  "type": "distributed-cache",
                  "x": 60,
                  "y": 120,
                  "units": 3,
                  "zones": 3,
                  "knobs": {
                    "ttlSec": 60,
                    "coalesce": true
                  }
                },
                {
                  "ref": "chunks",
                  "type": "object-storage",
                  "x": 240,
                  "y": 0,
                  "knobs": {
                    "retentionDays": 30
                  }
                },
                {
                  "ref": "metrics",
                  "type": "metrics",
                  "x": -120,
                  "y": 320
                },
                {
                  "ref": "alerts",
                  "type": "alerting",
                  "x": 60,
                  "y": 320
                },
                {
                  "ref": "pager",
                  "type": "pager",
                  "x": 240,
                  "y": 320
                }
              ],
              "edges": [
                [
                  "clients",
                  "lb"
                ],
                [
                  "lb",
                  "limits"
                ],
                [
                  "limits",
                  "api"
                ],
                [
                  "api",
                  "chunks"
                ],
                [
                  "api",
                  "cache"
                ],
                [
                  "cache",
                  "chunks"
                ],
                [
                  "api",
                  "metrics"
                ],
                [
                  "metrics",
                  "alerts"
                ],
                [
                  "alerts",
                  "pager"
                ]
              ]
            },
            "expect": {
              "score": 0,
              "costPerMonth": 0
            }
          }
        ],
        "tradeoffs": [
          "A label index avoids continuous full-text indexing cost, but broad word searches scan more chunk bytes. Bound them and show pending results.",
          "Never publish an index pointer before its immutable chunk is durable. Orphan chunks can be reconciled later; dangling pointers create missing results. Retries reuse chunk ids and sequence ranges.",
          "Immutable chunk bytes can be cached by tenant, object identity and authorization scope. Query-result keys also need labels, time bounds and query semantics. Late uploads change historical query results, so use a watermark with invalidation or a bounded TTL.",
          "The rate limiter represents admission, not a proof of per-tenant fair queueing. Bound bytes/s, streams, new-stream rate, scan bytes and query concurrency, then use weighted queues or cells.",
          "The catalog prices storage and small request operations. The worked scan example adds CPU, decompression and object-read amplification that the score cannot price accurately."
        ],
        "realWorld": "At roughly 100 MB/s compressed, thirty days hold about 259 TB before metadata. At the catalog's $0.023/GB-month, that payload alone is about $5,962/month. Index size, temporary uploads, replication, query scans and people add cost (approx.)."
      },
      "correctness": {
        "prompt": "A worker uploads a chunk, then crashes before publishing its label index entry. How do retries and readers avoid missing or duplicating logs?",
        "discussion": "Use a stable tenant-scoped chunk id and immutable content or a checksum that detects a conflicting retry. Persist publication state and reconcile uploaded chunks with committed metadata. Publish an index pointer only after object durability is confirmed. A repeated publication must be idempotent. Expose an ingestion watermark so a query can distinguish not-yet-indexed data from an empty result. The reference score does not verify this protocol, label cardinality, tenant authorization or redaction.",
        "fields": [
          {
            "label": "Publication order",
            "options": [
              "Publish the index when upload starts, then retry the object separately",
              "Verify durable chunk, then publish pointer idempotently"
            ],
            "correct": 1,
            "explanation": "Readers must not observe a pointer to a missing chunk; orphan chunks can be reconciled."
          },
          {
            "label": "Tenant budget",
            "options": [
              "Limit scanned bytes and concurrent queries per tenant",
              "Give tenants equal HTTP request limits regardless of query width"
            ],
            "correct": 0,
            "explanation": "Wide scans consume far more work than small lookups; a global rate does not establish fairness."
          }
        ],
        "limits": "The traffic score does not validate index publication, scan amplification, tenant fairness or log contents."
      }
    },
    {
      "difficulty": "Hard",
      "requires": {},
      "palette": null,
      "daily": false,
      "id": "tracing-platform",
      "title": "Tracing platform",
      "like": "a trace store like Tempo",
      "concepts": [
        "logs-traces",
        "ordering-time",
        "consistent-hashing",
        "storage-engine",
        "slos-error-budgets"
      ],
      "brief": "Store distributed traces for 500 teams and make an exemplar link open the useful trace during an incident. Decide what to sample before storage, handle late spans, and keep query traffic from overwhelming ingestion. Keeping all errors is a policy goal with a failure boundary, not a magic property of sampling.",
      "clarify": [
        {
          "q": "What reaches the sampler?",
          "a": "About 10,000 traces/s, 20 spans/trace and 500 bytes/span before compression. If average span residence is 30 seconds, budget about 3 GB of raw payload before overhead and redundancy. A 30-second decision timer alone does not establish residence time; span arrival patterns and decision caches also matter (approx.)."
        },
        {
          "q": "Must we keep every trace?",
          "a": "No. Plan a representative 10% baseline and prioritize error and slow traces subject to a hard byte budget. The modeled storage load is the 10% baseline. An error-heavy incident can exceed it, so reserve capacity or explicitly shed lower-priority samples."
        },
        {
          "q": "How are late spans handled?",
          "a": "Route a trace id to one decision group, persist decisions for a bounded late-span window and append late spans consistently where possible. Mark incomplete traces. Collector loss or upstream sampling can still remove evidence."
        },
        {
          "q": "What does the score measure?",
          "a": "Retained 100 MB blocks and small trace-id reads after sampling. Tail assembly, outcome selection and full attribute searches are worked obligations; placing the Traces observer does not implement a tracing platform."
        }
      ],
      "requirements": {
        "users": "500 teams and their services (approx.)",
        "monthlyUsers": 10000,
        "peakRps": 100,
        "mix": {
          "batch": 0.001,
          "read": 0.999
        },
        "latencyP99Ms": {
          "default": 1000,
          "batch": 5000
        },
        "availability": 0.999,
        "dataSafety": "no-loss",
        "readYourWrites": false,
        "compliance": [],
        "budgetPerMonth": 15000,
        "storageTb": 6.048,
        "userRegions": {
          "us": 1
        },
        "homeRegion": "us",
        "notes": [
          "Raw incoming spans are about 100 MB/s; 10% retention gives about 10 MB/s before compression. One catalog batch is 100 MB, so 0.1 retained blocks/s is the planning rate (approx.).",
          "Seven days at that retained rate is about 6.048 TB, before indexes, replication and an error reserve (approx.).",
          "The reference starts with already selected and formed blocks. The API acknowledges only after object storage accepts them durably. Raw-span collection, sampling, durable collector spooling and index publication need separate capacity and failure tests.",
          "The current sim applies a global request mix. All source paths share a real authenticated front door. workloadPlan records source-specific rates for a later engine; it is descriptive and does not affect this score."
        ]
      },
      "traffic": {
        "curve": "flat",
        "sources": {
          "partner-system": 1
        }
      },
      "starter": {
        "nodes": [
          {
            "ref": "clients",
            "type": "partner-system",
            "x": -660,
            "y": 0,
            "locked": true,
            "label": "Collectors and query clients",
            "knobs": {
              "retries": 2,
              "backoff": "exponential-jitter"
            }
          }
        ],
        "edges": []
      },
      "workloadPlan": [
        {
          "sourceRef": "clients",
          "entryRef": "lb",
          "peakRps": 0.1,
          "mix": {
            "batch": 1
          },
          "role": "retained blocks after collector sampling"
        },
        {
          "sourceRef": "clients",
          "entryRef": "lb",
          "peakRps": 99.9,
          "mix": {
            "read": 1
          },
          "role": "trace-id lookups"
        }
      ],
      "events": [
        {
          "id": "zone-outage",
          "at": "11:00"
        },
        {
          "id": "thundering-herd",
          "at": "14:00",
          "params": {
            "factor": 4,
            "types": [
              "read"
            ]
          }
        },
        {
          "id": "retry-storm",
          "at": "18:30"
        }
      ],
      "eventPool": [
        "cache-stampede",
        "noisy-neighbor"
      ],
      "numbers": [
        {
          "label": "Raw span bandwidth",
          "value": 100,
          "unit": "MB/s",
          "how": "10,000 traces/s × 20 spans × 500 B ÷ 1,000,000 (approx.).",
          "ask": true
        },
        {
          "label": "Illustrative raw tail buffer",
          "value": 3000,
          "unit": "MB",
          "how": "100 MB/s × assumed 30-second average residence, before metadata and redundancy (approx.).",
          "ask": true
        },
        {
          "label": "Seven-day baseline retention",
          "value": 6.048,
          "unit": "TB",
          "how": "100 MB/s × 0.1 × 86,400 × 7 ÷ 1,000,000 (approx.).",
          "ask": true
        }
      ],
      "hints": [
        "Does the sampling decision need to know whether the request eventually failed?",
        "Head sampling saves network earlier but cannot see future errors. Tail sampling receives and buffers spans before choosing. Keep all spans of a trace on one decision group.",
        "After selection, collectors form blocks and upload them through the API to object storage, then publish trace-id lookup metadata. Cache immutable reads. Size raw collection, tail decisions, late spans and overflow separately."
      ],
      "editorial": {
        "summary": "Applications and collectors propagate trace context and redact sensitive attributes. Tail selection groups spans by trace id with a bounded decision window, a late-span policy and explicit overflow. The reference starts after selection and block formation: the API durably uploads blocks, then publishes trace-id lookup metadata. It measures neither raw collection nor the sampling guarantee. Tempo also supports attribute queries over columnar Parquet blocks; a trace-id lookup structure is not a description of all its search capabilities.",
        "designs": [
          {
            "name": "Durable blocks with cached trace lookups",
            "why": "The shared API durably uploads already selected immutable blocks and publishes lookup metadata idempotently. A crash after upload leaves an orphan that reconciliation can index. Cached object and index reads serve trace-id lookups; recent-query visibility requires a publication watermark. There is no 100 MB standard queue message. Real-time span reception and recent trace assembly sit before this scored boundary.",
            "graph": {
              "nodes": [
                {
                  "ref": "clients",
                  "type": "partner-system",
                  "x": -660,
                  "y": 0,
                  "locked": true,
                  "label": "Collectors and query clients",
                  "knobs": {
                    "retries": 2,
                    "backoff": "exponential-jitter"
                  }
                },
                {
                  "ref": "lb",
                  "type": "regional-lb",
                  "x": -480,
                  "y": 0,
                  "units": 3,
                  "zones": 3
                },
                {
                  "ref": "limits",
                  "type": "rate-limiter",
                  "x": -300,
                  "y": 0,
                  "units": 3,
                  "zones": 3,
                  "knobs": {
                    "limitRps": 1000,
                    "mode": "fail-closed"
                  }
                },
                {
                  "ref": "api",
                  "type": "vm-fleet",
                  "x": -120,
                  "y": 0,
                  "units": 6,
                  "zones": 3,
                  "knobs": {
                    "retries": 1,
                    "backoff": "exponential-jitter"
                  }
                },
                {
                  "ref": "cache",
                  "type": "distributed-cache",
                  "x": 60,
                  "y": 120,
                  "units": 3,
                  "zones": 3,
                  "knobs": {
                    "ttlSec": 60,
                    "coalesce": true
                  }
                },
                {
                  "ref": "chunks",
                  "type": "object-storage",
                  "x": 240,
                  "y": 0,
                  "knobs": {
                    "retentionDays": 7
                  }
                },
                {
                  "ref": "metrics",
                  "type": "metrics",
                  "x": -120,
                  "y": 320
                },
                {
                  "ref": "alerts",
                  "type": "alerting",
                  "x": 60,
                  "y": 320
                },
                {
                  "ref": "pager",
                  "type": "pager",
                  "x": 240,
                  "y": 320
                }
              ],
              "edges": [
                [
                  "clients",
                  "lb"
                ],
                [
                  "lb",
                  "limits"
                ],
                [
                  "limits",
                  "api"
                ],
                [
                  "api",
                  "chunks"
                ],
                [
                  "api",
                  "cache"
                ],
                [
                  "cache",
                  "chunks"
                ],
                [
                  "api",
                  "metrics"
                ],
                [
                  "metrics",
                  "alerts"
                ],
                [
                  "alerts",
                  "pager"
                ]
              ]
            },
            "expect": {
              "score": 0,
              "costPerMonth": 0
            }
          }
        ],
        "tradeoffs": [
          "Head sampling can discard the trace before an error occurs. Select consistently by trace id so services do not independently retain fragments.",
          "Tail selection receives the raw stream before choosing. At an assumed 30-second average residence, this example buffers about 3 GB raw payload; arrival timing, process overhead, replicas, decision caches and long traces change that estimate.",
          "At 100 MB/s raw, a hard 10 MB/s storage budget cannot keep every trace if errors dominate. Reserve capacity and prioritize, or declare a loss policy. Monitor dropped and incomplete traces.",
          "A trace-id lookup path is cheaper than indexing every attribute. Attribute queries can use columnar block scans and selective indexes with a separate scanned-byte budget. Current Tempo supports TraceQL over Parquet; it is not limited to trace-id retrieval.",
          "Keep complete request metrics for SLI denominators. Outcome-biased retained traces cannot directly measure the population error rate. Exemplars link selected observations without making trace ids metric labels."
        ],
        "realWorld": "This example has about 200,000 spans/s before sampling. Ten percent baseline storage is about 864 GB/day before compression; actual retention rises when error-priority traces exceed the baseline. Collector buffering and query scans need separate measurements (approx.)."
      },
      "correctness": {
        "prompt": "A collector has seen only successful spans when its tail decision timer expires. A late error span arrives afterwards. What is your policy and how is its loss measured?",
        "discussion": "Keep a bounded decision cache keyed by tenant and trace id so late spans follow an explicit prior decision or a documented promotion rule. Mark incompleteness, count late and dropped spans, and bound memory and decision lifetime. A head sampler upstream may already have removed evidence. Collector restart needs durable spooling and replay if the loss budget demands it. No tail policy guarantees all errors across unobserved or discarded spans. Request metrics must count the whole population independently.",
        "fields": [
          {
            "label": "Tail capacity",
            "options": [
              "Size the input collector for the retained baseline because unselected spans are discarded",
              "Receive raw spans and budget decision state before retention"
            ],
            "correct": 1,
            "explanation": "Outcome selection needs the data before it can choose what to discard."
          },
          {
            "label": "Error-rate source",
            "options": [
              "Complete eligible-request counters",
              "Errors divided by retained tail-sampled traces"
            ],
            "correct": 0,
            "explanation": "Tail retention is biased by outcome; it does not supply an unbiased denominator."
          }
        ],
        "limits": "The score starts after sampling and does not validate trace assembly, sampling bias, context propagation or collector recovery."
      }
    },
    {
      "difficulty": "Hard",
      "requires": {},
      "palette": null,
      "daily": false,
      "id": "tenant-metrics",
      "title": "Metrics for many customers",
      "like": "a shared metrics service like Mimir",
      "concepts": [
        "metrics-systems",
        "multi-tenancy",
        "copies-quorums",
        "consistent-hashing",
        "slos-error-budgets"
      ],
      "brief": "Build one metrics platform for 5,000 customers. A tenant can create millions of series or run a costly month-long query by mistake. Your design must preserve useful ingestion and query service for the other tenants, and show the offending customer a clear limit rather than an unexplained gap.",
      "clarify": [
        {
          "q": "How many series and samples?",
          "a": "The normal fleet has about 10 million active series at a 15-second interval, roughly 667,000 samples/s. The peak plan is 720,000 samples/s. A telemetry request is a catalog batch of 100 samples (approx.)."
        },
        {
          "q": "What limits matter?",
          "a": "Enforce active-series, new-series and samples/s quotas plus label size on writes. Limit query concurrency, time range, scanned samples and wall time separately. Global requests/s is only a coarse admission guard."
        },
        {
          "q": "How do customers share capacity?",
          "a": "Use weighted fair queues with bounded waiting, and shuffle-sharded ingest subsets inside independent cells. Cell-local data paths should isolate a failure. Shared identity and control-plane dependencies must be included in the blast-radius analysis."
        },
        {
          "q": "What can be late?",
          "a": "Normal query visibility should be within a minute. Dashboards may cache stable ranges for a minute, but alert evaluations need a separate fresh path. Keep 14 days of full detail, then preserve semantics-aware aggregates under a separate policy."
        }
      ],
      "requirements": {
        "users": "5,000 tenant organizations (approx.)",
        "monthlyUsers": 25000,
        "peakRps": 8000,
        "mix": {
          "telemetry": 0.9,
          "report": 0.05,
          "read": 0.05
        },
        "latencyP99Ms": {
          "default": 1000,
          "telemetry": 1000,
          "report": 5000
        },
        "availability": 0.999,
        "dataSafety": "rpo-1m",
        "readYourWrites": false,
        "compliance": [],
        "budgetPerMonth": 22000,
        "storageTb": 1.2096,
        "userRegions": {
          "us": 1
        },
        "homeRegion": "us",
        "notes": [
          "At peak: 8,000 × 0.9 × 100 = 720,000 samples/s. Normal: 10 million ÷ 15 ≈ 667,000/s (approx.).",
          "Storage planning uses the normal steady rate: 10 million/15 × 1.5 B × 86,400 × 14 days ≈ 1.2096 TB compressed payload, before indexes, recent WAL and replica copies (approx.).",
          "The Time-series database element includes recent data and historical object blocks. The graph does not draw a fake store-to-store link.",
          "The shared API coordinates ingest and query requests. The sim does not model per-tenant weights, cardinality memory, new-series churn or cell assignment. The cardinality event affects the platform's own Metrics observer bill.",
          "The current sim applies a global request mix. All source paths share a real authenticated front door. workloadPlan records source-specific rates for a later engine; it is descriptive and does not affect this score."
        ]
      },
      "traffic": {
        "curve": "flat",
        "sources": {
          "iot-device": 0.9,
          "admin-console": 0.1
        }
      },
      "starter": {
        "nodes": [
          {
            "ref": "agents",
            "type": "iot-device",
            "x": -660,
            "y": -80,
            "locked": true,
            "label": "Metric agents",
            "knobs": {
              "retries": 2,
              "backoff": "exponential-jitter"
            }
          },
          {
            "ref": "query",
            "type": "admin-console",
            "x": -660,
            "y": 80,
            "locked": true,
            "label": "Tenant dashboards",
            "knobs": {
              "retries": 2,
              "backoff": "exponential-jitter"
            }
          }
        ],
        "edges": []
      },
      "workloadPlan": [
        {
          "sourceRef": "agents",
          "entryRef": "lb",
          "peakRps": 7200,
          "mix": {
            "telemetry": 1
          }
        },
        {
          "sourceRef": "query",
          "entryRef": "lb",
          "peakRps": 800,
          "mix": {
            "report": 0.5,
            "read": 0.5
          }
        }
      ],
      "events": [
        {
          "id": "cardinality-explosion",
          "at": "08:00"
        },
        {
          "id": "noisy-neighbor",
          "at": "10:00"
        },
        {
          "id": "zone-outage",
          "at": "13:00"
        }
      ],
      "eventPool": [
        "retry-storm",
        "cache-stampede"
      ],
      "numbers": [
        {
          "label": "Peak sample rate",
          "value": 720000,
          "unit": "samples/s",
          "how": "8,000 requests/s × 0.9 × 100 samples/request (approx.).",
          "ask": true
        },
        {
          "label": "Normal full-detail payload",
          "value": 1.2096,
          "unit": "TB",
          "how": "10 million/15 samples/s × 1.5 B × 86,400 × 14 days, before metadata (approx.).",
          "ask": true
        },
        {
          "label": "Tenant active-state allowance",
          "value": 200,
          "unit": "MB",
          "how": "Assume 100,000 active series/tenant × 2 KB state/series, before sample buffers (approx.).",
          "ask": true
        }
      ],
      "hints": [
        "Separate series count from sample count. Which customer can exhaust memory without sending more bytes?",
        "Set tenant budgets for writes and reads independently, then schedule fairly. A limiter alone cannot prove fairness.",
        "Choose replicated ingester WALs or a durable ingest log before object blocks. Use tenant-aware cached reads and a fresh alert path. Explain acknowledgement, visibility lag, shuffle overlap and shared dependencies; the catalog integrates storage internals."
      ],
      "editorial": {
        "summary": "Choose and state the ingest architecture. Classic ingester replication hashes series onto replicas with WALs; Mimir's ingest-storage architecture instead commits writes to Kafka partitions before ingesters consume them. Both need a separate query-visibility policy. The catalog integrates recent storage and historical object blocks in one time-series element. Split queries into bounded, fairly scheduled tasks and enforce tenant limits before expensive allocation. The score measures aggregate headroom, not cardinality handling or tenant isolation.",
        "designs": [
          {
            "name": "Shared admission and a three-zone time-series fleet",
            "why": "Both sources enter a shared authenticated API. Its distributors and query coordinators use the integrated time-series store. Repeated small reads can use a tenant-aware cache; report requests stay on the uncached path. In production, the store's acknowledged-write protocol, recent-data visibility and recovery must be specified separately. The graph abstracts those internals rather than reproducing one Mimir deployment.",
            "graph": {
              "nodes": [
                {
                  "ref": "agents",
                  "type": "iot-device",
                  "x": -660,
                  "y": -80,
                  "locked": true,
                  "label": "Metric agents",
                  "knobs": {
                    "retries": 2,
                    "backoff": "exponential-jitter"
                  }
                },
                {
                  "ref": "query",
                  "type": "admin-console",
                  "x": -660,
                  "y": 80,
                  "locked": true,
                  "label": "Tenant dashboards",
                  "knobs": {
                    "retries": 2,
                    "backoff": "exponential-jitter"
                  }
                },
                {
                  "ref": "lb",
                  "type": "regional-lb",
                  "x": -480,
                  "y": 0,
                  "units": 3,
                  "zones": 3
                },
                {
                  "ref": "limits",
                  "type": "rate-limiter",
                  "x": -300,
                  "y": 0,
                  "units": 3,
                  "zones": 3,
                  "knobs": {
                    "limitRps": 1000,
                    "mode": "fail-closed"
                  }
                },
                {
                  "ref": "api",
                  "type": "vm-fleet",
                  "x": -120,
                  "y": 0,
                  "units": 6,
                  "zones": 3,
                  "knobs": {
                    "retries": 1,
                    "backoff": "exponential-jitter"
                  }
                },
                {
                  "ref": "cache",
                  "type": "distributed-cache",
                  "x": 60,
                  "y": 120,
                  "units": 3,
                  "zones": 3,
                  "knobs": {
                    "ttlSec": 60,
                    "coalesce": true
                  }
                },
                {
                  "ref": "tsdb",
                  "type": "timeseries-db",
                  "x": 240,
                  "y": 0,
                  "units": 12,
                  "zones": 3,
                  "knobs": {
                    "retentionDays": 14
                  }
                },
                {
                  "ref": "metrics",
                  "type": "metrics",
                  "x": -120,
                  "y": 320
                },
                {
                  "ref": "alerts",
                  "type": "alerting",
                  "x": 60,
                  "y": 320
                },
                {
                  "ref": "pager",
                  "type": "pager",
                  "x": 240,
                  "y": 320
                }
              ],
              "edges": [
                [
                  "agents",
                  "lb"
                ],
                [
                  "query",
                  "lb"
                ],
                [
                  "lb",
                  "limits"
                ],
                [
                  "limits",
                  "api"
                ],
                [
                  "api",
                  "tsdb"
                ],
                [
                  "api",
                  "cache"
                ],
                [
                  "cache",
                  "tsdb"
                ],
                [
                  "api",
                  "metrics"
                ],
                [
                  "metrics",
                  "alerts"
                ],
                [
                  "alerts",
                  "pager"
                ]
              ]
            },
            "expect": {
              "score": 0,
              "costPerMonth": 0
            }
          }
        ],
        "tradeoffs": [
          "In a fixed-set quorum design, R = W = 2 of three replicas intersects, but reconciliation and the acknowledgement failure boundary still need a protocol. Mimir ingest storage uses Kafka durability rather than this ingester write quorum. Query visibility must account for consumer lag.",
          "A 100,000-series quota at an assumed 2 KB per active series is about 200 MB state per tenant before replication. Multiply only actual active series, not every tenant's unused quota reservation, unless the product guarantees reserved capacity.",
          "Use tenant identity, authorization scope, query semantics and evaluation time in result-cache keys. Late samples and deletions can change old results even when blocks are immutable. Use a stable-data cutoff or invalidation; alert evaluations need a separately enforced freshness policy.",
          "Shuffle sharding reduces repeated overlap; it does not remove overlap. With 2 of 10 workers, identical pairs occur with probability 1/45, but any overlap occurs with probability 17/45.",
          "Cells contain only failures whose dependencies remain cell-local. Independent storage, queues and staged deploys cost spare capacity but reduce reach. A common critical key service can still affect everyone."
        ],
        "realWorld": "The catalog models about 300,000 samples/s written per ingest node as 3,000 batches of 100, and about 500 range queries/s per node. Replication, series churn, query width, zone loss and recovery mean dividing the peak by 300,000 is only a starting point (approx.)."
      },
      "correctness": {
        "prompt": "A tenant stays within samples/s but creates a new series on every request and runs wide queries. Which independent budgets protect the other 4,999 customers?",
        "discussion": "Authenticate the tenant, cap label size, active series and new-series rate before allocating unbounded state, and return explicit limit feedback. Query work needs separate concurrency, range, scanned-sample and time limits. Carry tenant identity through fair queues and cancellation. Include tenant scope in caches and data authorization. Cell and shuffle placement reduce shared failure reach only if critical dependencies follow the same boundary.",
        "fields": [
          {
            "label": "Write admission",
            "options": [
              "Samples/s and label-byte limits, without series or churn accounting",
              "Active series, churn, label size and samples/s"
            ],
            "correct": 1,
            "explanation": "Low byte rates can still create expensive metadata."
          },
          {
            "label": "Read fairness",
            "options": [
              "Bound and fairly schedule query work per tenant",
              "Give each tenant equal requests/s while all queries share one FIFO"
            ],
            "correct": 0,
            "explanation": "A single FIFO lets broad queries delay cheap work from other tenants."
          }
        ],
        "limits": "The aggregate traffic score does not prove per-tenant isolation, authorization, cardinality handling or fair scheduling."
      }
    },
    {
      "difficulty": "Hard",
      "requires": {},
      "palette": null,
      "daily": false,
      "id": "device-notes",
      "title": "Notes that sync across your devices",
      "like": "a private offline notebook like Standard Notes",
      "concepts": [
        "device-sync",
        "ordering-time",
        "privacy-design",
        "consistency-models",
        "work-across-services"
      ],
      "brief": "Build a notebook that works on a phone and laptop, including a month offline. Edits should reach connected foreground devices in under a second, concurrent work must not disappear, and the server should not need plaintext notes. Push wakes devices; durable sync must work when push does not.",
      "clarify": [
        {
          "q": "What does saved mean offline?",
          "a": "The note edit and device outbox operation are committed locally before the screen says saved on this device. Synced means the server durably accepted the operation. Losing the device before sync remains a real data-loss boundary."
        },
        {
          "q": "What happens to conflicting edits?",
          "a": "Use stable operation ids and base versions. Preserve concurrent whole-note edits as conflict versions in the first release. Do not silently pick by wall time. A text CRDT is a possible later choice with a tested merge policy."
        },
        {
          "q": "How long can a device be away?",
          "a": "Support 30 days. Keep deletion history for 90 days with a documented margin. Older cursors require snapshot rebase and version-checked replay of preserved local edits. A stale full upload must not resurrect a deletion."
        },
        {
          "q": "Which privacy features are required?",
          "a": "Encrypt note bodies on devices. The server stores ciphertext and minimal routing metadata. Search is local. Device enrollment, revocation and an explicit recovery key are part of the design. Server KMS protects metadata only; it does not hold note decryption keys."
        }
      ],
      "requirements": {
        "users": "1 million people with about 3 devices each (approx.)",
        "monthlyUsers": 1000000,
        "peakRps": 3000,
        "mix": {
          "sync": 0.6,
          "read": 0.35,
          "notify": 0.05
        },
        "latencyP99Ms": {
          "default": 900,
          "notify": 5000
        },
        "availability": 0.999,
        "dataSafety": "no-loss",
        "readYourWrites": true,
        "compliance": [
          "encryption",
          "audit-log"
        ],
        "budgetPerMonth": 12000,
        "storageTb": 2,
        "userRegions": {
          "us": 1
        },
        "homeRegion": "us",
        "notes": [
          "The catalog sync operation is about 1 KB. Peak accepted edit payload is 3,000 × 0.6 × 1 KB ≈ 1.8 MB/s, before replication (approx.).",
          "Under-a-second is a foreground connected-device goal. Background push and offline devices have eventual delivery. The scored notify path measures sender acceptance, not device receipt.",
          "The graph carries encrypted operations and small reads. It does not implement offline storage, conflict resolution, cursors, end-to-end encryption, recovery or tombstones. A traffic pass does not prove these properties.",
          "KMS and audit nodes protect server metadata and record content-free access/deletion receipts. They are not the end-to-end content key service.",
          "The current sim applies a global request mix. All source paths share a real authenticated front door. workloadPlan records source-specific rates for a later engine; it is descriptive and does not affect this score.",
          "The 900 ms target measures one request. Subsecond propagation needs an end-to-end budget across commit, change notification, pull and local application; a traffic pass does not verify it."
        ]
      },
      "traffic": {
        "curve": "consumer-evening",
        "sources": {
          "mobile-app": 1
        }
      },
      "starter": {
        "nodes": [
          {
            "ref": "devices",
            "type": "mobile-app",
            "x": -660,
            "y": 0,
            "locked": true,
            "label": "Notes on your devices",
            "knobs": {
              "retries": 2,
              "backoff": "exponential-jitter"
            }
          }
        ],
        "edges": []
      },
      "workloadPlan": [
        {
          "sourceRef": "devices",
          "entryRef": "lb",
          "peakRps": 3000,
          "mix": {
            "sync": 0.6,
            "read": 0.35,
            "notify": 0.05
          },
          "role": "encrypted device operations, pulls and wake requests"
        }
      ],
      "events": [
        {
          "id": "zone-outage",
          "at": "11:00"
        },
        {
          "id": "thundering-herd",
          "at": "16:00",
          "params": {
            "factor": 2,
            "types": [
              "sync"
            ]
          }
        },
        {
          "id": "retry-storm",
          "at": "20:00"
        }
      ],
      "eventPool": [
        "noisy-neighbor"
      ],
      "numbers": [
        {
          "label": "Peak edit payload",
          "value": 1.8,
          "unit": "MB/s",
          "how": "3,000 × 0.6 × 1 KB, before replica and metadata work (approx.).",
          "ask": true
        },
        {
          "label": "Delta payload for 50 changed notes",
          "value": 100,
          "unit": "KB",
          "how": "50 × 2 KB; versus 10,000 × 2 KB = 20 MB for a full notebook (approx.).",
          "ask": true
        },
        {
          "label": "Deletion history margin",
          "value": 60,
          "unit": "days",
          "how": "90-day tombstones - 30-day supported offline period; old cursors still need explicit rebase.",
          "ask": true
        }
      ],
      "hints": [
        "What must be committed locally before a network request, and what does a sync cursor acknowledge?",
        "Use stable ids, atomic local edit-plus-outbox, durable server deduplication and version checks. Push is only a wake hint.",
        "Route encrypted operations through the API to a synchronous authority. Store a server outbox with each accepted change for later wake delivery, deduplicate wake jobs, preserve conflicts and keep tombstones. Explain key recovery and local search."
      ],
      "editorial": {
        "summary": "Each device has an encrypted local database, a transactionally written outbox and a committed pull cursor. The server authenticates devices, deduplicates tenant-scoped operation ids, saves ciphertext and an event in one transaction, and returns the accepted version without moving the device's pull cursor past unseen remote edits. Connected clients pull deltas; a wake worker uses the durable server outbox and retries push. The reference models the authority and push sender as separate requests through the API. It does not pretend the sim verifies their transactional relationship.",
        "designs": [
          {
            "name": "Encrypted operations with a synchronous authority",
            "why": "A multi-zone SQL authority can store operation ids, versions, tombstones and the durable server outbox together. Immediate pulls use the authority for read-your-writes. Notify requests represent dispatch after an outbox job becomes due; the API fleet includes that dispatcher role. There is no database-to-push wire because the database does not make network calls. Direct dispatch in the graph measures sender capacity, not atomic outbox publication.",
            "graph": {
              "nodes": [
                {
                  "ref": "devices",
                  "type": "mobile-app",
                  "x": -660,
                  "y": 0,
                  "locked": true,
                  "label": "Notes on your devices",
                  "knobs": {
                    "retries": 2,
                    "backoff": "exponential-jitter"
                  }
                },
                {
                  "ref": "lb",
                  "type": "regional-lb",
                  "x": -480,
                  "y": 0,
                  "units": 3,
                  "zones": 3
                },
                {
                  "ref": "limits",
                  "type": "rate-limiter",
                  "x": -300,
                  "y": 0,
                  "units": 3,
                  "zones": 3,
                  "knobs": {
                    "limitRps": 1000,
                    "mode": "fail-closed"
                  }
                },
                {
                  "ref": "api",
                  "type": "vm-fleet",
                  "x": -120,
                  "y": 0,
                  "units": 6,
                  "zones": 3,
                  "knobs": {
                    "retries": 1,
                    "backoff": "exponential-jitter"
                  }
                },
                {
                  "ref": "data",
                  "type": "sql-primary",
                  "x": 60,
                  "y": 0,
                  "zones": 3,
                  "tier": "L",
                  "knobs": {
                    "replication": "sync",
                    "retentionDays": 90
                  }
                },
                {
                  "ref": "push",
                  "type": "push-service",
                  "x": 60,
                  "y": 160
                },
                {
                  "ref": "keys",
                  "type": "kms",
                  "x": 240,
                  "y": -140,
                  "label": "Server metadata keys"
                },
                {
                  "ref": "audit",
                  "type": "audit-log",
                  "x": 240,
                  "y": 0,
                  "label": "Access and deletion receipts",
                  "knobs": {
                    "retentionDays": 30
                  }
                },
                {
                  "ref": "metrics",
                  "type": "metrics",
                  "x": -120,
                  "y": 320
                },
                {
                  "ref": "alerts",
                  "type": "alerting",
                  "x": 60,
                  "y": 320
                },
                {
                  "ref": "pager",
                  "type": "pager",
                  "x": 240,
                  "y": 320
                }
              ],
              "edges": [
                [
                  "devices",
                  "lb"
                ],
                [
                  "lb",
                  "limits"
                ],
                [
                  "limits",
                  "api"
                ],
                [
                  "api",
                  "data"
                ],
                [
                  "api",
                  "push"
                ],
                [
                  "api",
                  "keys"
                ],
                [
                  "api",
                  "audit"
                ],
                [
                  "api",
                  "metrics"
                ],
                [
                  "metrics",
                  "alerts"
                ],
                [
                  "alerts",
                  "pager"
                ]
              ]
            },
            "expect": {
              "score": 0,
              "costPerMonth": 0
            }
          }
        ],
        "tradeoffs": [
          "Conflict copies are easier to explain and test than arbitrary text merging, but users must resolve them. A CRDT can reduce manual conflicts at the cost of metadata, compaction rules and editor-specific semantics.",
          "End-to-end encryption moves search and key handling to devices. Recovery needs an authorized device or a recovery secret; password reset alone cannot reconstruct content keys. Metadata still leaks timing and sizes.",
          "Tombstones cannot expire independently of the supported offline horizon and replica repair. Devices returning beyond the horizon need a fresh snapshot, with unsynced work preserved and base versions validated. After tombstones expire, reject old epochs or unknown base versions; a fresh snapshot alone does not make stale queued uploads safe.",
          "A push acknowledgement is not device delivery. Durable cursors, retries and periodic or foreground pulls recover missed wakes. Batching reduces radio wakeups; attachment sync can prefer charging and Wi-Fi.",
          "Deletion jobs cover ciphertext versions, local indexes, caches, object attachments and backups under a stated deadline. Revoking a device cannot erase plaintext it already copied."
        ],
        "realWorld": "A 10,000-note notebook at 2 KB/note is about 20 MB. Fifty changed notes cost about 100 KB before metadata, about 200 times less payload. Local changes can feel instant while network synchronization remains pending (approx.)."
      },
      "correctness": {
        "prompt": "A month-old laptop uploads an edited note that the phone deleted. How do the cursor, base version and tombstone keep the deletion from silently disappearing?",
        "discussion": "Keep a durable local edit and operation id while pulling server changes. A tombstone identifies the deleted note and version. The server validates the edit base version, then preserves a conflict or requests user resolution instead of treating an old snapshot as truth. If history expired, download a new snapshot without discarding local unsynced operations and rebase them explicitly. Use stable ids across retries. Commit cursor advancement with local application of the pulled changes. Content encryption and key recovery require separate endpoint tests. Upload acknowledgement and pull progress are separate. A server-assigned upload version is not evidence that earlier remote changes have been downloaded.",
        "fields": [
          {
            "label": "Local save",
            "options": [
              "Commit edit and outbox together before confirming local save",
              "Save the note locally, then create its outbox entry in a second transaction"
            ],
            "correct": 0,
            "explanation": "The outbox survives a crash or closed app before upload."
          },
          {
            "label": "Concurrent edit policy",
            "options": [
              "Apply last-write-wins using synchronized device wall clocks",
              "Preserve conflict versions or apply a specified tested merge"
            ],
            "correct": 1,
            "explanation": "Clock order is not causal order and can discard work."
          }
        ],
        "limits": "The score does not prove device durability, convergence, end-to-end encryption, deletion or background push delivery."
      }
    },
    {
      "difficulty": "Hard",
      "requires": {},
      "palette": null,
      "daily": false,
      "id": "wearable-health",
      "title": "Health readings from a wearable",
      "like": "private health summaries from a wrist device",
      "concepts": [
        "privacy-design",
        "device-sync",
        "storage-engine",
        "ordering-time",
        "slos-error-budgets"
      ],
      "brief": "A wearable records health readings even when its phone or cloud service is unavailable. Keep raw readings on the device when possible and upload only consented summaries in sparse batches. The system must not lose locally saved readings during a supported outage, and deleting an account must have a verifiable end-to-end workflow.",
      "clarify": [
        {
          "q": "Is this an emergency alert service?",
          "a": "No. It is a retrospective personal dashboard. Local trends remain available offline; the cloud must not be presented as a safety-critical alarm path. A medical alarm would require different guarantees."
        },
        {
          "q": "What is stored locally and for how long?",
          "a": "Assume one 16-byte reading each second, with a durable encrypted local log. Reserve at least 30 days of raw capacity, including overhead and a safety margin. A 14-day phone or cloud outage must not lose readings already durably saved, provided the device remains intact and has power."
        },
        {
          "q": "What leaves the device?",
          "a": "Only an opt-in daily encrypted 1 KB summary by default, plus explicit user-selected exports. Derive the summary locally. The service has routing metadata but not health-content keys. No raw content in analytics, logs or push payloads."
        },
        {
          "q": "What if there is no space or a device is lost?",
          "a": "Never silently claim a saved reading when the log is full or not durable. Warn before the supported reserve is exhausted and state the retention policy. Device destruction before an authorized backup is outside the no-loss promise. Recovery and revocation need an explicit key policy."
        }
      ],
      "requirements": {
        "users": "100,000 wearables with sparse opt-in uploads (approx.)",
        "monthlyUsers": 100000,
        "peakRps": 500,
        "mix": {
          "telemetry": 0.9,
          "read": 0.08,
          "notify": 0.02
        },
        "latencyP99Ms": {
          "default": 1500,
          "telemetry": 1500,
          "notify": 5000
        },
        "availability": 0.999,
        "dataSafety": "no-loss",
        "readYourWrites": false,
        "compliance": [
          "encryption",
          "audit-log"
        ],
        "budgetPerMonth": 6500,
        "storageTb": 0.0365,
        "userRegions": {
          "us": 1
        },
        "homeRegion": "us",
        "notes": [
          "Cloud peak is a reconnect burst: 450 one-KB summaries/s, 40 small reads/s and 10 wake notifications/s. Normal opt-in uploads are at most 100,000 summaries/day ≈ 1.16/s; the daily curve is a conservative capacity drill, not the sparse average billing forecast (approx.).",
          "One year of 100,000 × 1 KB/day summaries is about 36.5 GB before copies, encryption tags and metadata. Raw readings remain local; the sim storage figure is cloud summary payload only (approx.).",
          "The scored no-loss target concerns acknowledged cloud summaries. The device log, fourteen-day outage reserve, consent, encryption keys and proof of deletion are worked protocol obligations.",
          "The sender target concerns push acceptance only. No cloud availability percentage is a guarantee of medical safety or survival of a destroyed device.",
          "The current sim applies a global request mix. All source paths share a real authenticated front door. workloadPlan records source-specific rates for a later engine; it is descriptive and does not affect this score."
        ]
      },
      "traffic": {
        "curve": "business-hours",
        "sources": {
          "iot-device": 1
        }
      },
      "starter": {
        "nodes": [
          {
            "ref": "devices",
            "type": "iot-device",
            "x": -660,
            "y": 0,
            "locked": true,
            "label": "Consented wearable uploads",
            "knobs": {
              "retries": 2,
              "backoff": "exponential-jitter"
            }
          }
        ],
        "edges": []
      },
      "workloadPlan": [
        {
          "sourceRef": "devices",
          "entryRef": "lb",
          "peakRps": 500,
          "mix": {
            "telemetry": 0.9,
            "read": 0.08,
            "notify": 0.02
          },
          "role": "consented encrypted summaries and account sync; raw log is local"
        }
      ],
      "events": [
        {
          "id": "retry-storm",
          "at": "08:00"
        },
        {
          "id": "zone-outage",
          "at": "12:00"
        },
        {
          "id": "thundering-herd",
          "at": "18:00",
          "params": {
            "factor": 3,
            "types": [
              "telemetry"
            ]
          }
        }
      ],
      "eventPool": [
        "noisy-neighbor"
      ],
      "numbers": [
        {
          "label": "Fourteen-day local raw payload",
          "value": 19.3536,
          "unit": "MB",
          "how": "16 B/s × 86,400 × 14 ÷ 1,000,000; reserve more for encryption, indexing and margin (approx.).",
          "ask": true
        },
        {
          "label": "Raw payload per day",
          "value": 1.3824,
          "unit": "MB",
          "how": "16 B × 86,400 readings/day; compared with one 1 KB daily summary (approx.).",
          "ask": true
        },
        {
          "label": "Normal fleet upload rate",
          "value": 1.1574,
          "unit": "summaries/s",
          "how": "100,000 summaries ÷ 86,400 seconds, before optional exports (approx.).",
          "ask": true
        }
      ],
      "hints": [
        "Separate local capture, phone relay and cloud acceptance. Which promise applies while the radio is off?",
        "Persist a monotonic device sequence and outbox locally, checkpoint only durable summaries, and retry stable batch ids. Keep raw content out of cloud telemetry.",
        "Use local encrypted logging and on-device summaries, then a jittered authenticated API to a durable key-value store. Budget 30-day device storage, explicit consent, enrollment and recovery keys, deletion receipts and restore checks."
      ],
      "editorial": {
        "summary": "Persist readings in a durable local encrypted log with sequence numbers, checksums and crash recovery. Derive summaries on the device and place consented encrypted uploads in a local outbox. A phone can relay ciphertext without treating the cloud as the capture path. The API authenticates device identity, deduplicates batch sequence ranges and stores ciphertext summaries. The graph begins at optional cloud uploads; it cannot prove the local capture or encryption promises.",
        "designs": [
          {
            "name": "Device-owned readings and sparse encrypted summaries",
            "why": "The key-value store fits immutable device-and-date summary keys and small reads. The API validates consent and stable upload identities; storage operations enforce uniqueness and monotonic sequence acknowledgement. KMS protects server account metadata only. Push contains a wake hint without health content. The steady cloud drill deliberately tests more activity than the normal sparse schedule, so its projected bill is a capacity exercise.",
            "graph": {
              "nodes": [
                {
                  "ref": "devices",
                  "type": "iot-device",
                  "x": -660,
                  "y": 0,
                  "locked": true,
                  "label": "Consented wearable uploads",
                  "knobs": {
                    "retries": 2,
                    "backoff": "exponential-jitter"
                  }
                },
                {
                  "ref": "lb",
                  "type": "regional-lb",
                  "x": -480,
                  "y": 0,
                  "units": 3,
                  "zones": 3
                },
                {
                  "ref": "limits",
                  "type": "rate-limiter",
                  "x": -300,
                  "y": 0,
                  "units": 3,
                  "zones": 3,
                  "knobs": {
                    "limitRps": 1000,
                    "mode": "fail-closed"
                  }
                },
                {
                  "ref": "api",
                  "type": "vm-fleet",
                  "x": -120,
                  "y": 0,
                  "units": 6,
                  "zones": 3,
                  "knobs": {
                    "retries": 1,
                    "backoff": "exponential-jitter"
                  }
                },
                {
                  "ref": "data",
                  "type": "kv-store",
                  "x": 60,
                  "y": 0,
                  "units": 2
                },
                {
                  "ref": "push",
                  "type": "push-service",
                  "x": 60,
                  "y": 160
                },
                {
                  "ref": "keys",
                  "type": "kms",
                  "x": 240,
                  "y": -140,
                  "label": "Server metadata keys"
                },
                {
                  "ref": "audit",
                  "type": "audit-log",
                  "x": 240,
                  "y": 0,
                  "label": "Access and deletion receipts",
                  "knobs": {
                    "retentionDays": 30
                  }
                },
                {
                  "ref": "metrics",
                  "type": "metrics",
                  "x": -120,
                  "y": 320
                },
                {
                  "ref": "alerts",
                  "type": "alerting",
                  "x": 60,
                  "y": 320
                },
                {
                  "ref": "pager",
                  "type": "pager",
                  "x": 240,
                  "y": 320
                }
              ],
              "edges": [
                [
                  "devices",
                  "lb"
                ],
                [
                  "lb",
                  "limits"
                ],
                [
                  "limits",
                  "api"
                ],
                [
                  "api",
                  "data"
                ],
                [
                  "api",
                  "push"
                ],
                [
                  "api",
                  "keys"
                ],
                [
                  "api",
                  "audit"
                ],
                [
                  "api",
                  "metrics"
                ],
                [
                  "metrics",
                  "alerts"
                ],
                [
                  "alerts",
                  "pager"
                ]
              ]
            },
            "expect": {
              "score": 0,
              "costPerMonth": 0
            }
          }
        ],
        "tradeoffs": [
          "Thirty days of one 16-byte sample/s is about 41.5 MB payload. Reserve extra for authenticated-encryption tags, indexes, crash-safe metadata and compaction. Do not confuse payload with safe device capacity.",
          "A saved local reading is protected against the stated software/network outage, not device destruction, power loss before flush or an unbounded disconnection. Define flush semantics and a visible low-space response.",
          "Daily 1 KB summaries minimize upload compared with about 1.38 MB/day raw data, but lose server-side detail and still reveal sensitive health trends. Optional exports require separate consent and expiry.",
          "Use device sequence order for deduplication; record capture-time uncertainty when clocks change. A late upload must not replace a newer summary without a version rule.",
          "Revocation stops future authorized sync, not already copied plaintext. Deletion tracks active summaries, versions, caches, exports and backups, and restores must reapply deletion records before serving. Recovery cannot secretly bypass end-to-end content keys. A disconnected device cannot receive a deletion command immediately. Erase managed cloud copies on the stated schedule, reject revoked device uploads, and state that endpoint deletion awaits reconnection or local action."
        ],
        "realWorld": "For 100,000 devices, one daily 1 KB summary is about 100 MB/day cloud payload. Uploading all assumed raw readings would be about 138 GB/day before overhead. Radio wakeups and tail energy matter as well as bytes, so batch uploads and measure on real devices (approx.)."
      },
      "correctness": {
        "prompt": "The cloud is unavailable for fourteen days and the device reboots during a local write. What exactly is durable, when is an upload acknowledged, and how do retries avoid losing a saved reading?",
        "discussion": "Commit or append readings with a recoverable record boundary, sequence number and integrity check, then confirm only what the local storage durability contract supports. Keep a reserve beyond the supported outage and make low-space behavior visible. Record summaries and upload intents durably; retry the same device and sequence-range identity. Advance the local upload checkpoint only after a durable cloud acknowledgement. Cloud success must not delete raw readings earlier than local retention policy. A reboot test, full-disk test and key-recovery test are separate from the traffic score.",
        "fields": [
          {
            "label": "Outage promise",
            "options": [
              "A volatile local buffer with cloud retries protects capture through reboot",
              "A tested device log and sufficient local reserve protect saved readings"
            ],
            "correct": 1,
            "explanation": "The cloud is absent during this failure; local durability and capacity carry the promise."
          },
          {
            "label": "Cloud collection",
            "options": [
              "Only consented encrypted summaries and explicit exports",
              "Encrypted raw readings with rotating pseudonyms and a server retention limit"
            ],
            "correct": 0,
            "explanation": "Local processing and sparse collection reduce the sensitive archive."
          }
        ],
        "limits": "The traffic score cannot verify flash durability, battery behavior, consent, content encryption or deletion evidence."
      }
    }
  ]
};
