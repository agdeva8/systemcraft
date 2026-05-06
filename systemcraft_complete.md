# SystemCraft
## The Distributed Systems Concept Trainer
### Complete Product Writeup — May 2026

---

## The One-Line Version

SystemCraft teaches distributed systems concepts by putting engineers inside systems that break — one concept per scenario, learned at the exact moment their own infrastructure fails because of it.

---

## The Problem

There is a wall between reading about distributed systems and understanding them.

Every senior engineer remembers the first time they watched Postgres saturate at 3am. They don't remember the article they read about connection pooling. They remember the incident. They remember the specific query that killed the database. They remember what they did to fix it. That memory never leaves.

The problem is that manufacturing that experience traditionally requires years in production. You have to work at a company with real scale, get paged at real hours, and debug real systems. Most engineers preparing for senior-level interviews have never had that. They've read the articles. They can recite the patterns. But when an interviewer asks "what would you do if your cache layer failed?" they answer from memory, not intuition.

**The gap is not knowledge. It's the absence of felt experience.**

Existing platforms address this by adding more content — more articles, more videos, more mock interviews. SystemCraft addresses it differently: by manufacturing the experience itself.

---

## What SystemCraft Actually Teaches

SystemCraft does not teach system design. It teaches the **transferable concepts** that appear inside well-known systems.

The URL shortener scenario is not about URL shorteners. It is about:

| What breaks in the simulation | Concept being taught |
|---|---|
| Postgres saturates under read load | Connection pool exhaustion |
| Same URLs hit the database repeatedly | Cache-aside pattern |
| Cache TTLs expire simultaneously | Thundering herd problem |
| One URL goes viral, Redis CPU spikes | Hot key problem, L1 local caching |
| Writes begin backing up at scale | Async queues, write decoupling |
| Single database cannot serve read replicas | Read replicas, eventual consistency |

A user who completes this scenario does not walk away knowing how to build a URL shortener. They walk away knowing that when they see a read-heavy workload with repeated lookups, they reach for a cache. When they add a cache, they must think about TTL jitter. When one key gets disproportionate traffic, they need L1 local caching. These patterns apply to Twitter timelines, product pages, API responses, and anything else they will ever build.

The URL shortener is the vehicle. Connection pool exhaustion is the cargo.

---

## The Core Interaction Model

**The system starts broken. The user fixes it.**

This is the inversion that makes SystemCraft different from every competing tool. Other platforms ask users to design a system, then tell them if it was correct. SystemCraft gives users a running system, breaks it in front of them, and asks them to diagnose and repair it.

The loop:

```
BREAK → OBSERVE → DIAGNOSE → FIX → BREAK AGAIN
```

Each break teaches one concept. Each fix reveals the next failure. By the end of a 30-minute scenario, the user has experienced six concepts under pressure, not read about them passively.

### The Three Layers of Every Scenario

**Layer 1 — Context card (2 minutes)**
Not a lesson. Just enough to make the failure meaningful. For URL shortener:
- 1 write per URL creation, ~10,000 reads per redirect
- Core operation: `SELECT url WHERE short_code = ?`
- Postgres handles this with a B-tree index on `short_code`
- At low traffic: healthy. At scale: the index becomes the bottleneck.

**Layer 2 — The simulation**
A pre-wired running system. Traffic dial. Live metrics. Architecture diagram that builds itself as the user makes decisions. Real Docker containers, real Redis, real Postgres, real k6 load scripts — toned down so 5,000 synthetic requests produce the same failure modes as 1 million real ones.

**Layer 3 — The Socratic loop**
Powered by Claude Opus. When something breaks, the loop does not explain. It asks. "Your p99 just hit 800ms. What component do you think is responsible?" If the user does not know, it shows them the internals — the B-tree index collapsing, the connection pool filling, the Redis keyspace. The concept is taught at the exact moment it is relevant. That is when it sticks.

---

## The User Journey — URL Shortener, Tier 1

**Boot (zero action required)**

