# SystemCraft — POC Build Plan
## From Zero to Demonstrable in 4 Weeks

---

## What You Have at End of Week 8

All 8 scenarios running on real Docker infrastructure. 30+ learnable concepts mapped in `concept_catalog.json`. Two entry points: concept-first (jump directly to any broken state) and scenario-first (sequential progression). Working Socratic loop for every concept. KB articles from hellointerview displayed alongside every simulation. Scorecard with concept gap identification linking back to KB articles.

Not a mockup. Not a video. Running software. Any engineer can open it, pick "Thundering Herd", and be inside a broken Redis system in under 30 seconds.

---

## How It Gets Built

### The orchestration model

**Claude Code is the builder and orchestrator.** It runs in your terminal with filesystem access, executes bash commands, writes all code directly, validates outputs, and surfaces to you only when genuinely stuck. No external agents or IDEs needed — Claude Code handles everything end to end.

**The contract is written first.** Before writing any code, you and Claude Code spend 2 hours writing `contract.json` — every API route, payload shape, SSE event schema, state name, session format. Once written, it never changes. Every component treats it as ground truth.

---

## The Build Roster

### Task 1 — Infra Architect
**Model:** Claude Sonnet (via Claude Code)
**Task:** Generate all Docker Compose configs + k6 scripts for all 8 scenarios. Start with url_shortener (4 states), verify failure specs, then proceed scenario by scenario: write_scaling (Postgres+Redis+Cassandra), fan_out, rate_limiting (Redis-only), blob_store (LocalStack), stream_proc (Kafka), search (Elasticsearch), consistency.

**How LLM tuning works:**  
Instead of 30 empirical test runs to find the right resource limits, Claude Code gives Gemini a failure specification:

```
Target failure: connection pool exhaustion
Target traffic: ~3,000 req/s on the k6 dial  
Failure curve: healthy 0–1,500, degrading 1,500–2,500, broken 2,500+
Failure mode must appear as: connections at max_connections, queries queuing
NOT as: CPU saturation (that's a different lesson)
```

Gemini works backwards from the spec to exact Docker resource limits, Postgres config (`max_connections=20`), and k6 arrival rates. One verification run. Minor correction if needed. Done.

**Output:** `/workspace/infra/scenarios/{scenario}/{state}/` for all 8 scenarios, plus `infra/shared/` for per-datastore configs (postgresql.conf, redis.conf, cassandra.yaml, kafka/server.properties, elasticsearch.yml).

---

### Task 2 — Backend API
**Model:** Claude Sonnet (via Claude Code)
**Task:** FastAPI orchestration layer — session management, metrics pipeline, SSE stream.

**Key endpoints:**
```
POST /session/create          → boots Docker Compose; optional boot_state skips to any state
POST /session/apply-state     → hot-swaps architecture state
GET  /metrics/live            → SSE stream, 2s interval, Prometheus data
GET  /internals/redis         → parsed Redis INFO
GET  /internals/postgres      → parsed pg_stat_activity
GET  /internals/cassandra     → memtable fill %, SSTable count, compaction status
GET  /internals/kafka         → consumer group lag, partition offsets, throughput
GET  /internals/elasticsearch → index refresh lag, shard assignment, segment count
GET  /terminal/{service}      → WebSocket — proxies stdin/stdout to docker exec shell (psql, redis-cli, etc.)
POST /config                  → templates new value into running container config, hot-reloads
GET  /cheatsheet/{service}    → returns relevant commands for current tab + scenario state
DELETE /session/{id}          → tears down containers, cleans up
```

**Session isolation:** Each session gets a namespaced Docker Compose project. Two users running simultaneously never touch the same containers. Sessions auto-expire after 45 minutes.

**Output:** `/workspace/backend/`

---

### Task 3 — Frontend
**Model:** Claude Sonnet (via Claude Code)
**Task:** Next.js app — two entry routes, concept catalog, KB sidebar, simulator components.

**Routes:**
```
/                       — ConceptCatalog landing: grid of 30+ concepts, grouped by category
/concept/[slug]         — concept-first: reads concept_catalog.json, boots mapped state, KB sidebar open
/scenario/[name]        — scenario-first: starts at state0_baseline, sequential progression
```

