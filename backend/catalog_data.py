SHELVES = [
    {
        "id": "caching",
        "title": "Caching",
        "sub": "Read-path scaling — when one slow query melts the database",
        "concepts": [
            {"slug": "cache-aside", "title": "Cache-Aside Pattern", "desc": "App misses cache → reads DB → writes back. The default read pattern.", "tier": "T1", "stack": ["redis", "postgres"], "scenario": "url_shortener", "state": "state0_baseline", "vehicle": "URL Shortener"},
            {"slug": "thundering-herd", "title": "Thundering Herd", "desc": "TTLs expire in lockstep. 500 requests slam Postgres at the same instant.", "tier": "T2", "stack": ["redis", "ttl-jitter"], "scenario": "url_shortener", "state": "state2_thundering_herd", "vehicle": "URL Shortener"},
            {"slug": "hot-key", "title": "Hot Key Problem", "desc": "One viral key gets 80% of traffic. Redis CPU saturates a single core.", "tier": "T3", "stack": ["redis", "l1-cache"], "scenario": "url_shortener", "state": "state3_hotkey", "vehicle": "URL Shortener"},
            {"slug": "connection-pool-exhaustion", "title": "Connection Pool Exhaustion", "desc": "max_connections saturated. Requests queue. CPU stays calm.", "tier": "T1", "stack": ["postgres"], "scenario": "url_shortener", "state": "state0_baseline", "vehicle": "URL Shortener"},
        ],
    },
    {
        "id": "writes",
        "title": "Write Scaling",
        "sub": "Decouple the hot path. Move heavy writes off the request thread.",
        "concepts": [
            {"slug": "async-queues", "title": "Async Queues", "desc": "Accept → enqueue → 202. Workers drain. Decouple latency from throughput.", "tier": "T1", "stack": ["redis", "queue"], "scenario": "write_scaling", "state": "state1_queue", "vehicle": "Pastebin"},
            {"slug": "lsm-tree", "title": "LSM Tree & Compaction", "desc": "Memtable flush → SSTable → compaction I/O spike. The Cassandra story.", "tier": "T2", "stack": ["cassandra"], "scenario": "write_scaling", "state": "state2_cassandra", "vehicle": "Pastebin"},
            {"slug": "backpressure", "title": "Backpressure", "desc": "Queue fills past threshold. Producer slows. The system stays alive.", "tier": "T3", "stack": ["queues"], "scenario": "write_scaling", "state": "state3_backpressure", "vehicle": "Pastebin"},
            {"slug": "fan-out-on-write", "title": "Fan-out on Write vs Read", "desc": "Pre-push to N inboxes vs pull at read time. Latency vs storage tradeoff.", "tier": "T2", "stack": ["redis"], "scenario": "fan_out", "state": "state0_baseline", "vehicle": "Notifications"},
        ],
    },
    {
        "id": "rate-limiting",
        "title": "Rate Limiting",
        "sub": "Atomic counters, sliding windows, distributed coordination.",
        "concepts": [
            {"slug": "token-bucket", "title": "Token Bucket", "desc": "Atomic DECR + TTL. Smooth bursty clients without blocking sustained load.", "tier": "T1", "stack": ["redis"], "scenario": "rate_limiting", "state": "state1_token_bucket", "vehicle": "API Gateway"},
            {"slug": "sliding-window", "title": "Sliding Window", "desc": "Sorted set of timestamps. No fixed-window edge artifacts.", "tier": "T2", "stack": ["redis"], "scenario": "rate_limiting", "state": "state2_sliding_window", "vehicle": "API Gateway"},
            {"slug": "distributed-rate-limiting", "title": "Distributed Rate Limiting", "desc": "Multiple gateway nodes. Lua script for atomic check-and-decrement.", "tier": "T3", "stack": ["redis", "lua"], "scenario": "rate_limiting", "state": "state3_distributed", "vehicle": "API Gateway"},
        ],
    },
    {
        "id": "stream",
        "title": "Stream Processing",
        "sub": "Partitions, consumer groups, offset management.",
        "concepts": [
            {"slug": "kafka-partitions", "title": "Kafka Partitions", "desc": "Consumer groups divide partitions. Parallelism = partition count ceiling.", "tier": "T1", "stack": ["kafka"], "scenario": "stream_proc", "state": "state0_baseline", "vehicle": "Analytics Pipeline"},
            {"slug": "at-least-once-delivery", "title": "At-Least-Once Delivery", "desc": "Retries duplicate messages. Idempotency keys downstream.", "tier": "T2", "stack": ["kafka"], "scenario": "stream_proc", "state": "state2_at_least_once", "vehicle": "Analytics Pipeline"},
            {"slug": "offset-management", "title": "Consumer Lag", "desc": "Lag spikes during partition rebalance. Slow consumers fall behind.", "tier": "T3", "stack": ["kafka"], "scenario": "stream_proc", "state": "state3_consumer_lag", "vehicle": "Analytics Pipeline"},
        ],
    },
    {
        "id": "search",
        "title": "Search",
        "sub": "Inverted indexes, relevance scoring, refresh lag.",
        "concepts": [
            {"slug": "inverted-index", "title": "Inverted Index", "desc": "Terms map to doc IDs. Refresh interval = write-to-read delay.", "tier": "T1", "stack": ["elasticsearch"], "scenario": "search", "state": "state1_es_basic", "vehicle": "Job Board"},
            {"slug": "relevance-scoring", "title": "Relevance Scoring (BM25)", "desc": "TF-IDF weighting determines result order. Tune for your domain.", "tier": "T2", "stack": ["elasticsearch"], "scenario": "search", "state": "state2_scoring", "vehicle": "Job Board"},
            {"slug": "shard-routing", "title": "Shard Routing & Hot Spots", "desc": "Uneven key distribution overloads specific shards.", "tier": "T3", "stack": ["elasticsearch"], "scenario": "search", "state": "state3_shard_routing", "vehicle": "Job Board"},
        ],
    },
    {
        "id": "consistency",
        "title": "Consistency",
        "sub": "Distributed transactions when atomicity matters.",
        "concepts": [
            {"slug": "two-phase-commit", "title": "Two-Phase Commit", "desc": "Coordinator + prepare + commit. Blocks indefinitely on coordinator failure.", "tier": "T1", "stack": ["postgres"], "scenario": "consistency", "state": "state1_2pc", "vehicle": "Bank Transfer"},
            {"slug": "saga-pattern", "title": "Saga Pattern", "desc": "Local transactions + compensating rollbacks. No global lock.", "tier": "T2", "stack": ["postgres"], "scenario": "consistency", "state": "state2_saga", "vehicle": "Bank Transfer"},
            {"slug": "idempotency-keys", "title": "Idempotency Keys", "desc": "Server dedupes by client-supplied key. Safe retries.", "tier": "T3", "stack": ["api"], "scenario": "consistency", "state": "state3_idempotency", "vehicle": "Bank Transfer"},
        ],
    },
    {
        "id": "storage",
        "title": "Storage at Scale",
        "sub": "Get the blob off your application server.",
        "concepts": [
            {"slug": "presigned-urls", "title": "Presigned URLs", "desc": "Client uploads direct to S3. App server never touches the blob.", "tier": "T1", "stack": ["s3"], "scenario": "blob_store", "state": "state1_presigned", "vehicle": "Blob Store"},
            {"slug": "multipart-upload", "title": "Multipart Upload", "desc": "Split → parallel parts → server assembles. Resumable.", "tier": "T2", "stack": ["s3"], "scenario": "blob_store", "state": "state2_multipart", "vehicle": "Blob Store"},
        ],
    },
]

