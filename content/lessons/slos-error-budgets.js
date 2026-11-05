// Original lesson data. Worked figures are approximations, not engine measurements.
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
      "kind": "read",
      "title": "A budget for decisions",
      "text": "For a 99.9% success SLO, the allowed bad fraction is 0.1%. At a steady 1,000 requests/s over 30 days, there are about 2.592 billion requests and a budget of 2.592 million bad requests. A request-based budget is not automatically 43.2 minutes of downtime: that equivalence assumes uniform traffic and total failure during those minutes. Use remaining budget to choose between feature work and reliability work. A shared policy might pause risky launches when budget is exhausted while still allowing repairs. Agree the policy with the people who own releases; a graph alone cannot make that decision."
    },
    {
      "kind": "read",
      "title": "Worked example: burn rate",
      "text": "Burn rate is observed bad fraction divided by allowed bad fraction. At 1.44% failures against a 99.9% target, burn is 14.4. One hour at that rate uses about 14.4/720 = 2% of a 30-day budget under steady traffic. An example fast page requires burn above 14.4 in both the last hour and the last five minutes. The long window establishes impact; the short window checks that it is still happening. A slower page might require burn above 6 in both six hours and thirty minutes. Six hours at burn 6 uses about 5% of the budget. These are starting policies with worked assumptions, not universal thresholds or a simulated alert evaluator."
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
      "q": "The last hour burned at 20 but the last five minutes burned at 0.2. Does the example fast AND policy page now?",
      "choices": [
        "Yes, the hour alone is enough",
        "No, the recent window says the fast failure is no longer active",
        "Only if CPU exceeds 90%"
      ],
      "answer": 1,
      "why": "Both windows must exceed 14.4. A long window alone can keep paging after recovery."
    },
    {
      "kind": "defend",
      "q": "Why is 99.99% not automatically the right target? Follow-up: product says every failure matters.",
      "checklist": [
        "Tie the SLI and target to user harm",
        "Estimate the tighter budget and operational cost",
        "Agree release policy and important cohorts"
      ],
      "model": "Every failure can matter without making every operation equally critical. Moving from 99.9% to 99.99% reduces the allowed bad fraction tenfold. I would identify the journeys where that cost is justified, separate critical cohorts, and estimate the redundancy and on-call work required. The target should lead to a funded decision policy. A promise the team cannot sustain encourages exclusions and noisy pages rather than better user outcomes."
    },
    {
      "kind": "read",
      "title": "Make a page worth answering",
      "text": "Combine each pair with AND, then combine fast and slow policies with OR. Deduplicate related pages and attach an owner, dashboard and runbook. Recovered short windows should stop paging even if a long window still contains an old incident. Low-traffic services need special handling: a handful of failures can produce unstable percentages, so consider minimum event counts, synthetic checks and user-impact judgement. Avoid hiding a critical small population in a global average; define important cohorts. Keep all eligible-request counters independent of biased trace sampling. Review pages that needed no action and incidents that produced no page. Alert fatigue is a design failure with a human cost."
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
      "why": "Divide 0.006 by the allowed fraction 0.001, keeping units consistent."
    },
    {
      "kind": "defend",
      "q": "Why use two windows instead of paging on every error spike? Follow-up: could that miss a short severe outage?",
      "checklist": [
        "Explain impact and recent confirmation",
        "Quantify budget use",
        "Add a justified fast path for severe user harm"
      ],
      "model": "A long window avoids paging on tiny blips, and a short window confirms the problem is current. At burn 14.4, an hour spends roughly 2% of a steady 30-day budget. A short total outage may deserve an independent synthetic or availability fast path if its user harm is high. I would test detection delay on real incident shapes, keep pages deduplicated and make every page lead to an action. Multi-window rules are a tool, not a reason to ignore severe brief failures."
    },
    {
      "kind": "quiz",
      "q": "A service has ten requests and one failure. What should an alert designer consider?",
      "choices": [
        "Small denominators and minimum-impact or synthetic checks",
        "Changing the failure to success",
        "Copying a high-volume threshold without review"
      ],
      "answer": 0,
      "why": "Ten percent is a large ratio but little evidence. Pair the statistic with actual user impact and detection needs."
    }
  ],
  "takeaway": "Choose a measurable user promise, then page when its budget is being spent fast enough to need action."
};
