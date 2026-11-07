// Lesson text and interactive figure stages.
export default {
  "id": "slos-error-budgets",
  "title": "SLOs and error budgets",
  "track": "Go deeper",
  "minutes": 7,
  "summary": "Turn a user promise into a budget and an actionable alert.",
  "steps": [
    {
      "kind": "read",
      "title": "The green dashboard nobody trusts",
      "text": "Servers are healthy, but one in fifty checkout attempts times out. CPU is green because requests are waiting on a dependency. Start with an SLI, a measured user outcome: the fraction of eligible checkout attempts that finish successfully within two seconds. An SLO is its target over a named window. Define which attempts count, where they are measured and which failures are excluded before choosing a percentage.",
      "icon": "el.alerting"
    },
    {
      "kind": "figure",
      "figure": "slos-error-budgets",
      "view": "burn",
      "title": "A budget for decisions",
      "text": "Change incident size and length, then inspect time. Compare the error budget consumed with paired fast and slow rolling-window alerts."
    },
    {
      "kind": "read",
      "title": "Worked example: burn rate",
      "text": "The fast policy requires high burn in both windows. A slower policy can use six hours and thirty minutes at burn above 6. Under steady traffic, six hours at burn 6 spends about 5% of a 30-day budget. These are starting policies under explicit assumptions, not universal thresholds. Measure the user outcome independently of trace sampling.",
      "diagram": {
        "label": "Two windows must agree",
        "parts": [
          [
            "Allowed failures: 0.1%",
            "A 99.9% SLO defines the denominator."
          ],
          [
            "Observed failures: 1.44%",
            "1.44 / 0.1 = 14.4 times burn. One hour spends about 2% of a steady 30-day budget."
          ],
          [
            "Page only while active",
            "Both the 1-hour and 5-minute windows must exceed the fast threshold."
          ]
        ]
      }
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Thirty-day requests",
          "value": "≈ 2.592 billion",
          "how": "1,000/s × 86,400 × 30"
        },
        {
          "label": "Allowed failures",
          "value": "≈ 2.592 million",
          "how": "Requests × 0.001"
        },
        {
          "label": "One-hour fast burn",
          "value": "≈ 2% of budget",
          "how": "14.4 × 1 hour ÷ 720 hours, steady traffic"
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "The fast alert requires burn above 14.4 in both windows. The hour shows 20 and five minutes shows 0.2. Does this rule fire?",
      "choices": [
        "Yes; the long window has already established budget impact",
        "No; its recent window is below the threshold",
        "Yes; averaging the two windows preserves the long-window breach"
      ],
      "answer": 1,
      "why": "The rule uses AND. A healthy recent window stops this fast alert after recovery; other alert policies are evaluated separately."
    },
    {
      "kind": "defend",
      "q": "Why is 99.99% not automatically the right target? Follow-up: product says every failure matters.",
      "checklist": [
        "Define an eligible user outcome and the harm of missing it",
        "Show that 99.99% permits one tenth the failures of 99.9%",
        "Assign reliability work and release policy to important user cohorts"
      ],
      "model": "Every failure can matter without making every operation equally critical. Moving from 99.9% to 99.99% reduces the allowed bad fraction tenfold. I would identify the journeys where that cost is justified, separate critical cohorts, and estimate the redundancy and on-call work required. The target should lead to a funded decision policy. A promise the team cannot sustain encourages exclusions and noisy pages rather than better user outcomes."
    },
    {
      "kind": "read",
      "title": "Make a page worth answering",
      "text": "Give each page an owner, dashboard and runbook. Low traffic can turn a handful of failures into unstable percentages; consider minimum event counts, synthetic checks and user impact. Define important cohorts so a global average cannot hide a critical small population. Review both pages requiring no action and incidents that produced no page. Alert fatigue has a human cost.",
      "diagram": {
        "label": "A useful page is a decision",
        "parts": [
          [
            "Long AND short",
            "A long window establishes impact. A short window checks it is still happening."
          ],
          [
            "Fast OR slow",
            "Either paired policy can page the owner. Deduplicate related incidents."
          ],
          [
            "Recovery stops paging",
            "The short window clears even while the long window still includes old failures."
          ]
        ]
      }
    },
    {
      "kind": "quiz",
      "q": "A 99.9% SLO sees 0.6% bad requests. What is its burn rate?",
      "choices": [
        "0.6",
        "60",
        "6"
      ],
      "answer": 2,
      "why": "0.006 ÷ 0.001 = 6. Use the allowed bad fraction, not the success target."
    },
    {
      "kind": "defend",
      "q": "Why use two windows instead of paging on every error spike? Follow-up: could that miss a short severe outage?",
      "checklist": [
        "Explain long-window impact and short-window confirmation",
        "Calculate budget use and fast-alert detection delay",
        "Define a separate fast path if severe harm requires it"
      ],
      "model": "A long window avoids paging on tiny blips, and a short window confirms the problem is current. At burn 14.4, an hour spends roughly 2% of a steady 30-day budget. At steady traffic, a 100% outage burns at 1,000, so it can push a previously healthy one-hour average above 14.4 in about 52 seconds. The rule does not wait a full hour to act. A shorter total outage may deserve an independent synthetic or availability fast path if its user harm is high. I would test detection delay on real incident shapes, keep pages deduplicated and make every page lead to an action. Multi-window rules are a tool, not a reason to ignore severe brief failures."
    },
    {
      "kind": "quiz",
      "q": "A low-traffic service has ten requests and one failure. Which alert design accounts for the small denominator?",
      "choices": [
        "Use user impact, event counts and independent synthetic checks",
        "Page on the same percentage-only threshold used for a million-request service",
        "Require a large minimum count for every alert, even a complete outage"
      ],
      "answer": 0,
      "why": "A ratio alone can be noisy. A blanket event minimum can also hide a severe low-volume outage."
    }
  ],
  "takeaway": "Choose a measurable user promise, then page when its budget is being spent fast enough to need action."
};
