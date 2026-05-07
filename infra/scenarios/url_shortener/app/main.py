import logging
import os
import random
import string
import time
from collections import deque
from contextlib import asynccontextmanager

import psycopg2
import psycopg2.pool
from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

try:
    import redis as redis_lib
except ImportError:
    redis_lib = None

LOG_BUFFER = deque(maxlen=500)


class BufferHandler(logging.Handler):
    def emit(self, record):
        LOG_BUFFER.append({
            "ts": record.created,
            "t": self.format(record),
            "level": record.levelname,
        })


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("urlshortener")
log.setLevel(logging.DEBUG)
LOG_SAMPLE_RATE = int(os.getenv("LOG_SAMPLE_RATE", "20"))
_bh = BufferHandler()
_bh.setLevel(logging.DEBUG)
_bh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S"))
log.addHandler(_bh)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/urlshortener")
# TODO: DB_POOL_SIZE=18 with max_connections=20 — what happens when all 18 slots are taken?
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "18"))
REDIS_URL = os.getenv("REDIS_URL", "")
# TODO: Fixed TTL — all keys expire simultaneously. How would you stagger expiry?
CACHE_TTL = int(os.getenv("CACHE_TTL", "300"))
HOT_KEY = os.getenv("HOT_KEY", "")

pool = None
redis_client = None

request_count = 0
request_errors = 0
cache_hits = 0
cache_misses = 0
hot_key_count = 0
latency_sum = 0.0
latency_count = 0


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool, redis_client
    log.info("=== URL Shortener starting ===")
    log.info("  DB_POOL_SIZE=%d  DATABASE=%s", DB_POOL_SIZE, DATABASE_URL.split("@")[-1])
    log.info("  REDIS_URL=%s  CACHE_TTL=%ds  HOT_KEY=%s", REDIS_URL or "(disabled)", CACHE_TTL, HOT_KEY or "(none)")
    pool = psycopg2.pool.ThreadedConnectionPool(minconn=5, maxconn=DB_POOL_SIZE, dsn=DATABASE_URL)
    log.info("  Postgres pool ready: min=%d max=%d", 5, DB_POOL_SIZE)
    if REDIS_URL and redis_lib:
        redis_client = redis_lib.Redis.from_url(REDIS_URL, decode_responses=True)
        log.info("  Redis connected: ping=%s", redis_client.ping())
        if HOT_KEY:
            redis_client.setex(HOT_KEY, CACHE_TTL, "https://viral-content.example.com/trending")
            log.info("  Hot key '%s' pre-seeded (TTL=%ds)", HOT_KEY, CACHE_TTL)
    else:
        log.info("  Redis: disabled (no REDIS_URL)")
    log.info("=== Ready to serve ===")
    yield
    log.info("Shutting down — closing pool")
    pool.closeall()


app = FastAPI(lifespan=lifespan)


class ShortenBody(BaseModel):
    url: str


@app.get("/health")
def health():
    resp = {"status": "ok", "pool_size": DB_POOL_SIZE, "pool_min": pool.minconn if pool else 0}
    if redis_client:
        total = cache_hits + cache_misses
        resp["cache_hit_ratio"] = round((cache_hits / total * 100) if total > 0 else 0, 1)
        resp["cache_ttl"] = CACHE_TTL
    if HOT_KEY:
        resp["hot_key"] = HOT_KEY
        resp["hot_key_requests"] = hot_key_count
        resp["hot_key_pct"] = round(hot_key_count / max(request_count, 1) * 100, 1)
    return resp


