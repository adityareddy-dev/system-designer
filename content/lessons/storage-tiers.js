// Lesson data. Plain object; see CONTRACT.md section 11.2. All figures are rough real-world approximations.
export default {
  "id": "storage-tiers",
  "title": "Hot, warm, cold and archive",
  "track": "Scale the data",
  "minutes": 3,
  "summary": "Old data is rarely read, so keep it somewhere cheaper and slower.",
  "steps": [
    {
      "kind": "read",
      "title": "Not all data is equal",
      "text": "Yesterday's photos are viewed all the time; photos from five years ago almost never. Fast storage costs more per gigabyte. Move data down tiers as it ages: hot for now, warm for this month, cold for rarely, archive for the law.",
      "icon": "el.cold-archive"
    },
    {
      "kind": "demo",
      "prompt": "You hold 120 TB and most of it is old. Move it to cheaper storage to cut the bill.",
      "setup": {
        "palette": [
          "object-storage",
          "cold-archive"
        ],
        "requirements": {
          "peakRps": 300,
          "mix": {
            "read": 0.95,
            "write": 0.05
          },
          "latencyP99Ms": {
            "default": 300
          },
          "availability": 0.99,
          "budgetPerMonth": 3000,
          "userRegions": {
            "us": 1
          },
          "homeRegion": "us",
          "storageTb": 120
        },
        "traffic": {
          "curve": "flat",
          "sources": {
            "mobile-app": 1
          }
        },
        "starter": {
          "nodes": [
            {
              "ref": "users",
              "type": "web-browser",
              "x": -480,
              "y": 0,
              "locked": true
            },
            {
              "ref": "app",
              "type": "vm-fleet",
              "x": -300,
              "y": 0,
              "units": 2
            },
            {
              "ref": "files",
              "type": "object-storage",
              "x": -120,
              "y": 0,
              "knobs": {
                "retentionDays": 395
              }
            }
          ],
          "edges": [
            [
              "users",
              "app"
            ],
            [
              "app",
              "files"
            ]
          ]
        },
        "events": []
      },
      "goal": {
        "holdSec": 60,
        "metric": "cost",
        "op": "<=",
        "value": 3000
      },
      "hint": "Place a Cold archive, connect the storage to it, and shorten how long the main storage keeps data."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Fast storage",
          "value": "≈ $23 per TB-month",
          "how": "object standard, approx."
        },
        {
          "label": "Rarely read storage",
          "value": "≈ $12 per TB-month",
          "how": "approx."
        },
        {
          "label": "Archive",
          "value": "≈ $1 to $4 per TB-month",
          "how": "minutes to hours to get back, approx."
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "What do you give up for cheaper storage?",
      "choices": [
        "The safety of the stored data",
        "The ability to ever delete it",
        "How fast you get data back",
        "Nothing at all"
      ],
      "answer": 2,
      "why": "Cold and archive tiers cost less but take longer to read."
    },
    {
      "kind": "quiz",
      "q": "A law says keep invoices 7 years but nobody reads them. Which tier?",
      "choices": [
        "The hot tier, for quick reads",
        "Delete them after one year",
        "The archive tier, which is cheap",
        "A cache next to the servers"
      ],
      "answer": 2,
      "why": "You must keep them cheaply and rarely read them."
    },
    {
      "kind": "quiz",
      "q": "Who should decide when data moves down a tier?",
      "choices": [
        "Someone moving it by hand weekly",
        "Nobody, it should never move",
        "The newest engineer on the team",
        "A rule that goes by the age"
      ],
      "answer": 3,
      "why": "Lifecycle rules do it automatically."
    }
  ],
  "takeaway": "Match storage to how often data is read, and move it down as it ages."
};
