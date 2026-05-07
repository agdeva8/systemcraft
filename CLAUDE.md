# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

SystemCraft is a distributed systems concept trainer. Real Docker infrastructure starts broken. Users diagnose failure through a Socratic loop (Claude Opus), apply a fix, and hit the next failure. The vehicle (URL shortener, Pastebin, etc.) doesn't matter — the concepts do.

**POC scope:** All 8 scenarios, full concept catalog. No code exists yet. Build from this file and `systemcraft_plan.md`.

## Tech Stack

```
Frontend:    Next.js 14 (App Router) + Tailwind + React Flow + Recharts + xterm.js
Backend:     FastAPI (Python 3.11)
Load:        k6 (synthetic traffic)
Monitoring:  Prometheus → SSE stream → frontend
LLM:         Claude Opus (ANTHROPIC_API_KEY) + Llama 3.1 8B local (intent classifier, ~50ms)
Containers:  Docker Compose (one isolated project per session)
```

**Datastores (all Docker, resource-constrained to engineer specific failure modes):**

| Datastore        | Scenarios                                              |
|------------------|--------------------------------------------------------|
| Postgres 15      | URL Shortener, Pastebin, Bank Transfer, Job Board      |
| Redis 7          | URL Shortener, Rate Limiting, Fan-out, Pastebin        |
| Kafka            | Analytics Pipeline (Stream Processing)                 |
| Elasticsearch    | Job Board (Search)                                     |
| Cassandra        | Pastebin / Write Scaling (LSM, memtable flush)         |
| LocalStack (S3)  | Blob Store (Storage at Scale)                          |

## Knowledge Base

72 HTML files from hellointerview copied to `knowledge-base/`. Structure:

```
knowledge-base/
  core-concepts/     caching, db-indexing, sharding, cap-theorem, consistent-hashing, ...
  md/                ← 66 clean markdown files — read these, not the HTML
    core-concepts/   caching.md, db-indexing.md, sharding.md, cap-theorem.md, ...
    deep-dives/      redis.md, kafka.md, cassandra.md, elasticsearch.md, postgres.md, ...
    patterns/        scaling-reads.md, scaling-writes.md, dealing-with-contention.md, ...
    problem-breakdowns/ bitly.md, distributed-rate-limiter.md, fb-news-feed.md, ...
  core-concepts/     original HTML (browser KB sidebar rendering only)
  deep-dives/
  patterns/
  problem-breakdowns/
  concept_catalog.json   ← concept slug → {kb_file, anchor, scenario, state, tier}
```

**Reading KB content** (informing Socratic prompts, understanding concepts): always use `knowledge-base/md/`. Clean markdown, no boilerplate, LLM-friendly.  
**Serving KB sidebar in-app**: serve markdown files from `knowledge-base/md/`. UI renders markdown directly — HTML files not used.

`concept_catalog.json` is the routing table for concept-first navigation. Every learnable concept maps to: the KB article that explains it + the exact scenario+state that demonstrates it failing.

### Concept-First Navigation

User does NOT have to start at Scenario → Tier 1 → Tier 2. They can jump directly to any concept:

```
User picks "Thundering Herd"
  → frontend reads concept_catalog.json
  → finds: scenario=url_shortener, state=state2_thundering_herd
  → POST /session/create {scenario, boot_state}
  → system boots directly into that broken state
  → KB article (caching.html#thundering-herd) opens in sidebar
  → Socratic loop starts with concept_target="ttl-jitter"
```

Frontend entry point: `/concept/[slug]` route reads `concept_catalog.json`, creates session at the mapped state, renders simulator + KB sidebar side-by-side.

Backend change needed: `POST /session/create` must accept optional `boot_state` param (not always `state0_baseline`).

**Concept groups for UI browsing:**
- Caching: cache-aside, thundering-herd, hot-key, cdn-caching
- Databases: connection-pool-exhaustion, b-tree-indexing, lsm-tree, read-replicas
- Write Scaling: async-queues, backpressure, fan-out-on-write
- Rate Limiting: token-bucket, sliding-window, distributed-rate-limiting
- Storage: presigned-urls, multipart-upload, cdn-caching
- Stream Processing: kafka-partitions, at-least-once-delivery, offset-management
- Search: inverted-index, relevance-scoring, index-refresh-lag
- Consistency: two-phase-commit, saga-pattern, idempotency-keys

## Scenario Catalog

All 8 scenarios. Each scenario = isolated Docker Compose states in `infra/scenarios/{scenario}/`.

