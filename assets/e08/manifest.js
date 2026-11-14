// Geometry and colours copied from the selected e08 set.
export const categories = {
  "clients": {
    "c": "#38bdf8",
    "shape": "circle",
    "name": "Clients"
  },
  "edge": {
    "c": "#a78bfa",
    "shape": "hex",
    "name": "Edge and network"
  },
  "compute": {
    "c": "#fbbf24",
    "shape": "rrect",
    "name": "Compute"
  },
  "data": {
    "c": "#4ade80",
    "shape": "cyl",
    "name": "Data stores"
  },
  "messaging": {
    "c": "#fb7185",
    "shape": "pill",
    "name": "Messaging and streaming"
  },
  "platform": {
    "c": "#2dd4bf",
    "shape": "shield",
    "name": "Platform and security"
  },
  "ops": {
    "c": "#b4c2d6",
    "shape": "dash",
    "name": "Operations"
  },
  "ai": {
    "c": "#e879f9",
    "shape": "dbl",
    "name": "AI and data"
  },
  "external": {
    "c": "#fb923c",
    "shape": "oct",
    "name": "External services"
  }
};
export const parts = [
  {
    "id": "web-browser",
    "name": "Web browser",
    "category": "clients",
    "glyph": "screen"
  },
  {
    "id": "mobile-app",
    "name": "Mobile app",
    "category": "clients",
    "glyph": "phone"
  },
  {
    "id": "tv-app",
    "name": "TV and console app",
    "category": "clients",
    "glyph": "tv"
  },
  {
    "id": "game-client",
    "name": "Game client",
    "category": "clients",
    "glyph": "gamepad"
  },
  {
    "id": "iot-device",
    "name": "IoT devices",
    "category": "clients",
    "glyph": "sensor"
  },
  {
    "id": "partner-system",
    "name": "Partner system",
    "category": "clients",
    "glyph": "link"
  },
  {
    "id": "admin-console",
    "name": "Admin console",
    "category": "clients",
    "glyph": "cog"
  },
  {
    "id": "dns",
    "name": "DNS",
    "category": "edge",
    "glyph": "book"
  },
  {
    "id": "geo-dns",
    "name": "GeoDNS",
    "category": "edge",
    "glyph": "pin"
  },
  {
    "id": "cdn",
    "name": "CDN",
    "category": "edge",
    "glyph": "cloud"
  },
  {
    "id": "origin-shield",
    "name": "Origin shield",
    "category": "edge",
    "glyph": "nest"
  },
  {
    "id": "waf",
    "name": "Web firewall (WAF)",
    "category": "edge",
    "glyph": "eye"
  },
  {
    "id": "firewall",
    "name": "Network firewall",
    "category": "edge",
    "glyph": "wall"
  },
  {
    "id": "ddos-shield",
    "name": "DDoS shield",
    "category": "edge",
    "glyph": "umbrella"
  },
  {
    "id": "api-gateway",
    "name": "API gateway",
    "category": "edge",
    "glyph": "route"
  },
  {
    "id": "global-lb",
    "name": "Global load balancer",
    "category": "edge",
    "glyph": "flow"
  },
  {
    "id": "regional-lb",
    "name": "Load balancer",
    "category": "edge",
    "glyph": "split"
  },
  {
    "id": "network-lb",
    "name": "Network load balancer",
    "category": "edge",
    "glyph": "fast"
  },
  {
    "id": "service-mesh",
    "name": "Service mesh",
    "category": "edge",
    "glyph": "mesh"
  },
  {
    "id": "private-link",
    "name": "VPN or private link",
    "category": "edge",
    "glyph": "tunnel"
  },
  {
    "id": "vm-fleet",
    "name": "App servers (VMs)",
    "category": "compute",
    "glyph": "server"
  },
  {
    "id": "container-cluster",
    "name": "Containers",
    "category": "compute",
    "glyph": "box"
  },
  {
    "id": "serverless-fn",
    "name": "Serverless functions",
    "category": "compute",
    "glyph": "lambda"
  },
  {
    "id": "edge-fn",
    "name": "Edge functions",
    "category": "compute",
    "glyph": "code"
  },
  {
    "id": "gpu-cluster",
    "name": "GPU servers",
    "category": "compute",
    "glyph": "gpu"
  },
  {
    "id": "worker-pool",
    "name": "Background workers",
    "category": "compute",
    "glyph": "gear"
  },
  {
    "id": "batch-cluster",
    "name": "Batch cluster",
    "category": "compute",
    "glyph": "list"
  },
  {
    "id": "cron-scheduler",
    "name": "Scheduler",
    "category": "compute",
    "glyph": "clock"
  },
  {
    "id": "autoscaler",
    "name": "Autoscaler",
    "category": "compute",
    "glyph": "expand"
  },
  {
    "id": "sql-primary",
    "name": "SQL database",
    "category": "data",
    "glyph": "db"
  },
  {
    "id": "sql-replica",
    "name": "Read replica",
    "category": "data",
    "glyph": "mirror"
  },
  {
    "id": "sharded-sql",
    "name": "Sharded SQL",
    "category": "data",
    "glyph": "shards"
  },
  {
    "id": "distributed-sql",
    "name": "Distributed SQL",
    "category": "data",
    "glyph": "layers"
  },
  {
    "id": "kv-store",
    "name": "Key-value store",
    "category": "data",
    "glyph": "tag"
  },
  {
    "id": "document-db",
    "name": "Document database",
    "category": "data",
    "glyph": "doc"
  },
  {
    "id": "wide-column",
    "name": "Wide-column store",
    "category": "data",
    "glyph": "columns"
  },
  {
    "id": "graph-db",
    "name": "Graph database",
    "category": "data",
    "glyph": "web"
  },
  {
    "id": "timeseries-db",
    "name": "Time-series database",
    "category": "data",
    "glyph": "series"
  },
  {
    "id": "search-index",
    "name": "Search index",
    "category": "data",
    "glyph": "search"
  },
  {
    "id": "vector-db",
    "name": "Vector database",
    "category": "data",
    "glyph": "vector"
  },
  {
    "id": "cache",
    "name": "Cache",
    "category": "data",
    "glyph": "bolt"
  },
  {
    "id": "distributed-cache",
    "name": "Distributed cache",
    "category": "data",
    "glyph": "hash"
  },
  {
    "id": "object-storage",
    "name": "Object storage",
    "category": "data",
    "glyph": "bucket"
  },
  {
    "id": "block-storage",
    "name": "Block storage",
    "category": "data",
    "glyph": "disk"
  },
  {
    "id": "file-system",
    "name": "Shared file system",
    "category": "data",
    "glyph": "folder"
  },
  {
    "id": "data-warehouse",
    "name": "Data warehouse",
    "category": "data",
    "glyph": "house"
  },
  {
    "id": "data-lake",
    "name": "Data lake",
    "category": "data",
    "glyph": "lake"
  },
  {
    "id": "ledger-db",
    "name": "Ledger",
    "category": "data",
    "glyph": "ledger"
  },
  {
    "id": "db-proxy",
    "name": "Connection pooler",
    "category": "data",
    "glyph": "funnel"
  },
  {
    "id": "cold-archive",
    "name": "Cold archive",
    "category": "data",
    "glyph": "snow"
  },
  {
    "id": "queue",
    "name": "Queue",
    "category": "messaging",
    "glyph": "queue"
  },
  {
    "id": "pubsub",
    "name": "Pub/sub topic",
    "category": "messaging",
    "glyph": "fanout"
  },
  {
    "id": "event-stream",
    "name": "Event stream",
    "category": "messaging",
    "glyph": "stream"
  },
  {
    "id": "stream-processor",
    "name": "Stream processor",
    "category": "messaging",
    "glyph": "window"
  },
  {
    "id": "dead-letter-queue",
    "name": "Dead-letter queue",
    "category": "messaging",
    "glyph": "trash"
  },
  {
    "id": "outbox",
    "name": "Transactional outbox",
    "category": "messaging",
    "glyph": "tray"
  },
  {
    "id": "workflow-engine",
    "name": "Workflow engine",
    "category": "messaging",
    "glyph": "steps"
  },
  {
    "id": "websocket-gateway",
    "name": "Live connection gateway",
    "category": "messaging",
    "glyph": "wifi"
  },
  {
    "id": "cdc-connector",
    "name": "Change data capture",
    "category": "messaging",
    "glyph": "sync"
  },
  {
    "id": "identity-provider",
    "name": "Identity provider",
    "category": "platform",
    "glyph": "user"
  },
  {
    "id": "secrets-manager",
    "name": "Secrets manager",
    "category": "platform",
    "glyph": "key"
  },
  {
    "id": "kms",
    "name": "Key management",
    "category": "platform",
    "glyph": "lock"
  },
  {
    "id": "hsm",
    "name": "Hardware security module",
    "category": "platform",
    "glyph": "cpu"
  },
  {
    "id": "rate-limiter",
    "name": "Rate limiter",
    "category": "platform",
    "glyph": "gauge"
  },
  {
    "id": "circuit-breaker",
    "name": "Circuit breaker",
    "category": "platform",
    "glyph": "switch"
  },
  {
    "id": "idempotency-store",
    "name": "Idempotency keys",
    "category": "platform",
    "glyph": "check"
  },
  {
    "id": "feature-flags",
    "name": "Feature flags",
    "category": "platform",
    "glyph": "flag"
  },
  {
    "id": "config-service",
    "name": "Config service",
    "category": "platform",
    "glyph": "sliders"
  },
  {
    "id": "coordination-service",
    "name": "Coordination service",
    "category": "platform",
    "glyph": "ring"
  },
  {
    "id": "audit-log",
    "name": "Audit log",
    "category": "platform",
    "glyph": "clipboard"
  },
  {
    "id": "privacy-vault",
    "name": "Privacy vault",
    "category": "platform",
    "glyph": "vault"
  },
  {
    "id": "consent-service",
    "name": "Consent service",
    "category": "platform",
    "glyph": "pen"
  },
  {
    "id": "metrics",
    "name": "Metrics",
    "category": "ops",
    "glyph": "chart"
  },
  {
    "id": "logs",
    "name": "Logs",
    "category": "ops",
    "glyph": "terminal"
  },
  {
    "id": "traces",
    "name": "Traces",
    "category": "ops",
    "glyph": "trace"
  },
  {
    "id": "alerting",
    "name": "Alerting",
    "category": "ops",
    "glyph": "alert"
  },
  {
    "id": "dashboards",
    "name": "Dashboards",
    "category": "ops",
    "glyph": "pulse"
  },
  {
    "id": "pager",
    "name": "On-call pager",
    "category": "ops",
    "glyph": "pager"
  },
  {
    "id": "ci-cd",
    "name": "CI/CD pipeline",
    "category": "ops",
    "glyph": "play"
  },
  {
    "id": "backups",
    "name": "Backups",
    "category": "ops",
    "glyph": "copy"
  },
  {
    "id": "disaster-recovery",
    "name": "Disaster recovery",
    "category": "ops",
    "glyph": "globe"
  },
  {
    "id": "synthetic-probe",
    "name": "Synthetic checks",
    "category": "ops",
    "glyph": "robot"
  },
  {
    "id": "model-server",
    "name": "Model server",
    "category": "ai",
    "glyph": "brain"
  },
  {
    "id": "llm-gateway",
    "name": "AI gateway",
    "category": "ai",
    "glyph": "sparkle"
  },
  {
    "id": "semantic-cache",
    "name": "Semantic cache",
    "category": "ai",
    "glyph": "undo"
  },
  {
    "id": "safety-filter",
    "name": "Safety filter",
    "category": "ai",
    "glyph": "shield"
  },
  {
    "id": "feature-store",
    "name": "Feature store",
    "category": "ai",
    "glyph": "flask"
  },
  {
    "id": "embedding-service",
    "name": "Embedding service",
    "category": "ai",
    "glyph": "embed"
  },
  {
    "id": "recommender",
    "name": "Recommendation engine",
    "category": "ai",
    "glyph": "tree"
  },
  {
    "id": "etl-pipeline",
    "name": "Data pipeline (ETL)",
    "category": "ai",
    "glyph": "pipe"
  },
  {
    "id": "payment-processor",
    "name": "Payment processor",
    "category": "external",
    "glyph": "card"
  },
  {
    "id": "email-provider",
    "name": "Email provider",
    "category": "external",
    "glyph": "mail"
  },
  {
    "id": "sms-provider",
    "name": "SMS provider",
    "category": "external",
    "glyph": "phone2"
  },
  {
    "id": "push-service",
    "name": "Push notifications",
    "category": "external",
    "glyph": "bell"
  },
  {
    "id": "maps-api",
    "name": "Maps API",
    "category": "external",
    "glyph": "map"
  },
  {
    "id": "video-transcoder",
    "name": "Video transcoder",
    "category": "external",
    "glyph": "film"
  },
  {
    "id": "identity-verification",
    "name": "ID verification",
    "category": "external",
    "glyph": "badge"
  },
  {
    "id": "hosted-llm-api",
    "name": "Hosted AI model",
    "category": "external",
    "glyph": "chat"
  },
  {
    "id": "third-party-api",
    "name": "Third-party API",
    "category": "external",
    "glyph": "plug"
  }
];
export const traffic = [
  {
    "id": "read",
    "family": "read",
    "color": "#38bdf8"
  },
  {
    "id": "search",
    "family": "read",
    "color": "#7dd3fc"
  },
  {
    "id": "report",
    "family": "read",
    "color": "#0284c7"
  },
  {
    "id": "write",
    "family": "write",
    "color": "#4ade80"
  },
  {
    "id": "sync",
    "family": "write",
    "color": "#a3e635"
  },
  {
    "id": "upload",
    "family": "media",
    "color": "#f472b6"
  },
  {
    "id": "stream",
    "family": "media",
    "color": "#f9a8d4"
  },
  {
    "id": "live",
    "family": "media",
    "color": "#fb7185"
  },
  {
    "id": "payment",
    "family": "trust",
    "color": "#facc15"
  },
  {
    "id": "login",
    "family": "trust",
    "color": "#fde047"
  },
  {
    "id": "inference",
    "family": "ai",
    "color": "#e879f9"
  },
  {
    "id": "message",
    "family": "realtime",
    "color": "#2dd4bf"
  },
  {
    "id": "location",
    "family": "realtime",
    "color": "#5eead4"
  },
  {
    "id": "notify",
    "family": "realtime",
    "color": "#99f6e4"
  },
  {
    "id": "telemetry",
    "family": "background",
    "color": "#94a3b8"
  },
  {
    "id": "event",
    "family": "background",
    "color": "#cbd5e1"
  },
  {
    "id": "batch",
    "family": "background",
    "color": "#64748b"
  },
  {
    "id": "webhook",
    "family": "background",
    "color": "#a8a29e"
  },
  {
    "id": "attack",
    "family": "attack",
    "color": "#ef4444"
  }
];
