# SystemCraft — Claude Code Build Plan
## The single file Claude Code reads to build the entire POC

---

## What You Are Building

SystemCraft is a distributed systems concept trainer. It teaches engineers the transferable patterns that appear inside well-known systems — not by having them read about those patterns, but by putting them inside real running infrastructure that breaks in front of them.

The URL shortener is not the lesson. Connection pool exhaustion, cache-aside, thundering herd, hot key — these are the lessons. The URL shortener is just the vehicle.

**POC scope:** All 8 scenarios, full concept catalog. Real Docker infrastructure for each. Working Socratic loop powered by Claude Opus. Concept-first navigation powered by `knowledge-base/concept_catalog.json`.

**Two entry points for users:**
1. **Concept-first:** User picks "Thundering Herd" → app boots `url_shortener/state2_thundering_herd` directly, KB article opens in sidebar, Socratic loop starts at `concept_target=ttl-jitter`
2. **Scenario-first:** User picks URL Shortener → starts at `state0_baseline`, progresses through tiers sequentially

---

## The Core Interaction Model

The system starts broken. The user diagnoses and fixes it — actively, through a terminal.

```
BOOT (pre-wired broken system)
  ↓
OBSERVE (live metrics turn red)
  ↓
TERMINAL DIAGNOSE (user runs commands in the terminal panel — pg_stat_activity, MONITOR, etc.)
  ↓
CHAT HYPOTHESIS (user articulates diagnosis to Socratic loop)
  ↓
CODE FIX (user edits the broken config value in the code panel and hits Apply)
  ↓
TERMINAL VERIFY (user re-runs the same terminal commands, sees numbers improve)
  ↓
BREAK AGAIN (thundering herd, Tier 2)
  ↓
REPEAT
```

The user is not a passive observer. They run commands to find the bottleneck number, form a hypothesis, edit the config, and verify the fix themselves. The diagram reflects the architecture they have built. The Socratic loop guides them to the right commands without giving answers.

The diagram builds itself from user decisions. The user does not design upfront — they react to failure. By the end they have built the architecture, but they built it under pressure, which is how real systems get built.

---

## Interactive Layer

This layer is what separates SystemCraft from a metrics dashboard. Users do not just watch — they act.

### Terminal Panel (TerminalPanel.tsx + terminal_manager.py)

A tabbed xterm.js terminal lives at the bottom of the simulator. Each tab is a live shell into a running container via `docker exec`, proxied over WebSocket.

**Tabs per scenario (url_shortener example):**
- `postgres` → opens `psql -U postgres` inside the Postgres container
- `redis` → opens `redis-cli` inside the Redis container
- `app-logs` → tails the FastAPI application log (`docker logs -f`)

**Example commands a user runs to diagnose thundering herd:**
```sql
-- Postgres tab
SELECT count(*), state FROM pg_stat_activity GROUP BY state;
SELECT query, count(*), avg(total_exec_time) FROM pg_stat_statements GROUP BY query ORDER BY count DESC LIMIT 5;
EXPLAIN ANALYZE SELECT url FROM urls WHERE short_code = 'abc123';
```
```
-- Redis tab
127.0.0.1:6379> INFO stats
127.0.0.1:6379> TTL abc123
127.0.0.1:6379> MONITOR
```

The terminal is read-write — users can run any command. The Socratic loop nudges them toward the right ones without giving answers.

### Context-Aware Cheatsheet (Cheatsheet.tsx)

A collapsible panel beside the terminal. Shows the 5–8 most relevant commands for the **current tab + current scenario state**. Updates when either changes.

| Tab | State | Suggested commands |
|-----|-------|--------------------|
| postgres | state0_baseline | `SELECT count(*), state FROM pg_stat_activity GROUP BY state;`, `EXPLAIN ANALYZE ...`, `\dt` |
| postgres | state2_thundering_herd | `SELECT count(*), wait_event FROM pg_stat_activity WHERE state='active' GROUP BY wait_event;` |
| redis | any | `MONITOR`, `INFO stats`, `TTL <key>`, `KEYS *`, `DEBUG SLEEP` |
| kafka | stream_proc | `kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --all-groups` |
| app-logs | any | Watch for connection timeout errors, retry storms |

Backend endpoint `GET /session/{id}/cheatsheet/{service}` returns the command list as JSON. Frontend renders it in Cheatsheet.tsx.

