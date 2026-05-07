import os
import random
import string
import time
from contextlib import asynccontextmanager

import psycopg2
import psycopg2.pool
import redis as redis_lib
from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/urlshortener")
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "20"))
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# TODO: TTL is fixed — all keys expire simultaneously. How would you stagger expiry?
CACHE_TTL = 300

pool: psycopg2.pool.ThreadedConnectionPool = None
redis_client: redis_lib.Redis = None

request_count = 0
request_errors = 0
cache_hits = 0
cache_misses = 0
latency_sum = 0.0
latency_count = 0


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool, redis_client
    pool = psycopg2.pool.ThreadedConnectionPool(minconn=5, maxconn=DB_POOL_SIZE, dsn=DATABASE_URL)
    redis_client = redis_lib.Redis.from_url(REDIS_URL, decode_responses=True)
    yield
    pool.closeall()


app = FastAPI(lifespan=lifespan)


class ShortenBody(BaseModel):
    url: str


@app.get("/health")
def health():
    hit_ratio = (cache_hits / (cache_hits + cache_misses) * 100) if (cache_hits + cache_misses) > 0 else 0
    return {"status": "ok", "cache_hit_ratio": round(hit_ratio, 1), "cache_ttl": CACHE_TTL}


@app.get("/r/{short_code}")
def redirect(short_code: str):
    global request_count, cache_hits, cache_misses, latency_sum, latency_count
    request_count += 1
    t0 = time.time()

    cached = redis_client.get(short_code)
    if cached:
        cache_hits += 1
        latency_sum += time.time() - t0
        latency_count += 1
        return {"long_url": cached, "short_code": short_code, "cache": "hit"}

    cache_misses += 1
    conn = None
    try:
        conn = pool.getconn()
        cur = conn.cursor()
        cur.execute("SELECT long_url FROM urls WHERE short_code = %s", (short_code,))
        row = cur.fetchone()
        cur.close()
        if not row:
            raise HTTPException(status_code=404, detail="not found")
        ttl = CACHE_TTL  # every key gets identical TTL → thundering herd on expiry
        redis_client.setex(short_code, ttl, row[0])
        return {"long_url": row[0], "short_code": short_code, "cache": "miss"}
    except HTTPException:
        raise
    except Exception as e:
        request_errors += 1
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        latency_sum += time.time() - t0
        latency_count += 1
        if conn:
            pool.putconn(conn)


@app.post("/shorten")
def shorten(body: ShortenBody):
    short_code = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    conn = None
    try:
        conn = pool.getconn()
        cur = conn.cursor()
        cur.execute("INSERT INTO urls (short_code, long_url) VALUES (%s, %s) ON CONFLICT DO NOTHING", (short_code, body.url))
        conn.commit()
        cur.close()
        return {"short_code": short_code, "short_url": f"http://localhost:8080/r/{short_code}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            pool.putconn(conn)


@app.get("/metrics", response_class=PlainTextResponse)
def metrics():
    avg_latency = (latency_sum / latency_count) if latency_count > 0 else 0
    total_cache = cache_hits + cache_misses
    hit_ratio = (cache_hits / total_cache) if total_cache > 0 else 0
    redis_mem_mb = 0
    redis_hit_ratio_server = None
    try:
        info = redis_client.info("memory")
        redis_mem_mb = info.get("used_memory", 0) / (1024 * 1024)
        stats = redis_client.info("stats")
        h = int(stats.get("keyspace_hits", 0))
        m = int(stats.get("keyspace_misses", 0))
        if h + m > 0:
            redis_hit_ratio_server = h / (h + m)
    except Exception:
        pass
    db_active = 0
    db_waiting = 0
    try:
        conn = pool.getconn()
        cur = conn.cursor()
        cur.execute("SELECT count(*) FROM pg_stat_activity WHERE state='active' AND pid != pg_backend_pid()")
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
        f"cache_hit_ratio {hit_ratio:.4f}",
        f"redis_memory_used_mb {redis_mem_mb:.2f}",
        f"db_connections_active {db_active}",
        f"db_connections_waiting {db_waiting}",
    ]
    if redis_hit_ratio_server is not None:
        lines.append(f"redis_hit_ratio_server {redis_hit_ratio_server:.4f}")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
