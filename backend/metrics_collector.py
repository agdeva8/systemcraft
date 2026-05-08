import asyncio
import logging
import re
import time
from typing import Optional

logger = logging.getLogger(__name__)

_prev: dict = {}  # project → {total, errors, ts}


async def _exec(args: list[str], timeout: float = 5.0) -> Optional[str]:
    try:
        proc = await asyncio.create_subprocess_exec(
            *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        if proc.returncode != 0:
            logger.debug("cmd failed %s: %s", args[:3], stderr.decode()[:200])
            return None
        return stdout.decode()
    except asyncio.TimeoutError:
        logger.debug("cmd timeout: %s", args[:3])
        return None
    except Exception as e:
        logger.debug("cmd error %s: %s", args[:3], e)
        return None


async def get_app_port(project: str) -> Optional[int]:
    out = await _exec(["docker", "port", f"{project}-app-1", "8080"])
    if not out:
        return None
    m = re.search(r":(\d+)", out.strip().split("\n")[0])
    return int(m.group(1)) if m else None


def _parse_prometheus(text: str) -> dict:
    result = {}
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) >= 2:
            try:
                result[parts[0]] = float(parts[1])
            except ValueError:
                pass
    return result


def _parse_redis_info(text: str) -> dict:
    result = {}
    for line in text.splitlines():
        line = line.strip()
        if ":" in line and not line.startswith("#"):
            k, _, v = line.partition(":")
            result[k.strip()] = v.strip()
    return result


async def get_container_cpu(project: str, service: str) -> Optional[float]:
    out = await _exec([
        "docker", "stats", f"{project}-{service}-1",
        "--no-stream", "--format", "{{.CPUPerc}}"
    ])
    if not out:
        return None
    try:
        return float(out.strip().rstrip("%"))
    except ValueError:
        return None


async def collect(project: str) -> dict:
    ts = int(time.time() * 1000)

    port = await get_app_port(project)
    if port is None:
        return {"error": "containers not ready", "ts": ts}

    raw, db_cpu, app_cpu = await asyncio.gather(
        _exec(["curl", "-sf", f"http://localhost:{port}/metrics"]),
        get_container_cpu(project, "postgres"),
        get_container_cpu(project, "app"),
    )

    if not raw:
        return {"error": "app metrics unreachable", "ts": ts}

    m = _parse_prometheus(raw)
    latency_s = m.get("http_request_latency_seconds", 0)

    total_count = m.get("http_requests_total", 0) or 0
    error_count = m.get("http_request_errors_total", 0) or 0

    prev = _prev.get(project)
    if prev is None:
        rps = 0
        error_rate = 0.0
    else:
        elapsed = (ts - prev["ts"]) / 1000.0
        delta_total = max(0, total_count - prev["total"])
        delta_errors = max(0, error_count - prev["errors"])
        if elapsed > 0 and delta_total > 0:
            rps = int(delta_total / elapsed)
            error_rate = round((delta_errors / delta_total) * 100, 2)
        else:
            rps = 0
            error_rate = 0.0
    _prev[project] = {"total": total_count, "errors": error_count, "ts": ts}

    db_active = None
    db_waiting = None
    db_pool_size = None
    db_pool_used = None
    raw_active = m.get("db_connections_active")
    raw_waiting = m.get("db_connections_waiting")
    raw_pool_size = m.get("db_pool_size")
    raw_pool_used = m.get("db_pool_connections_used")
    if raw_active is not None:
        db_active = int(raw_active)
    if raw_waiting is not None:
        db_waiting = int(raw_waiting)
    if raw_pool_size is not None:
        db_pool_size = int(raw_pool_size)
    if raw_pool_used is not None:
        db_pool_used = int(raw_pool_used)

    hit_ratio_raw = m.get("cache_hit_ratio")
    redis_hit_ratio = round(hit_ratio_raw * 100, 1) if hit_ratio_raw is not None else None
    redis_mem = m.get("redis_memory_used_mb")
    redis_memory_mb = round(redis_mem, 1) if redis_mem is not None else None

    return {
        "ts": ts,
        "latency_p99": round(latency_s * 1000, 1),
        "error_rate": error_rate,
        "db_cpu": db_cpu,
        "db_connections_active": db_active,
        "db_connections_waiting": db_waiting,
        "db_pool_size": db_pool_size,
        "db_pool_used": db_pool_used,
        "redis_hit_ratio": redis_hit_ratio,
        "redis_memory_mb": redis_memory_mb,
        "app_cpu": app_cpu,
        "rps": rps,
    }