### Code/Config Panel (CodePanel.tsx)

A focused editor showing only the ~10 lines of code or config that are broken in the current state. The user edits a specific value and clicks "Apply". Backend templates the change and hot-reloads the affected container.

**Two modes:**

1. **MVP — constrained input fields**: Labeled number/text inputs for the key config value only.
   - `TTL (seconds): [300]` with an Apply button
   - `DB Pool Size: [95]` with an Apply button
   - No code shown — just the knob

2. **Full — Monaco-style editor**: Shows the actual broken code lines (e.g., `CACHE_TTL = 300`) highlighted in context. User edits inline. Apply triggers `POST /session/{id}/config`.

**Example — thundering herd fix:**
```python
# app/cache.py — lines 12-18 shown
CACHE_TTL = 300          # ← currently 300s for all URLs (highlighted red)

def set_cache(key, value):
    ttl = CACHE_TTL       # ← every key expires at the same time
    redis_client.setex(key, ttl, value)
```
User changes `300` to `random.randint(240, 360)`. Hits Apply. App container reloads. User verifies via `TTL abc123` in the Redis terminal — sees staggered expiry.

### Diagnostic Flow (full loop)

```
1. OBSERVE  — metrics turn red, p99 spikes, diagram node goes critical
2. TERMINAL — user opens postgres tab, runs pg_stat_activity → sees 94 active connections
3. HYPOTHESIS — user types in chat: "94 connections all hitting the same key at once"
4. QUESTION — Socratic loop: "What happens to those 94 queries when the TTL hits zero simultaneously?"
5. FIX — user opens Code panel, changes TTL from 300 to random.randint(240,360), clicks Apply
6. VERIFY — user runs TTL abc123 in Redis terminal → sees values like 247, 312, 289 (staggered)
7. ADVANCE — Socratic loop confirms concept, tier badge appears
```

---

## Tech Stack

```
Frontend:    Next.js 14 (App Router) + Tailwind + React Flow + Recharts + xterm.js
Backend:     FastAPI (Python 3.11)
Database:    Postgres 15 (Docker, resource-constrained)
Cache:       Redis 7 (Docker)
Load:        k6 (load testing, drives synthetic traffic)
Monitoring:  Prometheus + custom metrics endpoint
Runtime LLMs: Claude Opus (Socratic /diagnose) + Llama 3.1 8B local (intent classifier, ~50ms)
Build LLMs:   Claude Sonnet (code) + Claude Haiku (content/QA) via Claude Code
Containers:  Docker Compose (one project per session)
```

---

## Directory Structure

