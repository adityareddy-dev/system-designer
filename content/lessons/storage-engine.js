// Original lesson data. Worked figures are approximations, not engine measurements.
export default {
  "id": "storage-engine",
  "title": "Inside a storage engine",
  "track": "Go deeper",
  "minutes": 7,
  "summary": "The path from a write to disk decides memory, I/O and cost.",
  "steps": [
    {
      "kind": "read",
      "title": "Fast inserts, then a sudden stall",
      "text": "An import runs well for ten minutes, then write latency climbs even though incoming traffic is flat. The database is merging files in the background. An acknowledged byte can be written several times over its life. Capacity planning that counts only the incoming payload misses that work.",
      "icon": "el.sql-primary"
    },
    {
      "kind": "read",
      "title": "Two ways to keep keys sorted",
      "text": "A write-ahead log records a change before the database treats it as durable. Recovery replays the log after a crash. A B-tree stores sorted keys in pages, updating affected pages and sometimes splitting them. A buffer pool turns many random I/Os into memory access, but dirty pages still reach disk. An LSM tree first appends to a log and updates a sorted in-memory memtable. It later flushes immutable sorted files called SSTables. Compaction merges files, drops obsolete versions when safe and rewrites surviving keys. B-trees also use logs and background work. Neither name alone predicts the winner; measure the access pattern and working set."
    },
    {
      "kind": "read",
      "title": "Worked example: the hidden writes",
      "text": "Suppose logical ingestion is 20 MB/s. Assume measured total device write amplification is 10, including WAL, flushes and compaction in this workload. The device must sustain about 200 MB/s, or 17.28 TB written per day. With three replicas that becomes about 51.84 TB/day across devices, before unrelated work. If each device can safely sustain 300 MB/s for this workload, it has limited space for repair and bursts. These are explicit assumptions, not universal LSM ratios. The sim models store capacities but not SSTables or disk endurance."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Device writes",
          "value": "≈ 200 MB/s",
          "how": "20 MB/s logical × measured amplification 10"
        },
        {
          "label": "Daily device writes",
          "value": "≈ 17.28 TB",
          "how": "200 MB/s × 86,400 s; decimal units"
        },
        {
          "label": "Filter memory",
          "value": "≈ 125 MB",
          "how": "100 million keys × 10 bits ÷ 8; excludes overhead"
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "Ingestion is 20 MB/s and measured total write amplification is 10. Is a 50 MB/s disk sufficient?",
      "choices": [
        "Yes, logical traffic is below 50",
        "No, it needs about 200 MB/s before headroom",
        "Yes, Bloom filters compress the WAL"
      ],
      "answer": 1,
      "why": "The device sees rewritten bytes as well as new bytes. Filters address lookups, not write bandwidth."
    },
    {
      "kind": "defend",
      "q": "The SSD vendor quotes 1 GB/s. Why will you not promise 1 GB/s of user writes? Follow-up: include replication.",
      "checklist": [
        "Separate logical bytes from device bytes",
        "Include WAL, compaction and replica copies",
        "Reserve capacity for recovery and test p99"
      ],
      "model": "That figure may be sequential bandwidth under a different workload. If total amplification is ten, 1 GB/s of device writes supports at most 100 MB/s logical writes before headroom. Three full replicas triple fleet device work, not necessarily each device's incoming share. I would benchmark durable acknowledgements with compaction, reads and repair active. I would also check endurance, temporary disk space and tail latency before quoting a safe ingest rate."
    },
    {
      "kind": "read",
      "title": "Reads pay too",
      "text": "An LSM lookup may check memory and several candidate files. A Bloom filter can say definitely absent or maybe present for a key in a file. A positive result still requires a lookup; a false positive wastes I/O. Filters do not return the value, and a range scan still needs data. At roughly 10 bits per key, a well-tuned Bloom filter has about a 1% false-positive rate. For 100 million keys that is about 125 MB before overhead. More filter and cache memory can reduce reads. Compaction style trades write amplification, read amplification and temporary disk space. Choose hardware from measured p99, IOPS, sequential bandwidth, memory and endurance, with repair and compaction running together."
    },
    {
      "kind": "quiz",
      "q": "A Bloom filter says maybe present. What should the engine do?",
      "choices": [
        "Return the value from the filter",
        "Treat the key as definitely absent",
        "Check the candidate file or cache"
      ],
      "answer": 2,
      "why": "The filter has false positives and contains no values."
    },
    {
      "kind": "defend",
      "q": "Can we stop compaction to make today's writes faster? Follow-up: what happens tomorrow?",
      "checklist": [
        "Explain accumulated files and read amplification",
        "Allow a bounded temporary response",
        "Define catch-up headroom and disk alarms"
      ],
      "model": "Pausing compaction can temporarily free I/O, but files and obsolete versions accumulate. Reads may check more files, disk fills and later compaction needs extra bandwidth. I might reduce its rate briefly during an incident while also reducing admitted writes. I would set a deadline, watch pending compaction bytes and disk space, and reserve a measured catch-up window. It is borrowing capacity, not creating it."
    },
    {
      "kind": "quiz",
      "q": "Your working set fits in RAM and updates are small. Which storage choice is defensible?",
      "choices": [
        "Benchmark both with realistic durability and compaction settings",
        "Choose LSM because inserts are always faster",
        "Choose B-tree because it never rewrites data"
      ],
      "answer": 0,
      "why": "Workload, cache, durability settings and background work decide performance. Both structures have amplification."
    }
  ],
  "takeaway": "Size the physical reads, writes and memory under background work, not just the incoming payload."
};