SCENARIOS = [
    {"num": "01", "id": "url_shortener", "name": "URL Shortener", "vehicle": "Read-heavy caching patterns under viral traffic", "stack": ["postgres", "redis"], "states": 4, "target": "cache-aside"},
    {"num": "02", "id": "write_scaling", "name": "Pastebin / File Upload", "vehicle": "Write-heavy scaling — async queues, LSM trees, backpressure", "stack": ["postgres", "redis", "cassandra"], "states": 4, "target": "async-queues"},
    {"num": "03", "id": "fan_out", "name": "Notifications / Twitter", "vehicle": "Fan-out trade-offs and eventual consistency", "stack": ["postgres", "redis"], "states": 3, "target": "fan-out-on-write"},
    {"num": "04", "id": "rate_limiting", "name": "API Gateway", "vehicle": "Rate limiting — token bucket, sliding window, distributed", "stack": ["redis"], "states": 4, "target": "token-bucket"},
    {"num": "05", "id": "blob_store", "name": "S3-like Blob Store", "vehicle": "Storage at scale — presigned URLs, multipart, CDN", "stack": ["s3", "postgres"], "states": 4, "target": "presigned-urls"},
    {"num": "06", "id": "stream_proc", "name": "Analytics Pipeline", "vehicle": "Stream processing — Kafka partitions, consumers, offsets", "stack": ["kafka", "postgres"], "states": 4, "target": "kafka-partitions"},
    {"num": "07", "id": "search", "name": "Job Board", "vehicle": "Search — inverted index, BM25 scoring, shard routing", "stack": ["elasticsearch", "postgres"], "states": 4, "target": "inverted-index"},
    {"num": "08", "id": "consistency", "name": "Bank Transfer", "vehicle": "Distributed consistency — 2PC, sagas, idempotency", "stack": ["postgres"], "states": 3, "target": "two-phase-commit"},
]