| Scenario         | Vehicle              | Key Datastores              | Concepts                                                      |
|------------------|----------------------|-----------------------------|---------------------------------------------------------------|
| `url_shortener`  | URL Shortener        | Postgres, Redis             | Cache-aside, TTL jitter, thundering herd, hot key, L1 cache   |
| `write_scaling`  | Pastebin             | Postgres, Redis, Cassandra  | Async queues, write decoupling, backpressure, DLQ, LSM trees  |
| `fan_out`        | Twitter/Notif.       | Postgres, Redis             | Fan-out on write vs read, write amplification, eventual cons. |
| `rate_limiting`  | API Gateway          | Redis                       | Token bucket, sliding window, Redis atomic ops, distributed RL|
| `blob_store`     | S3-like              | LocalStack, Postgres        | Presigned URLs, multipart upload, CDN caching, origin protect.|
| `stream_proc`    | Analytics Pipeline   | Kafka, Postgres             | Partitions, consumer groups, at-least-once, offset management |
| `search`         | Job Board            | Elasticsearch, Postgres     | Inverted index, relevance scoring, index lag, shard routing   |
| `consistency`    | Bank Transfer        | Postgres                    | Two-phase commit, saga pattern, idempotency keys, dist. txns  |

**Internals windows per datastore:**
- Postgres: connection pool fill, `pg_stat_activity` queue, index hit rate
- Redis: live keyspace + TTL countdown, hit ratio, commands/sec, memory
- Cassandra: commit log → memtable → SSTable pipeline, compaction I/O spike
- Kafka: partition lag per consumer group, offset position, throughput/sec
- Elasticsearch: index refresh lag, shard assignment, query explain

## Build Order

Follow this sequence exactly — do not skip or reorder.

1. **Verify environment** — Docker 24+, Compose v2, Python 3.11+, Node 18+, `$ANTHROPIC_API_KEY` set
2. **Write `contract.json`** — API contract in `systemcraft_plan.md`. Write first, never changes. Every component depends on it. Add one field: `POST /session/create` body gets optional `boot_state` (defaults to `state0_baseline`) so concept-first navigation can boot into any state directly.
3. **Infra — `url_shortener`** — 4 Docker Compose states (baseline → cache → thundering herd → hot key), k6 scripts, `postgres/init.sql` (10M rows), Prometheus config. Verify failure specs before continuing.
4. **Backend core** — `main.py`, `session_manager.py`, `metrics_stream.py`, `terminal_manager.py`, internals parsers for Postgres + Redis. All endpoints from contract.json.
5. **Frontend** — Next.js scaffold. Two entry points:
   - `/concept/[slug]` — reads `knowledge-base/concept_catalog.json`, creates session at mapped state, renders simulator + KB article sidebar side-by-side
   - `/scenario/[name]` — traditional scenario flow, starts at `state0_baseline`
   Build components static-first then wire to API/SSE. Key new components: `TerminalPanel.tsx` (xterm.js tabbed terminal per service), `CodePanel.tsx` (full-file Monaco editor with `# TODO:` signpost comments injected at fix locations — user navigates real code, not cropped snippets), `Cheatsheet.tsx` (context-aware command list). `url_shortener` fully playable end-to-end via both entry points.
6. **Socratic prompt** — `llm/socratic_system_prompt.txt`, test 20+ inputs, tune until asking questions only.
7. **Infra — remaining 7 scenarios** — one scenario at a time, each with Docker Compose states + k6 scripts + failure specs:
   - `write_scaling`: Postgres + Cassandra + Redis queue
   - `fan_out`: Postgres + Redis (fan-out write pattern)
   - `rate_limiting`: Redis only (token bucket, sliding window atomic ops)
   - `blob_store`: LocalStack + Postgres
   - `stream_proc`: Kafka + Postgres
   - `search`: Elasticsearch + Postgres
   - `consistency`: Postgres (2PC/saga)
8. **Extend backend** — add internals parsers: `cassandra_parser.py`, `kafka_parser.py`, `elasticsearch_parser.py`. Extend `/internals/{datastore}` endpoints in contract.json.
9. **Integration + tuning** — 10 full run-throughs per scenario, verify all failure specs match
10. **Polish** — Session cleanup, loading/error states, cost meter, tier advance badges, scorecard

## Key Commands

```bash
# Environment check
docker --version && docker compose version && python --version && node --version

# Boot infra for any scenario state (replace path as needed)
docker compose -p sc-dev -f infra/scenarios/url_shortener/state0_baseline/docker-compose.yml up -d --wait
docker compose -p sc-dev -f infra/scenarios/stream_proc/state0_baseline/docker-compose.yml up -d --wait

# Tear down (always use -v to clear volumes)
docker compose -p sc-dev down -v

# Run load test against a state
k6 run infra/scenarios/url_shortener/state0_baseline/k6_script.js
k6 run infra/scenarios/stream_proc/state0_baseline/k6_script.js

# Backend dev
cd backend && pip install -r requirements.txt && uvicorn main:app --reload

# Frontend dev
cd frontend && npm install && npm run dev

# Run backend tests
cd backend && pytest tests/

# Check metrics stream
curl -N http://localhost:8000/session/{session_id}/metrics
```

## Architecture

### Data flow

