import os
import random
import string
import time
from contextlib import asynccontextmanager

import psycopg2
import psycopg2.pool
from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/urlshortener")
# TODO: DB_POOL_SIZE=95 with max_connections=100 — what happens when all 95 slots are taken?
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "95"))

pool: psycopg2.pool.ThreadedConnectionPool = None

request_count = 0
request_errors = 0
latency_sum = 0.0
latency_count = 0


@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool
    pool = psycopg2.pool.ThreadedConnectionPool(minconn=5, maxconn=DB_POOL_SIZE, dsn=DATABASE_URL)
    yield
    pool.closeall()


app = FastAPI(lifespan=lifespan)


def get_conn():
    return pool.getconn()


def put_conn(conn):
    pool.putconn(conn)


class ShortenBody(BaseModel):
    url: str


@app.get("/health")
def health():
    return {"status": "ok", "pool_size": DB_POOL_SIZE, "pool_min": pool.minconn if pool else 0}


@app.get("/r/{short_code}")
def redirect(short_code: str):
    global request_count, request_errors, latency_sum, latency_count
    request_count += 1
    t0 = time.time()
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT long_url FROM urls WHERE short_code = %s", (short_code,))
        row = cur.fetchone()
        cur.close()
        if not row:
            raise HTTPException(status_code=404, detail="not found")
        return {"long_url": row[0], "short_code": short_code}
    except HTTPException:
        raise
    except Exception as e:
        request_errors += 1
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        elapsed = time.time() - t0
        latency_sum += elapsed
        latency_count += 1
        if conn:
            put_conn(conn)


@app.post("/shorten")
def shorten(body: ShortenBody):
    global request_count
    request_count += 1
    short_code = "".join(random.choices(string.ascii_lowercase + string.digits, k=6))
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("INSERT INTO urls (short_code, long_url) VALUES (%s, %s) ON CONFLICT DO NOTHING", (short_code, body.url))
        conn.commit()
        cur.close()
        return {"short_code": short_code, "short_url": f"http://localhost:8080/r/{short_code}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            put_conn(conn)


@app.get("/metrics", response_class=PlainTextResponse)
def metrics():
    avg_latency = (latency_sum / latency_count) if latency_count > 0 else 0
    pool_used = DB_POOL_SIZE - (pool._pool.__len__() if pool else 0)
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
    return (
        f"http_requests_total {request_count}\n"
        f"http_request_errors_total {request_errors}\n"
        f"http_request_latency_seconds {avg_latency:.4f}\n"
        f"db_pool_connections_used {pool_used}\n"
        f"db_pool_size {DB_POOL_SIZE}\n"
        f"db_connections_active {db_active}\n"
        f"db_connections_waiting {db_waiting}\n"
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
