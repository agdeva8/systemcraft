# SystemCraft

Distributed systems trainer. Real Docker infrastructure starts broken. You diagnose the failure, apply a fix, hit the next one.

**[Live Demo for UI/UX with stubbed data](https://agdeva8.github.io/systemcraft/)** · [GitHub](https://github.com/agdeva8/systemcraft)

## Demo

[![SystemCraft POC — URL Shortener Demo](https://img.youtube.com/vi/ny-z9ZQ9l4s/maxresdefault.jpg)](https://youtu.be/ny-z9ZQ9l4s)

*POC demo: connection pool exhaustion (state0) → Redis cache layer (state1), 96% hit ratio*

---

## Quick Start

**Prerequisites:** Docker 24+ (Compose v2), Python 3.11+, Node 18+, k6, `ANTHROPIC_API_KEY`

```bash
# 1. Backend
cd backend && pip install -r requirements.txt
uvicorn main:app --reload

# 2. Frontend (new terminal)
cd systemcraftUI && npm install && npm run dev

# 3. Open http://localhost:3000
```

## How it works

```
BOOT  →  OBSERVE (metrics turn red)  →  TERMINAL DIAGNOSE  →  CHAT HYPOTHESIS
  ↑                                                                      ↓
REPEAT  ←  BREAK AGAIN  ←  TERMINAL VERIFY  ←  CODE FIX (Apply)
```

1. Drag the traffic slider — watch the system fail
2. Click a node in the architecture diagram to see internals (connection pool, keyspace, partition lag)
3. Open the terminal panel — run real commands (`pg_stat_activity`, `redis-cli monitor`, etc.)
4. Open the code panel — edit the actual app code, click Apply, service hot-reloads
5. Chat your hypothesis — Claude asks a Socratic question back, never explains
6. Fix the failure → advance to the next state → earn the tier badge

---

## Two entry points

**Scenario-first** — start healthy, break it yourself  
`/scenario/url_shortener` → baseline → cache → thundering herd → hot key

**Concept-first** — jump straight to any concept mid-failure  
`/concept/thundering-herd` → boots directly into broken state, KB article opens in sidebar

---

## Scenarios

| Scenario | Vehicle | Key Concepts |
|---|---|---|
| `url_shortener` | URL Shortener | Cache-aside, TTL jitter, thundering herd, hot key |
| `write_scaling` | Pastebin | Async queues, backpressure, DLQ, LSM trees |
| `fan_out` | Twitter/Notifications | Fan-out on write vs read, write amplification |
| `rate_limiting` | API Gateway | Token bucket, sliding window, distributed RL |
| `blob_store` | S3-like Storage | Presigned URLs, multipart upload, CDN caching |
| `stream_proc` | Analytics Pipeline | Kafka partitions, consumer groups, at-least-once |
| `search` | Job Board | Inverted index, relevance scoring, index refresh lag |
| `consistency` | Bank Transfer | Two-phase commit, saga pattern, idempotency keys |

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + Tailwind + React Flow + Recharts |
| Terminal | xterm.js (tabbed shell per service, WebSocket-proxied) |
| Backend | FastAPI (Python 3.11) |
| Load | k6 synthetic traffic |
| Monitoring | Prometheus → SSE stream → frontend |
| LLM (tutor) | Claude Opus via Anthropic API |
| Infra | Docker Compose (isolated project per session) |
| Datastores | Postgres 15, Redis 7, Kafka, Elasticsearch, Cassandra, LocalStack |

---

## Project layout

```
backend/          FastAPI — session management, metrics stream, terminal proxy
systemcraftUI/    React frontend — diagram, terminals, code editor, chat
infra/scenarios/  Docker Compose states per scenario + k6 load scripts
knowledge-base/   72 concept articles (markdown in md/ subdirectory)
llm/              Socratic system prompt
```

## Infra commands

```bash
# Boot a scenario state
docker compose -p sc-dev \
  -f infra/scenarios/url_shortener/state0_baseline/docker-compose.yml \
  up -d --wait

# Run load test
k6 run infra/scenarios/url_shortener/state0_baseline/k6_script.js

# Tear down (always -v to clear volumes)
docker compose -p sc-dev down -v
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