```
/systemcraft/
  backend/
    main.py              # FastAPI app — session orchestration
    session_manager.py   # Docker lifecycle, namespace isolation
    metrics_stream.py    # SSE stream, Prometheus scraping
    terminal_manager.py  # WebSocket → docker exec shell per service
    internals/
      redis_parser.py        # Redis INFO → structured JSON
      postgres_parser.py     # pg_stat_activity → structured JSON
      cassandra_parser.py    # nodetool info + system tables → structured JSON
      kafka_parser.py        # consumer group lag, partition offsets → structured JSON
      elasticsearch_parser.py # index stats, shard state → structured JSON
    requirements.txt
  frontend/
    app/
      page.tsx                    # Landing — concept catalog browser
      concept/[slug]/page.tsx     # Concept-first entry: boots mapped scenario state
      scenario/[name]/page.tsx    # Scenario-first entry: starts at state0_baseline
      layout.tsx
    components/
      ConceptCatalog.tsx   # Grid of concept cards, grouped by category
      KBSidebar.tsx        # Renders KB markdown article alongside simulator
      ArchDiagram.tsx      # React Flow diagram, state-driven
      MetricsPanel.tsx     # Live metrics, SSE-fed
      TrafficDial.tsx      # Controls k6 VU count
      SocraticChat.tsx     # LLM diagnosis loop UI
      InternalsModal.tsx   # Click-to-inspect node details (tabbed per datastore)
      TerminalPanel.tsx    # xterm.js tabbed terminals — one tab per running service (Postgres, Redis, Kafka, App Logs)
      CodePanel.tsx        # Monaco-style editor showing ~10 lines of broken code; constrained input fields in MVP mode
      Cheatsheet.tsx       # Context-aware command list — updates when user switches terminal tab or scenario state
    hooks/
      useMetrics.ts        # SSE consumer hook
      useSession.ts        # Session lifecycle hook
    lib/
      api.ts               # Typed API client
      conceptCatalog.ts    # Loads knowledge-base/concept_catalog.json
  knowledge-base/
    concept_catalog.json   # concept slug → {kb_file, anchor, scenario, state, tier}
    core-concepts/         # caching.html + caching.md, db-indexing, sharding, ...
    deep-dives/            # redis, kafka, cassandra, elasticsearch, postgres, ...
    patterns/              # scaling-reads, scaling-writes, dealing-with-contention, ...
    problem-breakdowns/    # bitly, distributed-rate-limiter, fb-news-feed, ...
  infra/
    scenarios/
      url_shortener/
        state0_baseline/   docker-compose.yml, k6_script.js, failure_spec.json
        state1_cache/
        state2_thundering_herd/
        state3_hotkey/
      write_scaling/
        state0_baseline/   # Postgres only, write queue saturates
        state1_queue/      # + Redis queue
        state2_cassandra/  # + Cassandra (LSM compaction I/O spike)
        state3_backpressure/
      fan_out/
        state0_baseline/   # Postgres only, fan-out on read
        state1_fanout_write/ # + Redis fan-out on write
        state2_replicas/   # + read replicas, eventual consistency
      rate_limiting/
        state0_baseline/   # No rate limiting, abuse scenario
        state1_token_bucket/   # Redis token bucket
        state2_sliding_window/ # Redis sorted set sliding window
        state3_distributed/    # Multi-node, consistent hashing
      blob_store/
        state0_baseline/   # Server-side upload, bottleneck
        state1_presigned/  # + LocalStack direct upload
        state2_multipart/  # + multipart for large files
        state3_cdn/        # + CDN + origin protection
      stream_proc/
        state0_baseline/   # Kafka single partition, consumer lag
        state1_partitioned/ # Multi-partition parallel consumers
        state2_at_least_once/ # Retry + idempotency
        state3_consumer_lag/  # Lag spike during rebalance
      search/
        state0_baseline/   # Postgres LIKE queries, slow
        state1_es_basic/   # + Elasticsearch inverted index
        state2_scoring/    # Relevance scoring tuning
        state3_shard_routing/ # Shard hot spots
      consistency/
        state0_baseline/   # Direct DB transfer, no txn safety
        state1_2pc/        # Two-phase commit
        state2_saga/       # Saga pattern + compensating txns
        state3_idempotency/ # Idempotency keys
    prometheus/
      scrape_config.yml
    shared/
      postgres/
        init.sql           # Seeded records (size varies by scenario)
        postgresql.conf    # Constrained: max_connections=100
      redis/redis.conf     # maxmemory 512mb
      kafka/               # server.properties, topic configs
      elasticsearch/       # elasticsearch.yml, index templates
      cassandra/           # cassandra.yaml, constrained heap
  llm/
    socratic_system_prompt.txt  # Claude Opus system prompt
    state_graph.json            # Valid state transitions per scenario
    intent_map.json             # Phrase → architecture concept
    concept_map.json            # Concept → hints + KB article ref
  content/
    scenarios/            # One JSON per scenario (context cards, copy)
    questions/            # Socratic question banks per concept
    rubrics/              # Scorecard: what counts as ✅ vs ⚠️
  contract.json           # API contract — never changes after written
```

---

## contract.json — Write This First

This is the most important file. Every component reads it. Write it before writing any code.