TECHNOLOGIES = [
    {"id": "redis", "name": "Redis", "emoji": "⚡", "color": "#dc2626", "tagline": "In-memory key-value. Caching, pub/sub, Lua atomic ops.", "facts": ["Single-threaded — one hot key saturates an entire core", "RESP protocol handles ~100k ops/sec per CPU core", "SETEX + Lua scripts for atomic check-and-decrement"], "concepts": ["cache-aside", "thundering-herd", "hot-key", "token-bucket", "sliding-window", "fan-out-on-write"], "launchSlug": "cache-aside", "scenario": "url_shortener"},
    {"id": "kafka", "name": "Apache Kafka", "emoji": "🌊", "color": "#2563eb", "tagline": "Distributed commit log. Partitions = parallelism ceiling.", "facts": ["Consumers per group ≤ partition count — extra consumers idle", "Consumer group rebalance triggers a lag spike every time", "Committing offsets after processing = at-least-once delivery"], "concepts": ["kafka-partitions", "at-least-once-delivery", "offset-management"], "launchSlug": "kafka-partitions", "scenario": "stream_proc"},
    {"id": "postgres", "name": "PostgreSQL", "emoji": "🐘", "color": "#0369a1", "tagline": "MVCC + B-tree indexes. Pool exhaustion shows up before CPU.", "facts": ["max_connections is hard process limit — pgBouncer sits in front", "EXPLAIN ANALYZE: seq scan vs index scan shows the bottleneck", "VACUUM required for dead tuple reclaim after heavy deletes"], "concepts": ["connection-pool-exhaustion", "two-phase-commit", "saga-pattern", "idempotency-keys"], "launchSlug": "connection-pool-exhaustion", "scenario": "url_shortener"},
    {"id": "cassandra", "name": "Cassandra", "emoji": "💎", "color": "#7c3aed", "tagline": "LSM trees. Write path: memtable → SSTable → compaction storm.", "facts": ["Writes always land in memtable first — fast by design", "Compaction merges SSTables periodically — I/O spike is expected", "Tunable consistency: ONE / QUORUM / ALL per operation"], "concepts": ["lsm-tree", "backpressure"], "launchSlug": "lsm-tree", "scenario": "write_scaling"},
    {"id": "elasticsearch", "name": "Elasticsearch", "emoji": "🔍", "color": "#059669", "tagline": "Inverted index + BM25. Refresh interval = write-to-read lag.", "facts": ["Shards are immutable — plan count before indexing, you cannot split later", "Default refresh_interval=1s means 1s write-to-search latency", "BM25 scoring weights by TF-IDF across all shards"], "concepts": ["inverted-index", "relevance-scoring", "shard-routing"], "launchSlug": "inverted-index", "scenario": "search"},
    {"id": "s3", "name": "S3 / Object Store", "emoji": "🪣", "color": "#d97706", "tagline": "Get blobs off your app server. Presigned URLs + multipart.", "facts": ["Presigned URL = time-limited auth token for direct client upload", "Multipart parts must be ≥5MB each, parallelizable across threads", "Block direct S3 access — route everything through signed URLs"], "concepts": ["presigned-urls", "multipart-upload"], "launchSlug": "presigned-urls", "scenario": "blob_store"},
]

ALL_CONCEPTS = [c for shelf in SHELVES for c in shelf["concepts"]]
