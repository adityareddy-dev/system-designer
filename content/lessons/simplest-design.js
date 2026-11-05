// Original lesson data. Worked figures are approximations, not engine measurements.
export default {
  "id": "simplest-design",
  "title": "The simplest thing that works",
  "track": "Lead the design",
  "minutes": 7,
  "summary": "Include people, failure recovery and future triggers in the cost of a design.",
  "steps": [
    {
      "kind": "read",
      "title": "Six services for a quiet product",
      "text": "A team with four engineers proposes six services and a sharded database for a product serving 200 requests/s. Each service needs deployment, dashboards, contracts and someone to answer its pages. The diagram scales on paper, but the team is now the scarce resource. Simplicity means the fewest moving parts that meet the actual requirements, with a path to change.",
      "icon": "ui.budget"
    },
    {
      "kind": "read",
      "title": "Put build and buy on the same horizon",
      "text": "Compare three-year total cost, including engineering, infrastructure, support, upgrades, incidents, compliance work, egress and migration out. List which costs are assumptions. A managed service can charge more per unit and still save months of work. Building can win when control, unusual scale, residency or product differentiation justifies ownership. Check contracts, exit formats and operating limits before deciding. A modular service with a clear internal boundary may preserve future choices without a network boundary today. Do not shard just because the data may grow; measure write headroom, index size, maintenance time and recovery time first."
    },
    {
      "kind": "read",
      "title": "Worked example: three years",
      "text": "Assume loaded engineering cost of $180,000 per engineer-year. Building a specialized queue needs 0.5 engineer for year one and 0.2 for each of years two and three: 0.9 engineer-years, or $162,000. Add $2,000/month infrastructure for 36 months: $72,000. Total is about $234,000. Buying at $4,000/month costs $144,000. Add 0.1 engineer-year integration and 0.05/year operations for three years: $45,000, total $189,000. Buying is about $45,000 cheaper under these assumptions. A 50% vendor price rise would add $72,000 and reverse the result unless other costs change. This is a sensitivity exercise, not catalog pricing."
    },
    {
      "kind": "numbers",
      "rows": [
        {
          "label": "Build total",
          "value": "≈ $234,000 / 3 years",
          "how": "$162,000 people + $72,000 infrastructure"
        },
        {
          "label": "Buy total",
          "value": "≈ $189,000 / 3 years",
          "how": "$144,000 service + $45,000 people"
        },
        {
          "label": "Price sensitivity",
          "value": "≈ $72,000 extra",
          "how": "50% of $4,000/month × 36 months"
        }
      ]
    },
    {
      "kind": "quiz",
      "q": "The managed service costs twice the raw VMs. What comparison is missing?",
      "choices": [
        "Only the size of the logo",
        "Three-year total ownership cost and the requirements each option meets",
        "The number of API endpoints alone"
      ],
      "answer": 1,
      "why": "Staff time, upgrades, recovery and an exit plan can dominate raw VM cost."
    },
    {
      "kind": "defend",
      "q": "Your design seems too simple for year two. Follow-up: traffic grows tenfold.",
      "checklist": [
        "Show measured present capacity and growth sensitivity",
        "Define triggers and a credible migration path",
        "Keep correctness and recovery in the initial scope"
      ],
      "model": "I would show today's tested capacity, the tenfold case and where the first ceiling lies. At 200 requests/s, tenfold traffic is 2,000/s, which may still fit one well-indexed store depending on the write mix. I would avoid promising that without a benchmark. Stable keys, modular boundaries and exportable data leave room for a later split. I would fund the migration before measured headroom or recovery time crosses its trigger, while retaining backups and correctness from day one."
    },
    {
      "kind": "read",
      "title": "A plan with triggers",
      "text": "Month one: one deployable service, a transactional store, backups with a restore test, and basic user-outcome monitoring. Month six: add a cache or background queue only if measured latency or workload justifies it; keep the invariant in one place. Year two: split ownership or shard when an observed ceiling, team boundary or recovery target demands it. Set triggers such as sustained write utilization above a tested safe level or restore time exceeding the recovery objective. Keep identifiers, APIs and export paths ready for change. Simpler is not an excuse to omit durability, authorization or a viable rollback. The minimum design must still satisfy every binding requirement."
    },
    {
      "kind": "quiz",
      "q": "One store meets tested peak and recovery targets. What is a good sharding trigger?",
      "choices": [
        "The diagram looks small",
        "Another team uses shards",
        "Measured headroom or recovery time crosses an agreed threshold"
      ],
      "answer": 2,
      "why": "A real ceiling justifies migration work; anticipated prestige does not."
    },
    {
      "kind": "defend",
      "q": "Buying is cheaper in your table. Why might we still build? Follow-up: who owns it after launch?",
      "checklist": [
        "Name a requirement that changes the cost decision",
        "Include an accountable operating team",
        "Recalculate risk and exit cost"
      ],
      "model": "A hard residency rule, a missing guarantee or a core differentiating feature could rule out that vendor. I would make the requirement explicit and revise the comparison, including the cost of meeting it ourselves. A named team needs capacity for upgrades, incidents and succession after the original authors leave. If we cannot staff that ownership, a more expensive supported option or a narrower product may be the responsible decision."
    },
    {
      "kind": "quiz",
      "q": "A single service is simple but has no restore test. Is it sufficient?",
      "choices": [
        "No, simplicity still has to meet durability and recovery requirements",
        "Yes, fewer services eliminate data loss",
        "Yes, backups never need verification"
      ],
      "answer": 0,
      "why": "A minimal design must satisfy its promises, including restoration after failure."
    }
  ],
  "takeaway": "Choose the smallest design that meets the promise, and attach measured triggers to future complexity."
};