```json
{
  "version": "1.0",
  "sessions": {
    "create": {
      "method": "POST",
      "path": "/session/create",
      "body": { "scenario": "string", "tier": "number", "boot_state": "string|null" },
      "response": { "session_id": "string", "state": "string", "boot_time_ms": "number" },
      "note": "boot_state is optional — defaults to state0_baseline. Concept-first navigation sets it to the mapped state (e.g. state2_thundering_herd) to skip directly to a broken state."
    },
    "apply_state": {
      "method": "POST",
      "path": "/session/{session_id}/state",
      "body": { "state": "string" },
      "response": { "ok": "boolean", "state": "string" }
    },
    "destroy": {
      "method": "DELETE",
      "path": "/session/{session_id}",
      "response": { "ok": "boolean" }
    }
  },
  "metrics": {
    "live_stream": {
      "method": "GET",
      "path": "/session/{session_id}/metrics",
      "type": "SSE",
      "event_schema": {
        "ts": "unix_ms",
        "latency_p99": "number_ms",
        "error_rate": "number_percent",
        "db_cpu": "number_percent",
        "db_connections_active": "number",
        "db_connections_waiting": "number",
        "redis_hit_ratio": "number_percent_or_null",
        "redis_memory_mb": "number_or_null",
        "app_cpu": "number_percent",
        "rps": "number"
      },
      "interval_ms": 2000
    }
  },
  "internals": {
    "redis": {
      "method": "GET",
      "path": "/session/{session_id}/internals/redis",
      "response": {
        "keyspace": [{ "key": "string", "value": "string", "ttl_seconds": "number" }],
        "commands_per_sec": { "get": "number", "set": "number" },
        "hit_ratio": "number",
        "memory_used_mb": "number",
        "memory_limit_mb": "number"
      }
    },
    "postgres": {
      "method": "GET",
      "path": "/session/{session_id}/internals/postgres",
      "response": {
        "connections": { "active": "number", "waiting": "number", "max": "number" },
        "active_queries": [{ "query": "string", "count": "number", "avg_ms": "number" }],
        "cpu_percent": "number",
        "index_hit_rate": "number"
      }
    }
  },
  "socratic": {
    "diagnose": {
      "method": "POST",
      "path": "/session/{session_id}/diagnose",
      "body": {
        "message": "string",
        "context": {
          "current_state": "string",
          "current_metrics": "object",
          "tier": "number",
          "concept_target": "string",
          "history": [{ "role": "string", "content": "string" }]
        }
      },
      "response": {
        "reply": "string",
        "intent_detected": "string_or_null",
        "next_state": "string_or_null",
        "show_hint": "boolean"
      }
    }
  },
  "traffic": {
    "set_vus": {
      "method": "POST",
      "path": "/session/{session_id}/traffic",
      "body": { "virtual_users": "number" },
      "response": { "ok": "boolean", "actual_rps": "number" }
    }
  },
  "interactive": {
    "terminal": {
      "method": "GET",
      "path": "/session/{session_id}/terminal/{service}",
      "type": "WebSocket",
      "note": "Upgrades to WebSocket. Proxies stdin/stdout to `docker exec -it <container> /bin/bash` (or psql/redis-cli for typed shells). service = postgres | redis | kafka | app.",
      "params": { "service": "string — postgres | redis | kafka | app" }
    },
    "apply_config": {
      "method": "POST",
      "path": "/session/{session_id}/config",
      "body": { "key": "string", "value": "any" },
      "response": { "ok": "boolean", "reloaded_service": "string", "reload_ms": "number" },
      "note": "Templates the new value into the running container's config and hot-reloads. key examples: ttl_seconds, db_pool_size, max_connections, cache_enabled."
    },
    "cheatsheet": {
      "method": "GET",
      "path": "/session/{session_id}/cheatsheet/{service}",
      "response": {
        "service": "string",
        "state": "string",
        "commands": [{ "label": "string", "cmd": "string", "description": "string" }]
      },
      "note": "Returns relevant commands for the current tab + state. Frontend updates Cheatsheet.tsx whenever the user switches tabs or the session state advances."
    }
  },
  "states": {
    "url_shortener":  ["state0_baseline", "state1_cache", "state2_thundering_herd", "state3_hotkey"],
    "write_scaling":  ["state0_baseline", "state1_queue", "state2_cassandra", "state3_backpressure"],
    "fan_out":        ["state0_baseline", "state1_fanout_write", "state2_replicas"],
    "rate_limiting":  ["state0_baseline", "state1_token_bucket", "state2_sliding_window", "state3_distributed"],
    "blob_store":     ["state0_baseline", "state1_presigned", "state2_multipart", "state3_cdn"],
    "stream_proc":    ["state0_baseline", "state1_partitioned", "state2_at_least_once", "state3_consumer_lag"],
    "search":         ["state0_baseline", "state1_es_basic", "state2_scoring", "state3_shard_routing"],
    "consistency":    ["state0_baseline", "state1_2pc", "state2_saga", "state3_idempotency"]
  }
}
```

---

## Infrastructure Specs — Failure Engineering

### The key principle