**Components:**
```
ConceptCatalog.tsx   — landing grid, concept cards grouped (Caching, Kafka, Search, ...)
KBSidebar.tsx        — renders knowledge-base/*.md beside the simulator
ArchDiagram.tsx      — React Flow, pre-wired nodes, state-driven appearance
MetricsPanel.tsx     — Recharts, SSE-fed, traffic dial
InternalsWindow.tsx  — modal, tabbed: Redis / Postgres / Cassandra / Kafka / Elasticsearch
SocraticChat.tsx     — message thread, hint chips, tier advance
TrafficDial.tsx      — controls k6 VU count via API
TerminalPanel.tsx    — xterm.js tabbed terminal, one tab per running service (postgres, redis, app-logs)
CodePanel.tsx        — constrained config editor (MVP: labeled inputs; full: Monaco-style) + Apply button
Cheatsheet.tsx       — context-aware command list; updates on tab switch or state advance
```

**Output:** `/workspace/frontend/`

---

### Task 4 — Socratic Loop
**Model:** Claude Opus (runtime API) — kept because pedagogical tone calibration requires full reasoning capability
**Task:** System prompt engineering, state graph definition, intent mapping.

**The state graph (URL Shortener):**
```json
{
  "states": {
    "broken_baseline": {
      "concept": "connection pool exhaustion",
      "valid_next": ["cache_added"],
      "goal": "user identifies read bottleneck"
    },
    "cache_added": {
      "concept": "cache-aside pattern", 
      "valid_next": ["ttl_configured", "thundering_herd"],
      "goal": "user understands why cache helps"
    },
    "thundering_herd": {
      "concept": "thundering herd",
      "valid_next": ["ttl_jitter_added"],
      "goal": "user understands mass TTL expiry risk"
    }
  }
}
```

**The Socratic constraint:** The loop has one job per tier. Tier 2's only job is making the cache-aside pattern intuitive. Every question it asks, every internals window it highlights, every metric it points to — all serve that one concept. Nothing else. This makes prompt engineering tractable: "your only job right now is to make the user understand thundering herd."

**Output:** `/workspace/llm/`

---

### Task 5 — Content
**Model:** Claude Haiku (via Claude Code) — fast + cheap for high-volume structured content generation
**Task:** Content JSON for all 8 scenarios — context cards, question banks, scorecard rubrics, internals panel labels.

**Output:** `/workspace/content/`
```
scenarios/{scenario}.json       — one per scenario (8 total)
questions/{concept}.json        — Socratic question bank per concept (30 total)
rubrics/{scenario}_scorecard.json  — what counts as ✅ vs ⚠️
copy/context_cards.json         — 2-min pre-sim explainers per scenario
copy/internals_panels.json      — labels for Redis/Postgres/Cassandra/Kafka/ES windows
```

---

### Task 6 — QA + Tuning
**Model:** Claude Haiku (loops) → Claude Sonnet (failure analysis)
**Task:** 20+ full scenario run-throughs, failure mode verification, classifier accuracy testing.

**Validates:**
- Failure mode matches spec (connection pool, not CPU — different lesson)
- Degradation curve is smooth, not cliff-edge
- Two concurrent sessions do not interfere
- LLM classifier handles 50+ input variations correctly
- Thundering herd triggers at exactly TTL expiry of top URL

---

## Week by Week

### Week 1 — Foundations (mostly parallel)

**Day 1–2: Contract (you + Claude Code, 2 hours)**  
The only thing that requires your undivided attention. Define:
- Every API route + payload
- SSE event schema  
- State names (`state0_baseline`, `state1_cache`, etc.)
- Session namespace format
- Metrics schema (what Prometheus scrapes, what the frontend consumes)

All 6 agents unblock the moment this is written.

**Day 1–5: Sequential workstreams (Claude Code)**
- Infra: Docker Compose + k6 scripts for url_shortener all 4 states
- Socratic loop: state graph + first draft system prompt (Claude Opus call)
- Content spec JSON for url_shortener (Claude Haiku)
- Next.js scaffold with both routes stubbed

**End of Week 1 deliverables:**
- `contract.json` — finalised, never changes again
- All Docker Compose files for url_shortener (4 states), failure specs verified
- All k6 scripts (4 states)
- Content spec JSON for url_shortener
- Frontend scaffold with both routes in place
- Socratic state graph designed

---

### Week 2 — Core Build (parallel)

**Claude Code (backend):**
- FastAPI backend complete
- Session lifecycle (create, apply-state, destroy) with `boot_state` support
- SSE metrics pipeline (Prometheus → FastAPI → frontend)
- Redis INFO parser, pg_stat_activity parser

**Claude Code (frontend):**
- React Flow diagram wired to state API
- Live metrics panel consuming SSE stream
- Traffic dial controlling k6 VU count
- KBSidebar rendering markdown from knowledge-base/

