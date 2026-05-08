import asyncio
import json
import os
import time
import uuid
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

import anthropic
import docker
import httpx
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from catalog_data import ALL_CONCEPTS, SCENARIOS, SHELVES, TECHNOLOGIES
from session_manager import SessionManager, VU_SCALE_FACTOR, MAX_ACTUAL_VUS, RPS_PER_VU
import metrics_collector as mc

from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app):
    await session_manager.startup()
    await session_manager.start_cleanup_loop()
    yield


app = FastAPI(title="SystemCraft API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

session_manager = SessionManager()

SOCRATIC_PROMPT_PATH = Path(__file__).parent.parent / "llm" / "socratic_system_prompt.txt"
_socratic_prompt: Optional[str] = None

AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_BASE_URL = os.getenv("AI_BASE_URL", "https://integrate.api.nvidia.com/v1")
AI_MODEL = os.getenv("AI_MODEL", "qwen/qwen3-coder-480b-a35b-instruct")


def get_socratic_prompt() -> str:
    global _socratic_prompt
    if _socratic_prompt is None:
        if SOCRATIC_PROMPT_PATH.exists():
            _socratic_prompt = SOCRATIC_PROMPT_PATH.read_text()
        else:
            _socratic_prompt = (
                "You are a Socratic tutor for distributed systems. "
                "Ask exactly one question per response. Never give the answer directly. "
                "Reference specific metric values from the context. Max 3 sentences."
            )
    return _socratic_prompt


# ── Catalog ────────────────────────────────────────────────────────────────────

@app.get("/api/catalog")
def get_catalog():
    return {"shelves": SHELVES, "scenarios": SCENARIOS, "technologies": TECHNOLOGIES, "all_concepts": ALL_CONCEPTS}


@app.get("/api/catalog/concepts/{slug}")
def get_concept(slug: str):
    concept = next((c for c in ALL_CONCEPTS if c["slug"] == slug), None)
    if not concept:
        raise HTTPException(status_code=404, detail=f"concept {slug!r} not found")
    return concept


@app.get("/api/catalog/scenarios/{scenario_id}")
def get_scenario(scenario_id: str):
    scenario = next((s for s in SCENARIOS if s["id"] == scenario_id), None)
    if not scenario:
        raise HTTPException(status_code=404, detail=f"scenario {scenario_id!r} not found")
    return scenario


# ── Sessions ───────────────────────────────────────────────────────────────────

class CreateSessionBody(BaseModel):
    scenario: str
    boot_state: Optional[str] = None
    concept_target: Optional[str] = None


class ApplyStateBody(BaseModel):
    state: str


@app.post("/api/session/create")
async def create_session(body: CreateSessionBody):
    session_id = str(uuid.uuid4())
    boot_state = body.boot_state or "state0_baseline"
    try:
        boot_time_ms = await session_manager.create_session(body.scenario, boot_state, session_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {
        "session_id": session_id,
        "state": boot_state,
        "scenario": body.scenario,
        "concept_target": body.concept_target,
        "boot_time_ms": boot_time_ms,
    }


@app.get("/api/session/{session_id}")
def get_session(session_id: str):
    info = session_manager.get_session_info(session_id)
    if not info:
        raise HTTPException(status_code=404, detail="session not found")
    return info


@app.post("/api/session/{session_id}/state")
async def apply_state(session_id: str, body: ApplyStateBody):
    if not session_manager.get_session_info(session_id):
        raise HTTPException(status_code=404, detail="session not found")
    try:
        await session_manager.transition_state(session_id, body.state)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True, "state": body.state}


@app.delete("/api/session/{session_id}")
async def destroy_session(session_id: str):
    await session_manager.destroy_session(session_id)
    return {"ok": True}


# ── Metrics SSE ────────────────────────────────────────────────────────────────

@app.get("/api/session/{session_id}/metrics")
async def metrics_stream(session_id: str):
    async def event_generator():
        info = session_manager.get_session_info(session_id)
        if not info:
            yield f"data: {json.dumps({'error': 'session not found'})}\n\n"
            return

        while True:
            try:
                info = session_manager.get_session_info(session_id)
                if not info:
                    yield f"data: {json.dumps({'error': 'session destroyed'})}\n\n"
                    return
                project = info.get("project_name", "")
                if project:
                    data = await mc.collect(project)
                else:
                    data = {"error": "no project", "ts": int(time.time() * 1000)}
                yield f"data: {json.dumps(data)}\n\n"
            except Exception as exc:
                import logging
                logging.getLogger(__name__).warning("metrics stream error: %s", exc)
            await asyncio.sleep(1)

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── Heartbeat WebSocket ───────────────────────────────────────────────────────

@app.websocket("/api/session/{session_id}/heartbeat")
async def heartbeat_ws(websocket: WebSocket, session_id: str):
    info = session_manager.get_session_info(session_id)
    if not info:
        await websocket.close(code=4004)
        return

    await websocket.accept()
    session_manager.register_ws(session_id)

    try:
        while True:
            await websocket.receive_text()
            session_manager.touch_heartbeat(session_id)
    except WebSocketDisconnect:
        pass
    finally:
        session_manager.unregister_ws(session_id)


# ── Socratic Diagnose ──────────────────────────────────────────────────────────

class DiagnoseContext(BaseModel):
    current_state: str
    current_metrics: dict
    tier: int = 1
    concept_target: str = ""
    history: list = []


class DiagnoseBody(BaseModel):
    message: str
    context: DiagnoseContext


@app.post("/api/session/{session_id}/diagnose")
async def diagnose(session_id: str, body: DiagnoseBody):
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured. Set the environment variable to enable the Socratic tutor.")

    client = anthropic.Anthropic(api_key=api_key)
    system = get_socratic_prompt()
    context_block = json.dumps({
        "current_state": body.context.current_state,
        "current_metrics": body.context.current_metrics,
        "tier": body.context.tier,
        "concept_target": body.context.concept_target,
    }, indent=2)

    messages = body.context.history + [{"role": "user", "content": f"Context:\n{context_block}\n\nUser: {body.message}"}]

    response = client.messages.create(
        model="claude-opus-4-5-20250514",
        max_tokens=256,
        system=system,
        messages=messages,
    )
    reply = response.content[0].text
    return {"reply": reply, "intent_detected": None, "next_state": None, "show_hint": False}


# ── AI Assist (NVIDIA Qwen) ───────────────────────────────────────────────────

class AssistBody(BaseModel):
    message: str
    history: list = []
    code_context: Optional[dict] = None
    terminal_context: Optional[str] = None


@app.post("/api/session/{session_id}/assist")
async def assist(session_id: str, body: AssistBody):
    if not AI_API_KEY:
        raise HTTPException(status_code=503, detail="AI_API_KEY not configured")

    context_parts = []
    if body.code_context and body.code_context.get("path"):
        context_parts.append(f"Active file: {body.code_context['path']} ({body.code_context.get('language', 'text')})")
        context_parts.append(f"```\n{body.code_context.get('content', '')}\n```")
    if body.terminal_context:
        context_parts.append(f"\nTerminal output:\n```\n{body.terminal_context}\n```")
    context_block = "\n".join(context_parts)

    system_prompt = (
        "You are an expert assistant embedded in SystemCraft, a distributed systems trainer. "
        "You help users understand code, debug terminal issues, and diagnose infrastructure problems.\n\n"
        "Be concise. Show exact shell commands when relevant. Reference specific line numbers, "
        "variable names, or metric values from the context."
    )
    if context_block:
        system_prompt += f"\n\nCurrent context:\n{context_block}"

    messages = [{"role": "system", "content": system_prompt}]
    messages.extend(body.history)
    messages.append({"role": "user", "content": body.message})

    async def stream_generator():
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream(
                "POST",
                f"{AI_BASE_URL}/chat/completions",
                headers={
                    "Authorization": f"Bearer {AI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": AI_MODEL,
                    "max_tokens": 2048,
                    "temperature": 0.3,
                    "stream": True,
                    "messages": messages,
                },
            ) as resp:
                if resp.status_code != 200:
                    yield f"data: {json.dumps({'error': f'AI API error: {resp.status_code}'})}\n\n"
                    return
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    payload = line[6:]
                    if payload.strip() == "[DONE]":
                        yield f"data: {json.dumps({'done': True})}\n\n"
                        return
                    try:
                        chunk = json.loads(payload)
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        token = delta.get("content", "")
                        if token:
                            yield f"data: {json.dumps({'token': token})}\n\n"
                    except (json.JSONDecodeError, IndexError, KeyError):
                        pass

    return StreamingResponse(stream_generator(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── Traffic ────────────────────────────────────────────────────────────────────

class TrafficBody(BaseModel):
    virtual_users: int


@app.post("/api/session/{session_id}/traffic")
async def set_traffic(session_id: str, body: TrafficBody):
    result = await session_manager.start_traffic(session_id, body.virtual_users)
    return result


# ── Terminal WebSocket (Docker SDK) ───────────────────────────────────────────

docker_client = docker.APIClient(base_url="unix:///var/run/docker.sock")


@app.websocket("/api/session/{session_id}/terminal/{service}")
async def terminal_ws(websocket: WebSocket, session_id: str, service: str):
    await websocket.accept()
    info = session_manager.get_session_info(session_id)
    if not info:
        await websocket.send_bytes(b"Error: session not found\r\n")
        await websocket.close(code=4004)
        return

    project = info.get("project_name", f"sc_{session_id[:8]}")
    container_map = {"postgres": "postgres", "redis": "redis", "kafka": "kafka", "app": "app"}
    container = container_map.get(service, service)
    container_name = f"{project}-{container}-1"

    shell_map = {
        "postgres": ["psql", "-U", "postgres", "-d", "urlshortener"],
        "redis": ["redis-cli"],
        "kafka": ["/bin/bash"],
        "app": ["/bin/sh"],
    }
    shell_cmd = shell_map.get(service, ["/bin/sh"])

    loop = asyncio.get_event_loop()

    raw_sock = None
    deadline = time.time() + 30
    notified = False
    while time.time() < deadline:
        try:
            exec_id = await loop.run_in_executor(
                None,
                lambda: docker_client.exec_create(
                    container_name, shell_cmd, tty=True, stdin=True,
                )["Id"],
            )
            sock = await loop.run_in_executor(
                None,
                lambda: docker_client.exec_start(exec_id, socket=True, tty=True),
            )
            raw_sock = sock._sock
            break
        except Exception as e:
            msg = str(e)
            if "is not running" in msg or "409" in msg or "No such container" in msg:
                if not notified:
                    await websocket.send_bytes(b"\x1b[90mwaiting for container\x1b[0m\r\n")
                    notified = True
                await asyncio.sleep(1.5)
            else:
                await websocket.send_bytes(f"Error: {e}\r\n".encode())
                await websocket.close(code=4005)
                return

    if raw_sock is None:
        await websocket.send_bytes(b"Container did not start in time\r\n")
        await websocket.close(code=4005)
        return

    async def read_from_docker():
        try:
            while True:
                data = await loop.run_in_executor(None, lambda: raw_sock.recv(4096))
                if not data:
                    break
                await websocket.send_bytes(data)
        except Exception:
            pass
        finally:
            try:
                await websocket.close()
            except Exception:
                pass

    reader_task = asyncio.create_task(read_from_docker())

    try:
        while True:
            data = await websocket.receive_bytes()
            await loop.run_in_executor(None, lambda d=data: raw_sock.send(d))
    except WebSocketDisconnect:
        pass
    finally:
        reader_task.cancel()
        try:
            raw_sock.close()
        except Exception:
            pass


# ── Config Apply ───────────────────────────────────────────────────────────────

class ConfigBody(BaseModel):
    filename: str
    content: str


@app.post("/api/session/{session_id}/config")
async def apply_config(session_id: str, body: ConfigBody):
    info = session_manager.get_session_info(session_id)
    if not info:
        raise HTTPException(status_code=404, detail="session not found")
    project = info["project_name"]
    t0 = time.time()

    safe_name = body.filename.replace("/", "_").replace("..", "")
    tmp_path = f"/tmp/sc_{session_id[:8]}_{safe_name}"

    prefix = body.filename.split("/")[0]
    if prefix == "postgres":
        container = f"{project}-postgres-1"
        dest = "/var/lib/postgresql/data/" + body.filename.split("/", 1)[-1]
        reload_cmd = ["docker", "exec", container, "psql", "-U", "postgres", "-c", "SELECT pg_reload_conf();"]
        reloaded_service = "postgres"
    elif prefix == "redis":
        container = f"{project}-redis-1"
        dest = "/etc/redis/" + body.filename.split("/", 1)[-1]
        reload_cmd = ["docker", "exec", container, "redis-cli", "CONFIG", "REWRITE"]
        reloaded_service = "redis"
    else:
        container = f"{project}-app-1"
        dest = f"/app/{body.filename}"
        reload_cmd = ["docker", "exec", container, "kill", "-HUP", "1"]
        reloaded_service = "app"

    try:
        with open(tmp_path, "w") as f:
            f.write(body.content)

        cp_proc = await asyncio.create_subprocess_exec(
            "docker", "cp", tmp_path, f"{container}:{dest}",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        _, cp_err = await cp_proc.communicate()
        if cp_proc.returncode != 0:
            return {"ok": False, "error": "container not running or copy failed"}

        reload_proc = await asyncio.create_subprocess_exec(
            *reload_cmd,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        await reload_proc.communicate()
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

    return {"ok": True, "reloaded_service": reloaded_service, "reload_ms": int((time.time() - t0) * 1000)}


# ── Codefile ───────────────────────────────────────────────────────────────────

_INFRA_BASE = Path(__file__).parent.parent / "infra" / "scenarios"
_EXT_LANG = {".py": "python", ".js": "javascript", ".yml": "yaml", ".yaml": "yaml",
             ".conf": "ini", ".json": "json", ".sh": "bash", ".sql": "sql", ".md": "markdown"}


@app.get("/api/session/{session_id}/codefile/{filename:path}")
def get_codefile(session_id: str, filename: str):
    info = session_manager.get_session_info(session_id)
    if not info:
        raise HTTPException(status_code=404, detail="session not found")

    state = info.get("state", "state0_baseline")
    scenario = info.get("scenario", "url_shortener")
    base = _INFRA_BASE / scenario / state

    ext = Path(filename).suffix
    language = _EXT_LANG.get(ext, "text")

    shared_app = _INFRA_BASE / scenario / "app" / filename
    for candidate in [base / filename, base / "app" / filename, shared_app]:
        if candidate.exists():
            return {"filename": filename, "content": candidate.read_text(), "language": language}

    return {"filename": filename, "content": f"# {filename}\n# Not found for {scenario}/{state}\n", "language": language}


# ── Cheatsheet ─────────────────────────────────────────────────────────────────

CHEATSHEETS = {
    "postgres": [
        "SELECT count(*), state FROM pg_stat_activity GROUP BY state;",
        "SELECT query, count(*), avg(total_exec_time) FROM pg_stat_statements GROUP BY query ORDER BY count DESC LIMIT 5;",
        "SELECT count(*), wait_event FROM pg_stat_activity WHERE state='active' GROUP BY wait_event;",
        "EXPLAIN ANALYZE SELECT long_url FROM urls WHERE short_code = 'abc123';",
        "SELECT datname, numbackends, xact_commit FROM pg_stat_database WHERE datname='urlshortener';",
    ],
    "redis": [
        "INFO stats",
        "INFO memory",
        "TTL <key>",
        "MONITOR",
        "KEYS *",
        "DEBUG SLEEP 0",
        "CLIENT LIST",
    ],
    "kafka": [
        "kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --all-groups",
        "kafka-topics.sh --bootstrap-server localhost:9092 --list",
        "kafka-console-consumer.sh --bootstrap-server localhost:9092 --topic events --from-beginning",
    ],
    "app": [
        "curl http://localhost:8080/health",
        "curl http://localhost:8080/metrics",
    ],
}


@app.get("/api/session/{session_id}/cheatsheet/{service}")
def get_cheatsheet(session_id: str, service: str):
    return {"service": service, "commands": CHEATSHEETS.get(service, [])}


# ── Internals ──────────────────────────────────────────────────────────────────

@app.get("/api/session/{session_id}/internals/postgres")
async def internals_postgres(session_id: str):
    info = session_manager.get_session_info(session_id)
    if not info:
        raise HTTPException(status_code=404, detail="session not found")
    project = info.get("project_name", "")
    if not project:
        raise HTTPException(status_code=500, detail="session has no project")
    return await mc.postgres_internals(project)


@app.get("/api/session/{session_id}/internals/redis")
async def internals_redis(session_id: str):
    info = session_manager.get_session_info(session_id)
    if not info:
        raise HTTPException(status_code=404, detail="session not found")
    project = info.get("project_name", "")
    if not project:
        raise HTTPException(status_code=500, detail="session has no project")
    return await mc.redis_internals(project)


# ── App Logs (SSE stream) ─────────────────────────────────────────────────────

@app.get("/api/session/{session_id}/logs")
async def logs_stream(session_id: str):
    async def event_generator():
        info = session_manager.get_session_info(session_id)
        if not info:
            yield f"data: {json.dumps({'error': 'session not found'})}\n\n"
            return

        since = 0.0
        while True:
            info = session_manager.get_session_info(session_id)
            if not info:
                yield f"data: {json.dumps({'error': 'session destroyed'})}\n\n"
                return
            port = await session_manager.get_container_port(session_id, "app", 8080)
            if port:
                try:
                    async with httpx.AsyncClient(timeout=5.0) as client:
                        resp = await client.get(f"http://localhost:{port}/logs", params={"since": since, "limit": 200})
                        data = resp.json()
                        logs = data.get("logs", [])
                        if logs:
                            since = logs[-1]["ts"]
                            yield f"data: {json.dumps({'logs': logs})}\n\n"
                except Exception:
                    pass
            await asyncio.sleep(1)

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── Scale Config ───────────────────────────────────────────────────────────────

@app.get("/api/config/scale")
def get_scale_config():
    return {
        "vu_scale_factor": VU_SCALE_FACTOR,
        "max_actual_vus": MAX_ACTUAL_VUS,
        "rps_per_vu": RPS_PER_VU,
        "display_scale": VU_SCALE_FACTOR,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