```
User (browser)
  │
  ├─ SSE stream ──────────────────────────────→ GET /session/{id}/metrics
  │                                              Prometheus scrapes Docker containers
  │                                              → JSON events every 2s
  │
  ├─ Chat message ────────────────────────────→ POST /session/{id}/diagnose
  │                                              + current_state + live metrics + history
  │                                              → Claude Opus (Socratic system prompt)
  │                                              ← question (never an explanation)
  │
  ├─ Traffic dial ────────────────────────────→ POST /session/{id}/traffic {virtual_users}
  │                                              → adjusts k6 VU count
  │
  ├─ Terminal panel ──────────────────────────→ GET /session/{id}/terminal/{service}  (WebSocket)
  │                                              → docker exec into running container
  │                                              → xterm.js renders live shell (psql, redis-cli, etc.)
  │
  ├─ Apply config ────────────────────────────→ POST /session/{id}/config {filename, content}
  │                                              → full file content written into container
  │                                              → hot-reloads affected service
  │
  ├─ Cheatsheet ──────────────────────────────→ GET /session/{id}/cheatsheet/{service}
  │                                              → returns relevant commands for current tab + state
  │
  └─ Apply fix (state transition) ────────────→ POST /session/{id}/state {state}
                                                 → session_manager tears down old Compose project
                                                 → boots new Compose project for new state
                                                 → metrics stream resumes with new infrastructure
```

### Session isolation

Each user session = one Docker Compose project (`sc_{session_id}`). Namespace prevents port/volume collisions. Destroyed with `-v` on session end or after 45-minute TTL.

### State machine

States for `url_shortener`:
- `state0_baseline` — Postgres only, no cache, breaks at ~3,000 req/s
- `state1_cache` — + Redis, cache-aside, 91%+ hit ratio
- `state2_thundering_herd` — TTL expiry at 4:00 triggers 500 simultaneous Postgres hits
- `state3_hotkey` — One URL gets disproportionate traffic, Redis CPU spikes

Transitions are user-driven via the architecture diagram. State changes hot-swap the Docker Compose project.

### Failure engineering principle

Do not discover failure points empirically. Engineer them: work backwards from the desired failure mode to exact resource constraints. Postgres max_connections=100 with app DB_POOL_SIZE=95 produces connection exhaustion — not CPU saturation — at exactly the right traffic level. See `systemcraft_plan.md` for full failure specs per state.

### Socratic loop rules

The `/diagnose` endpoint calls Claude Opus with `llm/socratic_system_prompt.txt`. Critical constraints baked into the prompt:
- One question per response, never an explanation
- Max 3 sentences
- Reference specific metric values from context ("p99 at 847ms" not "latency is high")
- Hints point to internals windows, not answers
- Confirms concept correctly identified → signals next tier

## Failure Verification Checklist

Each scenario has a `failure_spec.json` per state. Run after every infra change. Full specs in `systemcraft_plan.md`. URL Shortener reference:

```
state0_baseline at 3000 req/s:
  ✓ db_connections_active > 90
  ✓ db_connections_waiting > 20
  ✓ latency_p99 > 500ms
  ✓ error_rate > 2%
  ✓ db_cpu < 90%  ← connections are bottleneck, NOT CPU

state1_cache at 3000 req/s:
  ✓ redis_hit_ratio > 88%
  ✓ db_cpu < 20%
  ✓ latency_p99 < 15ms
  ✓ error_rate = 0%

state2_thundering_herd at 4m00s:
  ✓ db_cpu spikes > 70% at TTL expiry
  ✓ latency_p99 spikes > 400ms for ~30s
  ✓ recovers as cache rebuilds
```

## When to Surface to the Human

Only escalate for:
1. Environment issue (Docker not running, API key missing, wrong Node/Python version)
2. Failure spec mismatch after 3 verification runs
3. Product decision not covered in `systemcraft_plan.md`
4. Claude Opus API error on `/diagnose`

Everything else: fix and continue.

## Definition of Done

POC is complete when a user can:

**Scenario-first path:**
1. Open app, see healthy system at low traffic
2. Drag traffic slider to max, watch Postgres turn red
3. Type a diagnosis attempt, receive a Socratic question back
4. Click Postgres node, see real connection pool at 98/100
5. Open terminal panel → postgres tab, run `pg_stat_activity`, see 94 active connections
6. Open code panel → `app/cache.py` loads in full — scroll to `# TODO: TTL is fixed` comment, change `CACHE_TTL = 300` to `ttl = random.randint(240, 360)`, click Apply
7. Re-run `TTL abc123` in Redis terminal, see staggered expiry values
8. Watch metrics go green in real time after the fix
9. See thundering herd hit at 4 minutes
10. Advance tier, receive tier badge
11. End with scorecard showing concepts understood

**Concept-first path:**
12. Browse concept catalog (e.g. click "Thundering Herd")
13. App boots directly into `url_shortener/state2_thundering_herd` — already mid-failure
14. KB article opens in sidebar explaining the concept
15. Socratic loop starts with `concept_target=ttl-jitter`
16. User diagnoses via terminal, fixes via code panel, verifies in terminal
17. User fixes, advances, scorecard records the concept as mastered