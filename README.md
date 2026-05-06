# SystemCraft

> A distributed systems concept trainer. Real Docker infrastructure starts broken. You diagnose the failure through a Socratic loop powered by Claude Opus, apply a fix, and hit the next failure. The vehicle (URL shortener, Pastebin, etc.) doesn't matter — the concepts do.

**[UI Demo](https://agdeva8.github.io/systemcraft/systemcraft_demo.html)**

---

## The Core Loop

```
BOOT (pre-wired broken system)
  ↓
OBSERVE (live metrics turn red)
  ↓
TERMINAL DIAGNOSE (run pg_stat_activity, MONITOR, etc. in the terminal panel)
  ↓
CHAT HYPOTHESIS (articulate your diagnosis to the Socratic loop)
  ↓
CODE FIX (edit the broken config value in the code panel, hit Apply)
  ↓
TERMINAL VERIFY (re-run the same commands, see numbers improve)
  ↓
BREAK AGAIN (thundering herd, hot key, consumer lag)
  ↓
REPEAT
```

The diagram builds itself from your decisions. You don't design upfront — you react to failure. By the end you've built the architecture under pressure, which is how real systems get built.

---

## Two Entry Points

### Scenario-first
Start with a healthy system. Drag the traffic slider up, watch Postgres turn red, diagnose, fix, advance to the next failure.

```
/scenario/url_shortener  →  state0_baseline  →  state1_cache  →  state2_thundering_herd  →  state3_hotkey
```

### Concept-first
Pick any concept from the catalog. The app boots directly into the broken state, opens the KB article in the sidebar, and the Socratic loop starts immediately — no setup required.

```
Click "Thundering Herd"
  → boots url_shortener/state2_thundering_herd (already mid-failure)
  → KB article opens in sidebar
  → Socratic loop: concept_target = ttl-jitter
```

---

## Scenarios

| Scenario | Vehicle | Datastores | Key Concepts |
|---|---|---|---|
| `url_shortener` | URL Shortener | Postgres, Redis | Cache-aside, TTL jitter, thundering herd, hot key, L1 cache |
| `write_scaling` | Pastebin | Postgres, Redis, Cassandra | Async queues, write decoupling, backpressure, DLQ, LSM trees |
| `fan_out` | Twitter/Notifications | Postgres, Redis | Fan-out on write vs read, write amplification, eventual consistency |
| `rate_limiting` | API Gateway | Redis | Token bucket, sliding window, Redis atomic ops, distributed RL |
| `blob_store` | S3-like Storage | LocalStack, Postgres | Presigned URLs, multipart upload, CDN caching, origin protection |
| `stream_proc` | Analytics Pipeline | Kafka, Postgres | Partitions, consumer groups, at-least-once delivery, offset management |
| `search` | Job Board | Elasticsearch, Postgres | Inverted index, relevance scoring, index refresh lag, shard routing |
| `consistency` | Bank Transfer | Postgres | Two-phase commit, saga pattern, idempotency keys, distributed txns |

Each scenario has 3–4 progressive states. Each state = a different Docker Compose configuration, engineered to fail in a specific way.

---

## Failure Engineering

Failures are not discovered empirically — they are engineered. Work backwards from the desired failure mode to the exact resource constraints that produce it.

**Example — URL Shortener, State 0 (connection exhaustion):**

```yaml
postgres:
  environment:
    POSTGRES_MAX_CONNECTIONS: 100   # connection pool IS the bottleneck
  deploy:
    resources:
      limits:
        cpus: '0.8'    # enough CPU so CPU is NOT the bottleneck
        memory: 512M

app:
  environment:
    DB_POOL_SIZE: 95        # 96th concurrent request blocks
    DB_MAX_OVERFLOW: 0      # no burst connections
```

**Failure spec (verified after every infra change):**
```
state0_baseline at 3,000 req/s:
  ✓ db_connections_active > 90
  ✓ db_connections_waiting > 20
  ✓ latency_p99 > 500ms
  ✓ error_rate > 2%
  ✓ db_cpu < 90%   ← connections are bottleneck, NOT CPU

state1_cache at 3,000 req/s:
  ✓ redis_hit_ratio > 88%
  ✓ db_cpu < 20%
  ✓ latency_p99 < 15ms
  ✓ error_rate = 0%

state2_thundering_herd at t=4:00:
  ✓ db_cpu spikes > 70% at TTL expiry
  ✓ latency_p99 spikes > 400ms for ~30s
  ✓ recovers as cache rebuilds
```

---

## The Socratic Loop

`/diagnose` calls Claude Opus with a strict system prompt. Rules baked in:

- One question per response, never an explanation
- Max 3 sentences
- References specific metric values ("p99 at 847ms" not "latency is high")
- Hints point to internals windows, not answers
- Confirms concept correctly identified → signals next tier

> You are a senior engineer sitting next to the user, watching their system fail. You are curious, not condescending. You want them to feel the "oh, of course" moment themselves.

---

## Architecture

```
User (browser)
  │
  ├─ SSE stream ──────────────────────→ GET /session/{id}/metrics
  │                                      Prometheus scrapes Docker containers
  │                                      → JSON events every 2s
  │
  ├─ Chat message ────────────────────→ POST /session/{id}/diagnose
  │                                      + current_state + live metrics + history
  │                                      → Claude Opus (Socratic system prompt)
  │                                      ← question (never an explanation)
  │
  ├─ Traffic dial ────────────────────→ POST /session/{id}/traffic {virtual_users}
  │                                      → adjusts k6 VU count live
  │
  ├─ Terminal panel ──────────────────→ GET /session/{id}/terminal/{service}  (WebSocket)
  │                                      → docker exec into running container
  │                                      → xterm.js renders live shell
  │
  ├─ Apply config ────────────────────→ POST /session/{id}/config {key, value}
  │                                      → hot-reloads affected service
  │
  ├─ Cheatsheet ──────────────────────→ GET /session/{id}/cheatsheet/{service}
  │                                      → commands for current tab + state
  │
  └─ Apply fix (state transition) ────→ POST /session/{id}/state {state}
                                         → tears down old Compose project
                                         → boots new Compose project
                                         → metrics stream resumes
```

**Session isolation:** Each user = one Docker Compose project (`sc_{session_id}`). Namespace prevents port/volume collisions. Destroyed with `-v` on end or after 45-minute TTL.

---

## Concept Catalog

`knowledge-base/concept_catalog.json` maps every learnable concept to:
- The KB article that explains it
- The exact scenario + state that demonstrates it failing

**Concept groups:**
- **Caching:** cache-aside, thundering-herd, hot-key, cdn-caching
- **Databases:** connection-pool-exhaustion, b-tree-indexing, lsm-tree, read-replicas
- **Write Scaling:** async-queues, backpressure, fan-out-on-write
- **Rate Limiting:** token-bucket, sliding-window, distributed-rate-limiting
- **Storage:** presigned-urls, multipart-upload, cdn-caching
- **Stream Processing:** kafka-partitions, at-least-once-delivery, offset-management
- **Search:** inverted-index, relevance-scoring, index-refresh-lag
- **Consistency:** two-phase-commit, saga-pattern, idempotency-keys

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind + React Flow + Recharts |
| Terminal | xterm.js (tabbed shell per service, WebSocket-proxied) |
| Backend | FastAPI (Python 3.11) |
| Load | k6 synthetic traffic |
| Monitoring | Prometheus → SSE stream → frontend |
| LLM (tutor) | Claude Opus via Anthropic API |
| LLM (classifier) | Llama 3.1 8B local (~50ms intent detection) |
| Infra | Docker Compose (isolated project per session) |
| Datastores | Postgres 15, Redis 7, Kafka, Elasticsearch, Cassandra, LocalStack (S3) |

---

## Prerequisites

- Docker 24+ with Compose v2
- Python 3.11+
- Node 18+
- `ANTHROPIC_API_KEY` set in environment

## Quick Start

```bash
# Verify environment
docker --version && docker compose version && python --version && node --version

# Boot a scenario state
docker compose -p sc-dev \
  -f infra/scenarios/url_shortener/state0_baseline/docker-compose.yml \
  up -d --wait

# Backend
cd backend && pip install -r requirements.txt && uvicorn main:app --reload

# Frontend
cd frontend && npm install && npm run dev

# Run load test
k6 run infra/scenarios/url_shortener/state0_baseline/k6_script.js

# Tear down (always use -v to clear volumes)
docker compose -p sc-dev down -v
```

---

## Definition of Done

POC is complete when a user can:

**Scenario-first path:**
1. Open the app, see a healthy system at low traffic
2. Drag traffic slider to max, watch Postgres turn red
3. Type a diagnosis attempt, receive a Socratic question back
4. Click the Postgres node, see the real connection pool at 98/100
5. Open terminal → postgres tab, run `pg_stat_activity`, see 94 active connections
6. Open code panel, edit TTL to `random.randint(240, 360)`, click Apply
7. Re-run `TTL abc123` in Redis terminal, confirm staggered expiry
8. Watch metrics go green in real time
9. See the thundering herd hit at 4 minutes
10. Advance tier, receive tier badge
11. End with a scorecard showing which concepts were understood

**Concept-first path:**
12. Browse the concept catalog (e.g. click "Thundering Herd")
13. App boots directly into `url_shortener/state2_thundering_herd` — already mid-failure
14. KB article opens in sidebar explaining the concept
15. Socratic loop starts with `concept_target=ttl-jitter`
16. Diagnose via terminal, fix via code panel, verify in terminal
17. Fix, advance, scorecard records the concept as mastered