@app.get("/r/{short_code}")
def redirect(short_code: str):
    global request_count, request_errors, cache_hits, cache_misses, hot_key_count, latency_sum, latency_count
    request_count += 1
    t0 = time.time()

    if HOT_KEY and short_code == HOT_KEY:
        hot_key_count += 1

    if redis_client:
        # TODO: Hot key hits Redis single-threaded CPU. Add local L1 in-process cache for top keys.
        cached = redis_client.get(short_code)
        if cached:
            cache_hits += 1
            elapsed = time.time() - t0
            latency_sum += elapsed
            latency_count += 1
            if request_count % LOG_SAMPLE_RATE == 0:
                log.info("GET /r/%s  cache=HIT  %.1fms", short_code, elapsed * 1000)
            return {"long_url": cached, "short_code": short_code, "cache": "hit"}
        cache_misses += 1

    conn = None
    try:
        pool_used = DB_POOL_SIZE - (pool._pool.__len__() if pool else 0)
        conn = pool.getconn()
        cur = conn.cursor()
        cur.execute("SELECT long_url FROM urls WHERE short_code = %s", (short_code,))
        row = cur.fetchone()
        cur.close()
        if not row:
            log.warning("GET /r/%s  404 not found", short_code)
            raise HTTPException(status_code=404, detail="not found")
        if redis_client:
            ttl = CACHE_TTL  # every key gets identical TTL → thundering herd on expiry
            redis_client.setex(short_code, ttl, row[0])
        elapsed = time.time() - t0
        if elapsed > 0.1:
            log.warning("SLOW GET /r/%s  %.0fms  pool=%d/%d  cache=%s",
                        short_code, elapsed * 1000, pool_used, DB_POOL_SIZE,
                        "miss" if redis_client else "none")
        elif request_count % LOG_SAMPLE_RATE == 0:
            log.info("GET /r/%s  %.1fms  pool=%d/%d  cache=%s",
                     short_code, elapsed * 1000, pool_used, DB_POOL_SIZE,
                     "miss" if redis_client else "none")
        return {"long_url": row[0], "short_code": short_code, "cache": "miss" if redis_client else "none"}
    except HTTPException:
        raise
    except Exception as e:
        request_errors += 1
        log.error("GET /r/%s  FAILED: %s  pool=%d/%d", short_code, e,
                  DB_POOL_SIZE - (pool._pool.__len__() if pool else 0), DB_POOL_SIZE)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        elapsed = time.time() - t0
        latency_sum += elapsed
        latency_count += 1
        if conn:
            pool.putconn(conn)
        if request_count % 200 == 0:
            avg_ms = (latency_sum / latency_count * 1000) if latency_count > 0 else 0
            log.info("req #%d  avg=%.1fms  hits=%d  misses=%d  errs=%d  pool=%d/%d",
                     request_count, avg_ms, cache_hits, cache_misses, request_errors,
                     DB_POOL_SIZE - (pool._pool.__len__() if pool else 0), DB_POOL_SIZE)


@app.post("/shorten")
def shorten(body: ShortenBody):
    global request_count
    request_count += 1
    short_code = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    conn = None
    try:
        conn = pool.getconn()
        cur = conn.cursor()
        cur.execute("INSERT INTO urls (short_code, long_url) VALUES (%s, %s) ON CONFLICT DO NOTHING", (short_code, body.url))
        conn.commit()
        cur.close()
        log.info("POST /shorten  code=%s  url=%.60s", short_code, body.url)
        return {"short_code": short_code, "short_url": f"http://localhost:8080/r/{short_code}"}
    except Exception as e:
        log.error("POST /shorten  FAILED: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            pool.putconn(conn)


@app.get("/metrics", response_class=PlainTextResponse)
def metrics():
    avg_latency = (latency_sum / latency_count) if latency_count > 0 else 0
    pool_used = DB_POOL_SIZE - (pool._pool.__len__() if pool else 0)

    db_active = 0
    db_waiting = 0
    try:
        conn = pool.getconn()
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM pg_stat_activity WHERE state='active'")
        db_active = cur.fetchone()[0]
        cur.execute("SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock'")
        db_waiting = cur.fetchone()[0]
        cur.close()
        pool.putconn(conn)
    except Exception:
        pass

    lines = [
        f"http_requests_total {request_count}",
        f"http_request_errors_total {request_errors}",
        f"http_request_latency_seconds {avg_latency:.4f}",
        f"db_pool_connections_used {pool_used}",
        f"db_pool_size {DB_POOL_SIZE}",
        f"db_connections_active {db_active}",
        f"db_connections_waiting {db_waiting}",
    ]

    if redis_client:
        total_cache = cache_hits + cache_misses
        hit_ratio = (cache_hits / total_cache) if total_cache > 0 else 0
        redis_mem_mb = 0
        redis_cpu = 0
        redis_hit_ratio_server = None
        try:
            info = redis_client.info("memory")
            redis_mem_mb = info.get("used_memory", 0) / (1024 * 1024)
            stats = redis_client.info("stats")
            h = int(stats.get("keyspace_hits", 0))
            m = int(stats.get("keyspace_misses", 0))
            if h + m > 0:
                redis_hit_ratio_server = h / (h + m)
            if HOT_KEY:
                cpu_info = redis_client.info("cpu")
                redis_cpu = cpu_info.get("used_cpu_sys", 0)
        except Exception:
            pass
        lines.extend([
            f"cache_hit_ratio {hit_ratio:.4f}",
            f"cache_ttl_seconds {CACHE_TTL}",
            f"redis_memory_used_mb {redis_mem_mb:.2f}",
        ])
        if HOT_KEY:
            lines.extend([
                f"hot_key_requests_total {hot_key_count}",
                f"redis_cpu_sys {redis_cpu:.4f}",
            ])
        if redis_hit_ratio_server is not None:
            lines.append(f"redis_hit_ratio_server {redis_hit_ratio_server:.4f}")

    return "\n".join(lines) + "\n"


@app.get("/logs")
def get_logs(since: float = 0, limit: int = 100):
    entries = [e for e in LOG_BUFFER if e["ts"] > since]
    return {"logs": entries[-limit:], "total": len(LOG_BUFFER)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