Do not discover failure points empirically through 30 test runs. Engineer them. Work backwards from the desired failure mode to the exact resource constraints that produce it.

### State 0 — Baseline (broken at high traffic)

**Target failure:** Connection pool exhaustion  
**Target traffic level:** ~3,000 req/s  
**Failure curve:** Healthy 0–1,500 | Degrading 1,500–2,500 | Broken 2,500+  
**Failure mode:** Connections at max_connections, queries queuing — NOT CPU saturation

```yaml
# docker-compose for state0
services:
  postgres:
    image: postgres:15
    deploy:
      resources:
        limits:
          cpus: '0.8'       # enough CPU so CPU is NOT the bottleneck
          memory: 512M      # enough RAM so RAM is NOT the bottleneck
    environment:
      POSTGRES_MAX_CONNECTIONS: 100  # connection pool IS the bottleneck
    volumes:
      - ./postgres/postgresql.conf:/etc/postgresql/postgresql.conf
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/init.sql

  app:
    build: ./app
    environment:
      DB_POOL_SIZE: 95       # leaves 5 connections for overhead
      DB_MAX_OVERFLOW: 0     # no burst connections allowed
      REDIS_URL: ""          # no cache in state0
```

**Why this produces connection exhaustion and not CPU failure:**  
CPU is limited to 0.8 cores — enough to run queries but not enough headroom for 3,000 simultaneous connections. The app's DB_POOL_SIZE of 95 means the 96th concurrent request blocks waiting for a connection. At 3,000 req/s with avg query time of ~10ms, you need ~30 concurrent connections minimum. At 3,000 req/s they saturate at exactly the right traffic level.

**Postgres init.sql:**
```sql
CREATE TABLE urls (
  id BIGSERIAL PRIMARY KEY,
  short_code VARCHAR(8) UNIQUE NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  hit_count BIGINT DEFAULT 0
);
CREATE INDEX idx_short_code ON urls(short_code);

-- Seed 10M records for realistic index behavior
INSERT INTO urls (short_code, url)
SELECT
  substring(md5(random()::text), 1, 7),
  'https://example.com/' || generate_series
FROM generate_series(1, 10000000);
```

### State 1 — Cache added (healthy)

**Target state:** Redis absorbing 91%+ of reads  
**Redis config:**
```
maxmemory 512mb
maxmemory-policy allkeys-lru
```

**App config change:** `REDIS_URL: redis://redis:6379`  
**k6 script change:** Same traffic profile, but 91% of requests are for top 340 URLs (power law distribution)

### State 2 — Thundering herd

**Target failure:** Postgres spike when top URL TTL expires  
**How to engineer it:**

The k6 script in state2 must:
1. Run normally for 4 minutes (healthy with cache)
2. At exactly 4:00, send 500 simultaneous requests for the top URL
3. This simulates the TTL expiring while 500 users are mid-request

```javascript
// k6/state2_thundering_herd.js
import { check, sleep } from 'k6';
import http from 'k6/http';

export let options = {
  scenarios: {
    normal_traffic: {
      executor: 'constant-vus',
      vus: 100,
      duration: '10m',
    },
    thundering_herd: {
      executor: 'ramping-vus',
      startTime: '4m',     // triggers at 4 minutes
      startVUs: 0,
      stages: [
        { duration: '1s', target: 500 },  // 500 VUs hit simultaneously
        { duration: '30s', target: 500 },
        { duration: '5s', target: 0 },
      ],
    },
  },
};

const TOP_URL = 'abc123';  // the URL whose TTL expires

export default function() {
  // 60% of traffic hits the top URL (hot)
  const shortCode = Math.random() < 0.6 ? TOP_URL : randomCode();
  const res = http.get(`http://app:8000/r/${shortCode}`);
  check(res, { 'status 301': r => r.status === 301 });
  sleep(0.1);
}
```

**What the user sees:** Metrics go green after adding Redis. Five minutes later, p99 spikes to 600ms+ and DB CPU jumps to 70%+. The thundering herd hits.

---

## Backend — FastAPI

### main.py structure

```python
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from session_manager import SessionManager
from metrics_stream import MetricsStream
from internals.redis_parser import RedisInternals
from internals.postgres_parser import PostgresInternals
import anthropic
import json

app = FastAPI()
sessions = SessionManager()