A pre-wired system appears. Split screen:
- Left: architecture diagram — Client → App Server → Postgres
- Right: live metrics — Traffic 1,000 req/day, p99 latency 34ms, Error rate 0%, Cost $40/mo

Everything is green. The system is healthy.

**The inciting event**

Narrator: *"Your startup just got featured on Hacker News."*

The traffic dial automatically climbs to 100,000 req/day. The user watches it happen. They did not choose it. The Postgres node on the diagram pulses red.

```
DB CPU:      94% 🔴
Error rate:  3.2% 🔴
p99 latency: 847ms 🔴
```

The Socratic loop appears: *"Your system is struggling. What do you think is happening?"*

**The diagnosis**

The user types anything. The loop interprets intent, not syntax. "the database is getting hammered," "too many requests," "postgres is overloaded," "we're doing too many queries" — all map to the same concept: read bottleneck.

The loop does not confirm. It asks: *"What specifically is Postgres doing for every single redirect request?"*

The user can click the Postgres internals window:

```
CONNECTION POOL
████████████████████░░ 98/100 connections

ACTIVE QUERIES
SELECT url FROM urls WHERE short_code = ?
→ 47 waiting | 53 running | avg: 847ms
```

The loop: *"You have 100 connections and 47 queries waiting. Every user hitting a redirect is competing for a slot. What would reduce how often Postgres needs to answer this question?"*

**The fix**

The user types: *"cache the redirects so we don't hit the database every time"*

The loop recognizes cache-aside intent. Instead of applying it automatically, it asks: *"Where would you put the cache, and how long should a redirect be remembered?"*

The user drags a Redis node onto the diagram. A TTL slider appears. They set it to 5 minutes. The diagram wires itself — App Server now checks Redis before Postgres.

Metrics shift:

```
Redis hit ratio: 91% 🟢
DB CPU:          12% 🟢
p99 latency:     8ms  🟢
Error rate:      0%   🟢
```

**Five minutes later — Tier 2 begins**

The top URL's TTL expires. 14,000 simultaneous requests hit Postgres. The system breaks again. Differently this time.

The thundering herd. The user has to learn about TTL jitter. They did not read about it. They caused it.

---

## The Internals Windows

Every component is clickable. This is what makes concepts stick.

**Redis internals:**
```
KEYSPACE (Live)
abc123 → "google.com"    TTL: 4m 12s
xyz789 → "github.com"    TTL: 2m 04s

COMMANDS/SEC: 41k GET | 3k SET
HIT RATIO: ██████████████░░ 91%
MEMORY: 234MB / 512MB
```

**Postgres internals:**
```
CONNECTION POOL
████████████████████░░ 98/100 connections

ACTIVE QUERIES
SELECT url FROM urls WHERE short_code = ?
→ 47 waiting | avg wait: 847ms

INDEX USAGE
short_code_idx: 99.2% hit rate
Rows scanned per query: 1 (healthy)
```

**Cassandra LSM internals (when user swaps to NoSQL):**
```
WRITE PIPELINE
Commit log: ████ sequential writes
Memtable:   ███████░░░ 71% full → flush in ~2min
SSTables:   4 files → compaction triggered
Compaction: ██░░░░░░░░ I/O spike in progress
```

The user does not read about LSM trees. They watch their Cassandra instance flush a memtable and create an I/O spike that affects their write latency. They ask why. The loop explains.

---

## Scenario Catalog — Concept Map

Each scenario teaches a specific cluster of concepts. The system shown is the vehicle.

| Scenario | Vehicle | Concepts |
|---|---|---|
| **Caching** | URL Shortener | Cache-aside, TTL jitter, thundering herd, hot key, L1 local cache |
| **Write Scaling** | Pastebin / File Upload | Async queues, write decoupling, backpressure, dead letter queues |
| **Fan-out** | Twitter / Notifications | Fan-out on write vs read, write amplification, eventual consistency |
| **Rate Limiting** | API Gateway | Token bucket, sliding window, Redis atomic ops, distributed rate limiting |
| **Storage at Scale** | S3-like Blob Store | Presigned URLs, multipart upload, CDN edge caching, origin protection |
| **Stream Processing** | Analytics Pipeline | Kafka partitions, consumer groups, at-least-once delivery, offset management |
| **Search** | Job Board | Inverted index, relevance scoring, index refresh latency, sharding strategies |
| **Consistency** | Bank Transfer | Two-phase commit, saga pattern, idempotency keys, distributed transactions |

