// Lesson data. Plain object; see CONTRACT.md section 11.2. All figures are rough real-world approximations.
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
      "kind": "read",
      "title": "Divide by a day, then by the peak",
      "text": "A day has about 86,400 seconds; call it 100,000. 200 million divided by 100,000 is 2,000 requests a second on average. Peak hour is often 3 times the average, so plan for about 6,000 a second."
    },
    {
      "kind": "demo",
      "prompt": "Peak is 9,000 requests a second. Size the servers so nothing fails.",
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
        "value": 0.99
      },
      "hint": "One server handles about 1,000 requests a second (approx.). 9,000 needs 9, so run about 12 to leave headroom."
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
  "takeaway": "Divide by 100,000 for a day, multiply by 3 for the peak, and leave headroom."
};