@app.post("/session/create")
async def create_session(scenario: str, tier: int):
    session_id = sessions.create(scenario, tier)
    return {"session_id": session_id, "state": "state0_baseline"}

@app.post("/session/{session_id}/state")
async def apply_state(session_id: str, state: str):
    sessions.apply_state(session_id, state)
    return {"ok": True, "state": state}

@app.get("/session/{session_id}/metrics")
async def metrics_stream(session_id: str):
    stream = MetricsStream(session_id, sessions)
    return StreamingResponse(stream.generate(), media_type="text/event-stream")

@app.get("/session/{session_id}/internals/redis")
async def redis_internals(session_id: str):
    return RedisInternals(sessions.get_redis_client(session_id)).get()

@app.get("/session/{session_id}/internals/postgres")
async def postgres_internals(session_id: str):
    return PostgresInternals(sessions.get_pg_client(session_id)).get()

@app.post("/session/{session_id}/diagnose")
async def diagnose(session_id: str, body: dict):
    client = anthropic.Anthropic()
    
    system_prompt = open("../llm/socratic_system_prompt.txt").read()
    context = body["context"]
    
    # Build context-aware prompt
    context_str = f"""
Current architecture state: {context['current_state']}
Current metrics: {json.dumps(context['current_metrics'], indent=2)}
Concept target this tier: {context['concept_target']}
Tier: {context['tier']}
"""
    
    messages = context.get("history", [])
    messages.append({"role": "user", "content": context_str + "\n\nUser says: " + body["message"]})
    
    response = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=400,
        system=system_prompt,
        messages=messages
    )
    
    reply = response.content[0].text
    return {"reply": reply, "intent_detected": None, "next_state": None, "show_hint": False}

@app.delete("/session/{session_id}")
async def destroy_session(session_id: str):
    sessions.destroy(session_id)
    return {"ok": True}
```

### session_manager.py — key logic

```python
import docker
import uuid
import subprocess
from pathlib import Path

class SessionManager:
    def __init__(self):
        self.client = docker.from_env()
        self.sessions = {}  # session_id → {state, project_name, ...}
    
    def create(self, scenario: str, tier: int) -> str:
        session_id = str(uuid.uuid4())[:8]
        project = f"sc_{session_id}"  # unique Docker Compose project name
        
        state = "state0_baseline"
        compose_file = self._compose_path(scenario, state)
        
        subprocess.run([
            "docker", "compose",
            "-p", project,
            "-f", str(compose_file),
            "up", "-d", "--wait"
        ], check=True)
        
        self.sessions[session_id] = {
            "scenario": scenario,
            "state": state,
            "project": project,
            "tier": tier
        }
        return session_id
    
    def apply_state(self, session_id: str, new_state: str):
        s = self.sessions[session_id]
        compose_file = self._compose_path(s["scenario"], new_state)
        
        # Hot-swap: bring down, bring up new state
        subprocess.run(["docker", "compose", "-p", s["project"], "down"], check=True)
        subprocess.run([
            "docker", "compose", "-p", s["project"],
            "-f", str(compose_file), "up", "-d", "--wait"
        ], check=True)
        
        s["state"] = new_state
    
    def destroy(self, session_id: str):
        s = self.sessions.pop(session_id, None)
        if s:
            subprocess.run(["docker", "compose", "-p", s["project"], "down", "-v"])
    
    def _compose_path(self, scenario: str, state: str) -> Path:
        return Path(f"../infra/scenarios/{scenario}/{state}/docker-compose.yml")
```

---

## The Socratic System Prompt

Save this as `/systemcraft/llm/socratic_system_prompt.txt`

```
You are the diagnosis loop inside SystemCraft, a distributed systems 
concept trainer. Your job is to teach one specific concept per tier 
through Socratic questioning — not by explaining, but by asking.

CURRENT TIER GOAL: Make the concept of [CONCEPT_TARGET] intuitive 
and felt, not just understood intellectually.

RULES:
1. Never explain the answer. Ask the question that leads the user to 
   discover it themselves.
2. One question per response. Not two. Not a question with a clarification. 
   One focused question.
3. If the user is on the right track, affirm briefly (one sentence) then 
   ask the next question that deepens their understanding.
4. If the user is off track, do not correct them directly. Ask a question 
   that redirects their attention to the right component or metric.
