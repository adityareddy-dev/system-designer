// Lesson text and interactive figure stages.
export default {
  "id": "back-of-envelope",
  "title": "Numbers you can do in your head",
  "track": "Start",
  "minutes": 3,
  "summary": "Turn monthly users into requests per second and servers needed, with a pencil.",
  "steps": [
    {
      "kind": "read",
      "title": "Start with people",
      "text": "Say 30 million people use your app a month and each visit makes 20 requests. Not everyone visits daily; a third do, so 10 million visitors a day. That is 200 million requests a day (all numbers approx.).",
      "icon": "ui.budget"
    },
    {
      "kind": "figure",
      "figure": "back-of-envelope",
      "view": "main",
      "title": "Divide by a day, then by the peak",
      "text": "Change the visitors, requests and peak. Follow the units from one day to one second before adding spare capacity."
    },
    {
      "kind": "demo",
      "prompt": "Peak is 9,000 requests a second. Serve it with at least 25% spare app capacity.",
      "setup": {
        "palette": [
          "vm-fleet"
        ],
        "requirements": {
          "peakRps": 9000,
          "mix": {
            "read": 1
          },
          "latencyP99Ms": {
            "default": 300
          },
          "availability": 0.99,
          "budgetPerMonth": 5000,
          "userRegions": {
            "us": 1
          },
          "homeRegion": "us"
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
              "type": "mobile-app",
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
              "ref": "db",
              "type": "kv-store",
              "x": -120,
              "y": 0,
              "units": 4
            }
          ],
          "edges": [
            [
              "users",
              "app"
            ],
            [
              "app",
              "db"
            ]
          ]
        },
        "events": []
      },
      "goal": {
        "holdSec": 60,
        "metric": "availability",
        "op": ">=",
        "value": 0.99,
        "maxUtil": 0.75
      },
      "hint": "One server handles about 1,000 requests a second (approx.). Divide the peak by that capacity, then leave at least 25% spare for a slow server or a small burst.",
      "estimate": "Peak is 9,000 requests/s. One app server has a measured ceiling of about 1,000 requests/s. Keep at least 25% of total app capacity spare. Record a first estimate before opening the workbench."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Seconds in a day",
          "value": "≈ 100,000",
          "how": "86,400, rounded for easy math"
        },
        {
          "label": "1 million requests a day at 2 KB each",
          "value": "≈ 2 GB a day",
          "how": "2 KB × 1,000,000"
        },
        {
          "label": "One server",
          "value": "≈ 1,000 requests a second",
          "how": "typical web API, approx."
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "About how many seconds are in a day, for quick math?",
      "choices": [
        "10,000",
        "100,000",
        "1,000,000",
        "10,000,000"
      ],
      "answer": 1,
      "why": "It is 86,400, and 100,000 is close enough to divide by in your head."
    },
    {
      "kind": "quiz",
      "q": "Average load is 2,000 requests a second. Peak is often about:",
      "choices": [
        "About the same as the average",
        "About half of the average",
        "About 3 times the average",
        "About 100 times the average"
      ],
      "answer": 2,
      "why": "Traffic bunches into busy hours; 2 to 4 times the average is common (approx.)."
    },
    {
      "kind": "quiz",
      "q": "One server handles 1,000 requests a second and you need 9,000. How many do you run?",
      "choices": [
        "Exactly 9",
        "About 5",
        "About 90",
        "About 12"
      ],
      "answer": 3,
      "why": "Leave headroom for spikes and for servers being replaced."
    }
  ],
  "takeaway": "Divide by 100,000 for a day, multiply by 3 for the peak, and leave headroom.",
  "transfer": {
    "kind": "transfer",
    "q": "A photo backup service receives only 200 uploads/s, but each upload is 8 MB. A relay accepts 10,000 requests/s and transfers 400 MB/s. Which quantity should set the fleet size first? Keep 25% of total relay capacity spare.",
    "choices": [
      "Requests per second at each relay",
      "The number of photos retained for a year",
      "Transferred megabytes per second"
    ],
    "answer": 2,
    "why": "The workload sends 1,600 MB/s, so the network is the binding limit. Request capacity alone would miss it. Retained photos size storage, not this relay fleet.",
    "calculation": "How many whole relays keep network use at or below 75%?",
    "value": 6,
    "unit": "relays",
    "tolerance": 0
  }
};
