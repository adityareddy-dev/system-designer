// Lesson data. Plain object; see CONTRACT.md section 11.2. All figures are rough real-world approximations.
export default {
  "id": "intro",
  "title": "Your first system",
  "track": "Start",
  "minutes": 3,
  "summary": "Build a tiny app in three minutes and keep it standing through a rush of visitors.",
  "steps": [
    {
      "kind": "script",
      "setup": {
        "palette": [
          "regional-lb",
          "cache",
          "vm-fleet"
        ],
        "requirements": {
          "peakRps": 3000,
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
          "homeRegion": "us"
        },
        "traffic": {
          "curve": "business-hours",
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
              "units": 1
            },
            {
              "ref": "db",
              "type": "sql-primary",
              "x": -120,
              "y": 0
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
        "events": [
          {
            "id": "viral-spike",
            "at": "14:00",
            "params": {
              "factor": 3
            }
          }
        ]
      },
      "beats": [
        {
          "at": 0,
          "caption": "Build the back end of an app, then see what holds under traffic. Each moving dot is a request from a person using your app."
        },
        {
          "at": 0,
          "caption": "It is early morning. One server handles about 1,000 requests a second (approx.). By midday about 3,000 a second will arrive.",
          "highlight": "vm-fleet"
        },
        {
          "at": 0,
          "caption": "Tap the servers to open their settings, then press + until you have 3 servers. The day waits for you.",
          "highlight": "vm-fleet",
          "waitFor": {
            "action": "knob",
            "knob": "units",
            "min": 3
          }
        },
        {
          "at": "after-previous",
          "caption": "Your app knows one address. A load balancer is a receptionist that hands each request to a free server.",
          "highlight": "regional-lb"
        },
        {
          "at": "after-previous",
          "caption": "Drag the load balancer onto the line between the phone and the servers.",
          "highlight": "regional-lb",
          "waitFor": {
            "action": "place",
            "type": "regional-lb",
            "path": ["users", "app"]
          }
        },
        {
          "at": "after-previous",
          "caption": "Most people ask for the same few things. A cache remembers recent answers, so the database is not asked again.",
          "highlight": "cache"
        },
        {
          "at": "after-previous",
          "caption": "Drag the cache onto the line between the servers and the database. A cache answer takes about 1 ms, a database about 5 ms (approx.).",
          "highlight": "cache",
          "waitFor": {
            "action": "place",
            "type": "cache",
            "path": ["app", "db"]
          }
        },
        {
          "at": "after-previous",
          "caption": "Spikes come without warning, and new servers take 2 to 4 minutes to start (approx.). Tap the servers and switch on Autoscale, so servers are added for you.",
          "highlight": "vm-fleet",
          "waitFor": {
            "action": "knob",
            "knob": "autoscale"
          }
        },
        {
          "at": "trigger:event-start",
          "waitCaption": "Traffic builds toward midday. Watch the meters at the bottom, or fast-forward.",
          "caption": "Viral spike! Traffic is 3 times normal. Watch the autoscaler add servers.",
          "highlight": "vm-fleet"
        },
        {
          "at": "trigger:day-end",
          "waitCaption": "The spike is passing. Fast-forward to the end of the day to see how you did.",
          "caption": "The day is over. Cost is shown as a monthly figure (approx.).",
          "captionOk": "Held through the spike: {pct} percent of requests succeeded. You just did system design. Tip: servers needed = peak requests a second divided by about 1,000 (approx.), plus spare room.",
          "captionBad": "{pct} percent of requests succeeded. The spike outran the servers for a while, because new ones take minutes to start. Real teams keep spare room for that."
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "What does a load balancer do?",
      "choices": [
        "Keeps copies of the latest answers",
        "Makes the database run faster",
        "Checks every user's password",
        "Spreads requests across the servers"
      ],
      "answer": 3,
      "why": "It spreads requests so no single server takes all the work."
    },
    {
      "kind": "quiz",
      "q": "What does a cache save?",
      "choices": [
        "The cost of running the servers",
        "Repeat trips to the database",
        "The time spent writing new code",
        "The load balancer's work"
      ],
      "answer": 1,
      "why": "It remembers recent answers, so the database is asked less often."
    },
    {
      "kind": "quiz",
      "q": "Why can a sudden spike still hurt even with autoscaling?",
      "choices": [
        "Servers can never be scaled up",
        "The database switches itself off",
        "New servers take minutes to start",
        "The load balancer forgets the servers"
      ],
      "answer": 2,
      "why": "Autoscaling reacts after load rises, and starting servers takes a few minutes."
    }
  ],
  "takeaway": "A system is a few boxes in a line, and design is deciding which boxes and how many. Count first: the first practice problem, a URL shortener at about 5,000 requests a second, needs about 6 servers, not 3 (approx.)."
};