5. When the user correctly identifies the concept, confirm it clearly, 
   show them the internals window that makes it visual, then hint at 
   what breaks next.
6. Use the live metrics in context. "Your p99 just hit 847ms" is more 
   powerful than "latency is high."
7. Maximum response length: 3 sentences. You are not an explainer. 
   You are a question-asker.
8. Never use bullet points. Never use headers. Conversational only.
9. If the user says they don't know or asks for help, give a hint that 
   points them to a specific thing to look at — a metric, a component, 
   an internals window. Never give the answer directly.

TONE: You are a senior engineer sitting next to the user, watching 
their system fail. You are curious, not condescending. You have seen 
this before. You want them to feel the "oh, of course" moment themselves.

CONTEXT YOU RECEIVE WITH EACH MESSAGE:
- Current architecture state (what's running)
- Live metrics at this moment
- Which concept this tier is teaching
- Full conversation history
- What the user just said

USE THE METRICS. Reference specific numbers. "94% CPU" is more visceral 
than "the database is struggling."
```

---

## Frontend — Key Components

### useMetrics.ts — SSE consumer

```typescript
import { useState, useEffect } from 'react';

interface Metrics {
  latency_p99: number;
  error_rate: number;
  db_cpu: number;
  db_connections_active: number;
  db_connections_waiting: number;
  redis_hit_ratio: number | null;
  rps: number;
}

export function useMetrics(sessionId: string | null) {
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    const es = new EventSource(`/api/session/${sessionId}/metrics`);
    es.onmessage = (e) => setMetrics(JSON.parse(e.data));
    return () => es.close();
  }, [sessionId]);

  return metrics;
}
```

### ArchDiagram.tsx — React Flow

The diagram uses React Flow with custom nodes. Each node's appearance is driven by the metrics state — not hardcoded, but computed:

```typescript
function getNodeState(nodeId: string, metrics: Metrics | null): 'ok' | 'warn' | 'crit' | 'teal' {
  if (!metrics) return 'ok';
  if (nodeId === 'postgres') {
    if (metrics.db_cpu > 80 || metrics.db_connections_waiting > 10) return 'crit';
    if (metrics.db_cpu > 50) return 'warn';
    return 'ok';
  }
  if (nodeId === 'redis') return 'teal';
  return 'ok';
}
```

---

## Build Order

Claude Code must follow this sequence. Do not skip steps.

### Step 1 — Verify environment (30 min)
```bash
docker --version        # must be 24+
docker compose version  # must be v2
python --version        # must be 3.11+
node --version          # must be 18+
echo $ANTHROPIC_API_KEY # must be set
```

### Step 2 — Write contract.json (1 hour)
Write it exactly as specified above. This file never changes after this step.

### Step 3 — Build infra layer: url_shortener (1 day)
- Write docker-compose files for states 0–3, k6 scripts, postgres init.sql (10M rows), prometheus config
- **Verify all failure specs before proceeding** (connection exhaustion, cache hit ratio, thundering herd timing)

### Step 4 — Build backend core (1 day)
- Write main.py, session_manager.py, metrics_stream.py
- Write internals parsers: redis_parser.py, postgres_parser.py
- Write /diagnose endpoint with Opus API call
- session_manager.py must support optional `boot_state` param — boots to that state instead of state0_baseline
- **Verify:** `pytest backend/tests/` — all endpoints respond correctly

### Step 5 — Build frontend (1.5 days)
- Scaffold Next.js project with two route types:
  - `/scenario/[name]` — starts at state0_baseline, sequential progression
  - `/concept/[slug]` — reads `knowledge-base/concept_catalog.json`, creates session at mapped state, renders simulator + KB article markdown in sidebar
- Build ConceptCatalog.tsx — landing page grid of all 30 concepts, grouped
- Build KBSidebar.tsx — renders the mapped .md file from knowledge-base/
- Build ArchDiagram, MetricsPanel, SocraticChat, TrafficDial, InternalsModal (static-first, then wire)
- **Verify:** Both entry points fully playable for url_shortener end-to-end

### Step 6 — Write Socratic prompt (0.5 days)
- Write system prompt as specified above
- Test with 20 different user inputs
- Tune until it asks questions and never lectures

### Step 7 — Build infra for remaining 7 scenarios (3 days)
One scenario at a time, verify failure specs before moving to next:
- `write_scaling`: Postgres + Redis queue + Cassandra (LSM compaction I/O spike)
- `fan_out`: Postgres + Redis (fan-out write vs read trade-off)
- `rate_limiting`: Redis-only (token bucket → sliding window → distributed)
- `blob_store`: LocalStack + Postgres (presigned → multipart → CDN)
- `stream_proc`: Kafka + Postgres (partition lag → at-least-once → consumer rebalance)
- `search`: Elasticsearch + Postgres (inverted index → scoring → shard routing)
- `consistency`: Postgres (2PC → saga → idempotency keys)

### Step 8 — Extend backend internals parsers (1 day)
- Write cassandra_parser.py (nodetool info, memtable fill %, SSTable count, compaction status)
- Write kafka_parser.py (consumer group lag per partition, offset positions, throughput)
- Write elasticsearch_parser.py (index refresh lag, shard assignment, segment count)
- Add `/internals/cassandra`, `/internals/kafka`, `/internals/elasticsearch` endpoints

### Step 9 — Extend content for all scenarios (1 day)
- Write content JSON per scenario (context cards, question banks, rubrics)
- Extend llm/state_graph.json and llm/intent_map.json for all 8 scenarios

### Step 10 — Integration + tuning (2 days)
- 10 full run-throughs per scenario
- Verify all failure specs match
- Test concept-first entry for 10+ concept slugs
- Verify Socratic loop handles all concept_target values correctly

### Step 11 — Polish (0.5 days)
- Session cleanup on browser close (beforeunload event)
- Loading states while containers boot
- Cost meter (container count × $0.02/hr)
- Tier advance badge when concept is correctly identified
- Scorecard with concept gap identification + KB article links for ⚠️ gaps

---

## Failure Specs — Verification Checklist

Run this after every infra change:

```
state0_baseline at 3000 req/s:
  ✓ db_connections_active > 90
  ✓ db_connections_waiting > 20  
  ✓ latency_p99 > 500ms
  ✓ error_rate > 2%
  ✓ db_cpu < 90% (connections are bottleneck, not CPU)