**Claude Code (infra verification):**
- Verification runs on Docker configs
- Resource limit corrections if needed

**End of Week 2 deliverables:**
- Backend running locally, all endpoints responding (including WebSocket terminal)
- Frontend rendering with mocked data, terminal panel wired to WebSocket
- Infra verified — failure modes match specs

---

### Week 3 — Integration

This week everything connects. Claude Code's hardest week — it is resolving conflicts between agents that assumed compatible interfaces.

**Integration tasks:**
- Socratic loop wired to live session context (metrics + state + history)
- Internals windows showing real Redis INFO + real pg_stat_activity  
- Traffic dial triggering real k6 VU changes
- Architecture diagram updating from real state transitions
- End-to-end flow: boot → break → diagnose → fix → re-break

**First full run-through:** By end of week 3 you can sit down and complete Tier 1. It will be rough. The thundering herd will trigger at the wrong time. The Socratic loop will misclassify two inputs. The internals window will show a query you did not expect. This is the right state to be in at end of week 3.

---

### Week 4 — Tuning + Polish

**Infrastructure tuning:**  
Claude Code runs each scenario 20+ times. Reports exact failure point and failure mode each run. Retasks infra corrections until failure mode matches spec consistently.

**LLM classifier tuning:**  
Claude Haiku tests 50+ input variations against the intent classifier. Reports misclassifications. Claude Code expands the concept map. Target: 90%+ accuracy on first-pass classification.

**Thundering herd precision:**  
The herd must trigger at actual TTL expiry of the top URL in Redis — not on a timer, not on a button. Agent 1 tunes k6 traffic profile so the top URL's TTL expires 5 minutes into the scenario, after the user has celebrated fixing the initial break.

**Polish:**
- Cost meter formula (simple: container count × $0.02/hr)
- Tier progression and unlock logic
- Scorecard with concept gap identification  
- Session cleanup on tab close

---

## What Claude Code Actually Does

You open Claude Code and say:

```
Read /workspace/AGENTS.md and /workspace/plan.md.
Build the SystemCraft POC. Contract.json is approved.
Work through the task graph. Surface to me only when
you are stuck after 2 retries or need a product decision.
```

Claude Code runs. You are involved four times:

1. **Contract approval** — 2 hours, Day 1. The only place your product judgment is irreplaceable.
2. **v0.dev scaffold** — 30 minutes. Paste a prompt, copy the output to `/workspace/frontend/src/`.
3. **First full run-through** — End of Week 3. Play the scenario yourself. Give feedback on where it feels wrong.
4. **Final QA** — End of Week 4. 5 full run-throughs. Confirm the thundering herd hits at the right moment.

Everything else is Claude Code + agents.

---

## Week-by-Week (Revised for Full Scope)

**Week 1–2:** url_shortener infra + backend core + frontend (both routes) + Socratic prompt. End state: url_shortener fully playable via both `/scenario/url_shortener` and `/concept/thundering-herd`.

**Week 3–4:** Remaining 7 scenario infra (one per day). Cassandra, Kafka, Elasticsearch configs generated by Agent 1. New internals parsers added by Agent 2. Content JSON generated by Agent 5 in parallel.

**Week 5–6:** Integration + tuning across all scenarios. 10 run-throughs per scenario. Concept-first navigation tested for all 30 concept slugs. KB sidebar rendering verified for all mapped articles.

**Week 7–8:** Polish, scorecard, QA loops, cost meter, investor demo prep. End state: any engineer can open the app, pick any concept, and be inside a broken system in under 30 seconds.

This is what you show investors, potential co-founders, and early users for feedback.

---

## Files to Create Before Starting

**`/workspace/contract.json`** — The API contract. Every route, payload, state name, SSE event. Two hours with Claude Code. This is the only prerequisite.

**`/workspace/CLAUDE.md`** — Already exists. Claude Code reads this for architecture, build order, and failure specs.

No wrapper scripts needed. Claude Code calls the Anthropic SDK directly for Claude Haiku (content generation) and Claude Opus (Socratic runtime). No other external APIs.

---

## Runtime Stack (What LangGraph Powers)

LangGraph enters at runtime — inside the finished product, not the build process.

The Socratic loop that runs during live user sessions needs:
- State management across multi-turn conversation
- Conditional routing (understood → advance, stuck → hint)
- Persistent session state across reconnects
- Human-in-the-loop breakpoints for future features

That is exactly what LangGraph is designed for. The POC build uses a simpler implementation. LangGraph replaces it in V1 production.

---

*Three files. One afternoon. Claude Code takes it from there.*