---

## Competitive Landscape

### What exists today

**hellointerview.com**
Best-in-class written content on system design. Theory lessons, technology overviews, problem breakdowns, guided practice. The definitive reference. No simulation layer. Users read about thundering herds. They do not cause them.

**systemdesignsimulator.org**
Animated diagrams with clickable components and a stress-test mode. Component swaps to compare architectures. Closest existing product to SystemCraft. Critical gap: metrics are animated, not real. Failure modes are illustrated, not experienced. No Socratic learning loop.

**Codemia**
"Practice system design like you practice DSA on Leetcode." AI-powered feedback, 40+ problems, mock interviews. Framing is right — active practice over passive reading. Execution is quiz-based. User selects answers from options. Does not manufacture the felt experience of a system failing.

**System Design School**
Interactive exercises with AI feedback from ex-FAANG engineers. Good content, static interaction model.

**Exponent / Educative**
Video-based, mock interview simulation. Human review. High quality, high cost, not scalable, no infrastructure simulation.

### The gap none of them fill

| Capability | hellointerview | systemdesignsimulator.org | Codemia | SystemCraft |
|---|---|---|---|---|
| Real running infrastructure | ✗ | ✗ | ✗ | ✅ |
| Failure you caused yourself | ✗ | ✗ | ✗ | ✅ |
| Socratic diagnosis loop | ✗ | ✗ | Partial | ✅ |
| Live internals windows | ✗ | Animated | ✗ | ✅ Real data |
| Concept-first catalog | ✗ | ✗ | ✗ | ✅ |
| Builds diagram from decisions | ✗ | ✗ | ✗ | ✅ |

### The defensible position

hellointerview has the best map. SystemCraft is the training ground. They are not competing — they are complementary. The natural partnership is: every ❌ on the SystemCraft scorecard links to the specific hellointerview article that covers that concept. Users fail in the sim, read the article, come back and win. That flywheel is the moat.

---

## Why Users Will Remember This

The research on learning retention is unambiguous. Passive reading produces 10-20% retention after one week. Active recall under pressure produces 60-80%. Emotionally significant events — the system you built failing in front of you — produce near-permanent encoding.

SystemCraft manufactures the emotional significance. You watched your own Postgres die. You caused the thundering herd. You fixed it with TTL jitter. You will never forget what TTL jitter is.

That is the product. Not content. Manufactured experience.

---

## Technical Architecture

### Infrastructure approach

Real Docker containers, toned down. A Postgres container with artificially constrained resources (0.3 CPU cores, 256MB RAM) fails at 5,000 synthetic requests the same way a real Postgres fails at 1 million real requests — because the failure mode is identical. Connection pool exhaustion does not care whether there are 5,000 users or 5 million. The causal chain is the same.

This is the key insight that makes real infrastructure affordable. We are not simulating scale. We are engineering specific failure modes at accessible load levels.

**LLM-assisted tuning:** The resource constraints are not discovered empirically through 30 test runs. They are generated by Claude Opus given a failure specification:

```
Target failure: connection pool exhaustion
Target traffic: ~3,000 req/s on the k6 dial
Failure should appear as: connections at max_connections,
queries queuing — NOT as CPU saturation
Desired curve: healthy 0-1500 req/s, degrading 1500-2500, broken 2500+
```

Opus works backwards from the failure spec to the exact Docker resource limits, Postgres config, and k6 parameters. One verification run. Minor correction if needed. Infrastructure tuned.

### Session architecture

Each user session gets an isolated namespace:
- Separate Docker Compose project name
- Separate Prometheus scrape target
- Separate metrics stream
- Session tears down automatically after 45 minutes or on explicit exit

