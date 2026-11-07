// Lesson text and interactive figure stages.
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
      "kind": "figure",
      "figure": "storage-engine",
      "view": "write",
      "title": "Two ways to keep keys sorted",
      "text": "Write several keys, flush twice, then compact. Both structures receive the same writes. Compare counted record work with B+ tree page changes."
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
      "q": "Logical writes are 20 MB/s and measured total device write amplification is 10. What device bandwidth is needed before headroom?",
      "choices": [
        "About 20 MB/s because compaction runs in the background",
        "About 200 MB/s",
        "About 60 MB/s after allowing one WAL write and one flush"
      ],
      "answer": 1,
      "why": "The measured total already includes WAL, flushes and compaction: 20 × 10 = 200 MB/s."
    },
    {
      "kind": "defend",
      "q": "The SSD vendor quotes 1 GB/s. Why will you not promise 1 GB/s of user writes? Follow-up: include replication.",
      "checklist": [
        "Divide 1 GB/s device bandwidth by amplification ten before headroom",
        "Count three replicas across the fleet without charging each device three times",
        "Benchmark p99 with durable commits, reads, compaction and repair"
      ],
      "model": "That figure may be sequential bandwidth under a different workload. If total amplification is ten, 1 GB/s of device writes supports at most 100 MB/s logical writes before headroom. Three full replicas triple fleet device work, not necessarily each device's incoming share. I would benchmark durable acknowledgements with compaction, reads and repair active. I would also check endurance, temporary disk space and tail latency before quoting a safe ingest rate."
    },
    {
      "kind": "figure",
      "figure": "storage-engine",
      "view": "read",
      "title": "Reads pay too",
      "text": "Read keys that exist and one that does not. A Bloom negative skips a file; a positive still requires a lookup. Filters reduce read work, not the number of versions stored."
    },
    {
      "kind": "quiz",
      "q": "A file's Bloom filter says a key may be present. What does a correct point lookup do next?",
      "choices": [
        "Return absent unless a second Bloom filter agrees",
        "Treat the positive as proof and skip checking the key in the data",
        "Check the candidate data through the cache or file index"
      ],
      "answer": 2,
      "why": "A positive can be false. A filter identifies candidate files but cannot return or confirm a value."
    },
    {
      "kind": "defend",
      "q": "Can we stop compaction to make today's writes faster? Follow-up: what happens tomorrow?",
      "checklist": [
        "Explain how paused compaction increases files, reads and disk use",
        "Pair temporary throttling with an admission limit and deadline",
        "Monitor pending compaction bytes and reserve catch-up bandwidth"
      ],
      "model": "Pausing compaction can temporarily free I/O, but files and obsolete versions accumulate. Reads may check more files, disk fills and later compaction needs extra bandwidth. I might reduce its rate briefly during an incident while also reducing admitted writes. I would set a deadline, watch pending compaction bytes and disk space, and reserve a measured catch-up window. It is borrowing capacity, not creating it."
    },
    {
      "kind": "quiz",
      "q": "A new workload fits in RAM, but must survive crashes. Which evidence best supports choosing B-tree or LSM storage?",
      "choices": [
        "Steady-state benchmarks with durability, reads and background work enabled",
        "A ten-minute insert benchmark that ends before compaction starts",
        "A cache-hit benchmark with WAL synchronization disabled"
      ],
      "answer": 0,
      "why": "The working set may fit in RAM while durable writes and background I/O still control sustained performance."
    }
  ],
  "takeaway": "Size the physical reads, writes and memory under background work, not just the incoming payload."
};