state1_cache at 3000 req/s:
  ✓ redis_hit_ratio > 88%
  ✓ db_cpu < 20%
  ✓ latency_p99 < 15ms
  ✓ error_rate = 0%

state2_thundering_herd at 4:00:
  ✓ db_cpu spikes > 70% at TTL expiry
  ✓ latency_p99 spikes > 400ms for 30s
  ✓ then recovers as cache rebuilds
```

---

## What to Surface to the Human

Surface only these:

1. **Environment issue** — Docker not running, API key missing, Node version wrong
2. **Failure spec mismatch** — After 3 verification runs, failure mode still does not match spec
3. **Product decision** — "Should the thundering herd in Tier 2 auto-trigger or wait for user to set 5m TTL?" (answer: auto-trigger, more visceral)
4. **Opus API error** — Rate limit or auth failure on /diagnose endpoint

Everything else: fix it yourself and continue.

---

## Definition of Done

The POC is complete when a person can:

**Scenario-first path (full interactive loop):**
1. Open the app in a browser
2. See a healthy system at low traffic
3. Drag the traffic slider to max and watch Postgres turn red
4. Open the Postgres terminal tab, run `SELECT count(*), state FROM pg_stat_activity GROUP BY state;`, see 94 active connections
5. Type "94 connections all blocked on the same hot key" and get a Socratic question back
6. Click Postgres node and see the real connection pool at 98/100 in the internals modal
7. Open the Code panel, add Redis config, click Apply, watch metrics go green in real time
8. See the thundering herd hit 4 minutes later
9. Open Redis terminal tab, run `TTL abc123`, watch the countdown hit zero and metrics spike
10. Edit TTL to use jitter in the Code panel, Apply, verify staggered TTLs via terminal
11. End with a scorecard showing which concepts they understood

**Concept-first path:**
12. Browse concept catalog, click "Thundering Herd"
13. App boots directly into `url_shortener/state2_thundering_herd` — already mid-failure
14. KB article opens in sidebar explaining the concept
15. Socratic loop starts with `concept_target=ttl-jitter`
16. User follows the TERMINAL DIAGNOSE → CHAT HYPOTHESIS → CODE FIX → TERMINAL VERIFY loop
17. Scorecard records the concept as mastered

If all seventeen of these work, the POC is done. Ship it.