async def postgres_internals(project: str) -> dict:
    container = f"{project}-postgres-1"
    psql = ["docker", "exec", container, "psql", "-U", "postgres", "-d", "urlshortener", "-t", "-c"]

    active_out, waiting_out, max_out, queries_out, hit_rate_out, db_cpu = await asyncio.gather(
        _exec(psql + ["SELECT count(*) FROM pg_stat_activity WHERE state='active';"]),
        _exec(psql + ["SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock';"]),
        _exec(psql + ["SHOW max_connections;"]),
        _exec(psql + [
            "SELECT query, count(*), round(avg(extract(epoch from now()-query_start)*1000)::numeric,1) as avg_ms "
            "FROM pg_stat_activity WHERE state='active' AND query NOT LIKE '%pg_stat%' "
            "GROUP BY query ORDER BY count DESC LIMIT 5;"
        ]),
        _exec(psql + [
            "SELECT round(sum(heap_blks_hit)::numeric / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 4) "
            "FROM pg_statio_user_tables;"
        ]),
        get_container_cpu(project, "postgres"),
    )

    if active_out is None:
        return {"error": "postgres unreachable"}

    def safe_int(s, default=None):
        try:
            return int(s.strip()) if s else default
        except (ValueError, AttributeError):
            return default

    def safe_float(s, default=None):
        try:
            return float(s.strip()) if s else default
        except (ValueError, AttributeError):
            return default

    queries = []
    if queries_out:
        for line in queries_out.strip().splitlines():
            parts = [p.strip() for p in line.split("|")]
            if len(parts) >= 3:
                try:
                    queries.append({"query": parts[0], "count": int(parts[1]), "avg_ms": float(parts[2])})
                except (ValueError, IndexError):
                    pass

    return {
        "connections": {"active": safe_int(active_out), "waiting": safe_int(waiting_out, 0), "max": safe_int(max_out, 100)},
        "active_queries": queries,
        "cpu_percent": db_cpu,
        "index_hit_rate": safe_float(hit_rate_out),
    }


async def redis_internals(project: str) -> dict:
    out = await _exec(["docker", "exec", f"{project}-redis-1", "redis-cli", "INFO", "all"])
    if not out:
        return {"available": False, "error": "redis unreachable or not running"}

    info = _parse_redis_info(out)
    hits = int(info.get("keyspace_hits", 0))
    misses = int(info.get("keyspace_misses", 0))
    total = hits + misses
    hit_ratio = hits / total * 100 if total > 0 else None

    keyspace_out = await _exec(["docker", "exec", f"{project}-redis-1", "redis-cli", "KEYS", "*"])
    keys = []
    if keyspace_out:
        for k in keyspace_out.strip().splitlines()[:10]:
            k = k.strip()
            if k:
                ttl_out = await _exec(["docker", "exec", f"{project}-redis-1", "redis-cli", "TTL", k])
                ttl = int(ttl_out.strip()) if ttl_out and ttl_out.strip().lstrip("-").isdigit() else -1
                keys.append({"key": k, "ttl_seconds": ttl})

    mem_limit_out = await _exec(["docker", "exec", f"{project}-redis-1", "redis-cli", "CONFIG", "GET", "maxmemory"])
    mem_limit_mb = 64
    if mem_limit_out:
        lines = mem_limit_out.strip().splitlines()
        if len(lines) >= 2:
            try:
                mem_limit_mb = round(int(lines[1]) / 1_048_576, 1)
            except (ValueError, IndexError):
                pass

    return {
        "available": True,
        "keyspace": keys,
        "commands_per_sec": {
            "get": float(info.get("instantaneous_ops_per_sec", 0)),
            "set": 0,
        },
        "hit_ratio": round(hit_ratio, 1) if hit_ratio is not None else None,
        "memory_used_mb": round(int(info.get("used_memory", 0)) / 1_048_576, 1),
        "memory_limit_mb": mem_limit_mb,
    }