Cost per session: approximately $0.08–0.15 at spot pricing. At 10,000 sessions per month: $800–1,500 in infrastructure. Viable at any reasonable price point.

### The Socratic loop

Runtime powered by LangGraph with Claude Opus as the reasoning model.

Each conversation turn:
1. Intent classifier (fine-tuned Llama 3.1 8B, local, ~50ms) maps user input to architecture state
2. Context payload assembled: current metrics, current architecture state, tier goal, concept target, conversation history
3. Claude Opus generates the Socratic response — next question, not explanation
4. If user is stuck (3+ turns without progress), hint system activates
5. If user identifies the concept correctly, tier advances

The intent classifier runs locally to handle high-frequency classification cheaply. The Opus call happens once per turn for the response — manageable cost per session.

### Tech stack

```
Frontend:    Next.js + Tailwind + React Flow + Recharts
Backend:     FastAPI (Python) — session orchestration, metrics pipeline
LLM:         Claude Opus API (Socratic loop) + Llama 3.1 8B local (classifier)
Infra:       Docker Compose — Postgres, Redis, LocalStack, k6, Prometheus
Monitoring:  Prometheus + custom SSE stream to frontend
Framework:   LangGraph (Socratic loop runtime)
```

---

## Build Plan — POC in 4 Weeks

### How it gets built

Claude Code acts as master orchestrator. It coordinates specialist AI agents, each the best available model for their specific task:

| Agent | Tool | Model | Task |
|---|---|---|---|
| Infra | Cursor/terminal | Gemini 2.5 Pro | Docker configs, k6 scripts, failure spec generation |
| Backend | Aider | GPT-4o | FastAPI, session manager, SSE metrics pipeline |
| Frontend scaffold | v0.dev | v0 proprietary | React component generation |
| Frontend wiring | Cursor | GPT-4o | API client, React Flow diagram, SSE hooks |
| Socratic loop | API | Claude Opus | Prompt engineering, state graph, intent mapping |
| Content | API | GPT-4o | Scenario copy, question banks, scorecard rubrics |
| QA | Scripts | Gemini Flash | Validation loops, regression detection |

### Week by week

**Week 1 — Foundations (parallel)**
- Contract.json written (you + Claude Code, 2 hours, never changes)
- Gemini generates all Docker Compose states for URL Shortener
- Claude Opus designs state graph + Socratic system prompt
- GPT-4o generates content spec JSON (scenarios, question banks)
- v0.dev scaffolds frontend components (one manual step)

**Week 2 — Core build (parallel)**
- GPT-4o via Aider builds FastAPI backend + SSE metrics pipeline
- GPT-4o wires frontend: React Flow diagram, live metrics panel
- Gemini generates k6 load scripts for all 4 tiers
- Session isolation implemented and tested

**Week 3 — Integration**
- Socratic loop wired to live session context
- Internals windows connected to real Redis INFO + pg_stat_activity
- Traffic dial connected to k6 virtual user count
- End-to-end flow working: boot → break → diagnose → fix

**Week 4 — Tuning + polish**
- Thundering herd triggered by actual TTL expiry on actual Redis key
- 20 full scenario run-throughs, failure mode verification
- LLM classifier tested on 50+ input variations
- Scorecard with concept gap identification
- Cost meter, tier progression, basic session management

### What you have at end of week 4

One polished scenario (URL Shortener, Tiers 1 and 2) that is genuinely demonstrable. Real infrastructure. Real failure modes. Working Socratic loop. Something you can sit any engineer in front of and have them learn something they will remember.

---

## The Pitch in Four Sentences

Engineers do not remember the articles they read. They remember the systems they broke. SystemCraft manufactures that experience — one concept at a time, inside real infrastructure, guided by a Socratic loop that teaches at the exact moment of failure. It is the only platform that provides both the training ground and the diagnosis, not just the map.

---

*SystemCraft — built for engineers who want to understand distributed systems, not just describe them.*
