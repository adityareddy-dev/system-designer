// Lesson text and interactive figure stages.
export default {
  "id": "device-sync",
  "title": "Syncing across devices",
  "track": "Go deeper",
  "minutes": 7,
  "summary": "Offline edits need durable local intent, a cursor and a plan for old devices.",
  "steps": [
    {
      "kind": "read",
      "title": "The note returns after you delete it",
      "text": "You delete a note on your phone. A laptop has been offline for a month and later uploads its old copy. Without a record of the deletion, the server may treat that copy as new. Sync is a protocol for reconciling histories, not just downloading the current rows.",
      "icon": "el.mobile-app"
    },
    {
      "kind": "figure",
      "figure": "device-sync",
      "view": "deltas",
      "title": "Send changes, keep intent",
      "text": "Edit one note on two offline devices, delete another, then reconnect. Delta payloads carry the intent; concurrent versions need a visible resolution."
    },
    {
      "kind": "read",
      "title": "Worked example: a day of edits",
      "text": "These are payload sizes before metadata. Polling every minute permits up to 1,440 timer attempts a day, but the operating system may suspend or coalesce them. Timer firings do not measure radio wakeups. Push can prompt an authenticated delta fetch; it is not the durable delivery channel. Under-a-second freshness is a connected foreground target. Background delivery remains eventual.",
      "diagram": {
        "label": "One day on a phone",
        "parts": [
          [
            "Full refresh: 20 MB",
            "10,000 notes × 2 KB before metadata."
          ],
          [
            "Delta: 100 KB",
            "50 changed notes × 2 KB. About 200 times less payload."
          ],
          [
            "Push, then pull",
            "A push is a wake-up hint. Durable authenticated sync still fetches the changes."
          ]
        ]
      }
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Full notebook",
          "value": "≈ 20 MB",
          "how": "10,000 × 2 KB; metadata excluded"
        },
        {
          "label": "Daily changed notes",
          "value": "≈ 100 KB",
          "how": "50 × 2 KB; about 200 times less payload"
        },
        {
          "label": "Minute polling attempts",
          "value": "≈ 1,440/day",
          "how": "24 × 60 if allowed to run; actual wakeups depend on the OS and radio"
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "A client persists its pull cursor before committing downloaded changes, then crashes. What can happen?",
      "choices": [
        "The next pull repeats the changes because the server can see the crash",
        "The next pull skips changes that never committed locally",
        "The server deduplicates uploads, which also repairs the missing downloads"
      ],
      "answer": 1,
      "why": "The server cannot infer local application. Commit pulled changes and their cursor in one local transaction."
    },
    {
      "kind": "defend",
      "q": "Why is an on-device outbox necessary? Follow-up: the user closes the app just after an edit.",
      "checklist": [
        "Commit the note and its upload intent in one local transaction",
        "Say when saved locally becomes durably synced to the server",
        "Resume the same operation id after app termination or reboot"
      ],
      "model": "A network call after a local edit leaves a crash window. I would save the edit and its outbox operation together before confirming local save. On restart, the outbox resumes with the same id. The screen says saved on this device until the server durably accepts it. That does not protect against losing the device itself before syncing, and the product must make that distinction clear."
    },
    {
      "kind": "read",
      "title": "Keep deletions and expose conflicts",
      "text": "Validate upload epochs or reject unknown base versions even after tombstones expire. Otherwise a missing old identity can look new. Concurrent whole-note edits may become conflict copies; a text CRDT preserves more intent with extra metadata and testing cost. Show saved locally, syncing, synced and conflict separately. Bound batches, compress deltas, back off retries and consider Wi-Fi or charging policies for large attachments.",
      "diagram": {
        "label": "A deletion must outlive an offline copy",
        "parts": [
          [
            "30-day offline horizon",
            "Retain the tombstone and version history for supported returning devices."
          ],
          [
            "Device returns too late",
            "Reject the old epoch and rebase from a fresh snapshot."
          ],
          [
            "Concurrent edits survive",
            "Show conflict copies or merge deliberately. Do not silently replace either history."
          ]
        ]
      }
    },
    {
      "kind": "quiz",
      "q": "A sleeping phone receives delayed push notifications. What promise can the sync protocol support?",
      "choices": [
        "Subsecond background sync once the push provider accepts the notification",
        "Confirmed delivery once the server persists its push outbox entry",
        "Fast foreground sync and eventual background catch-up when the app runs"
      ],
      "answer": 2,
      "why": "Provider acceptance and durable intent are useful boundaries, but neither proves the phone has run or pulled changes."
    },
    {
      "kind": "defend",
      "q": "Can we delete tombstones after a week to cut storage? Follow-up: a laptop returns after a month.",
      "checklist": [
        "Compare one-week tombstones with the supported month offline",
        "Reject expired epochs or unknown bases before applying old uploads",
        "Preserve unsynced edits while fetching and rebasing a fresh snapshot"
      ],
      "model": "Only if our supported offline window and all recovery paths fit that week, or old clients are forced through a safe rebase. A month-old laptop cannot upload its old snapshot as truth. I would fetch a fresh snapshot, preserve its unsynced operations separately, validate base versions and surface conflicts. The extra deletion metadata buys a concrete promise about which disconnected clients can return safely."
    },
    {
      "kind": "quiz",
      "q": "A device returns after its cursor and deletion history expired. How can it resume without reviving deleted notes?",
      "choices": [
        "Fetch a snapshot, preserve queued edits and validate their old bases or surface conflicts",
        "Fetch a snapshot, then overwrite it with all queued note bodies",
        "Set the cursor to the current log head and upload rows missing from the snapshot"
      ],
      "answer": 0,
      "why": "A missing row could be a deletion. Old queued work needs version validation or user resolution, not unconditional replay."
    }
  ],
  "takeaway": "Save intent locally, resume with stable ids and cursors, and keep enough history to merge safely."
};
