import asyncio
import json
import logging
import os
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

SESSION_TTL = timedelta(minutes=45)
HEARTBEAT_TIMEOUT = 30
CLEANUP_INTERVAL = 15

VU_SCALE_FACTOR = 10
MAX_ACTUAL_VUS = 200
RPS_PER_VU = 15


class SessionManager:
    def __init__(self):
        self._sessions: dict[str, dict] = {}
        self._infra_root = Path(__file__).parent.parent / "infra" / "scenarios"

    def _project_name(self, session_id: str) -> str:
        return f"sc_{session_id[:8]}"

    def _compose_path(self, scenario: str, state: str) -> Path:
        return self._infra_root / scenario / state / "docker-compose.yml"

    async def startup(self):
        logger.info("SessionManager startup: cleaning orphan containers")
        await self._cleanup_orphans()

    async def _cleanup_orphans(self):
        try:
            proc = await asyncio.create_subprocess_exec(
                "docker", "compose", "ls", "--format", "json",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await proc.communicate()
            if proc.returncode != 0 or not stdout:
                return
            projects = json.loads(stdout.decode())
            for project in projects:
                name = project.get("Name", "")
                if name.startswith("sc_"):
                    known = any(
                        info["project_name"] == name
                        for info in self._sessions.values()
                    )
                    if not known:
                        logger.info("Destroying orphan project: %s", name)
                        kill = await asyncio.create_subprocess_exec(
                            "docker", "compose", "-p", name, "down", "-v",
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE,
                        )
                        await kill.communicate()
        except FileNotFoundError:
            logger.debug("docker not available, skipping orphan cleanup")
        except Exception as e:
            logger.warning("Orphan cleanup error: %s", e)

    async def create_session(self, scenario: str, state: str, session_id: str) -> int:
        project = self._project_name(session_id)
        compose_path = self._compose_path(scenario, state)

        self._sessions[session_id] = {
            "session_id": session_id,
            "scenario": scenario,
            "state": state,
            "project_name": project,
            "created_at": time.time(),
            "created_dt": datetime.now(),
            "running": False,
            "k6_process": None,
            "last_heartbeat": time.time(),
            "ws_connections": 0,
            "ws_ever_connected": False,
            "actual_vus": 0,
            "display_vus": 0,
        }

        if not compose_path.exists():
            raise FileNotFoundError(f"Compose file not found: {compose_path}")

        t0 = time.time()
        proc = await asyncio.create_subprocess_exec(
            "docker", "compose", "-p", project, "-f", str(compose_path),
            "up", "-d", "--wait",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            self._sessions.pop(session_id, None)
            err = stderr.decode()[:500] if stderr else "unknown error"
            raise RuntimeError(f"docker compose up failed: {err}")

        self._sessions[session_id]["running"] = True
        return int((time.time() - t0) * 1000)

    async def destroy_session(self, session_id: str) -> None:
        info = self._sessions.pop(session_id, None)
        if not info:
            return

        k6 = info.get("k6_process")
        if k6 and k6.returncode is None:
            try:
                k6.terminate()
                await k6.wait()
            except Exception:
                pass

        project = info["project_name"]
        compose_path = self._compose_path(info.get("scenario", ""), info.get("state", ""))

        if compose_path.exists():
            try:
                proc = await asyncio.create_subprocess_exec(
                    "docker", "compose", "-p", project, "-f", str(compose_path),
                    "down", "-v",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                await proc.communicate()
            except FileNotFoundError:
                pass
        else:
            try:
                proc = await asyncio.create_subprocess_exec(
                    "docker", "compose", "-p", project, "down", "-v",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                await proc.communicate()
            except FileNotFoundError:
                pass

        logger.info("Destroyed session %s (project %s)", session_id, project)

    async def transition_state(self, session_id: str, new_state: str) -> None:
        info = self._sessions.get(session_id)
        if not info:
            raise ValueError(f"Session {session_id} not found")

        old_state = info["state"]
        scenario = info["scenario"]
        project = info["project_name"]

        new_compose = self._compose_path(scenario, new_state)
        if not new_compose.exists():
            raise FileNotFoundError(f"Compose file not found: {new_compose}")

        logger.info("Transition %s: %s → %s (project=%s)", session_id[:8], old_state, new_state, project)
        t0 = time.time()

        proc = await asyncio.create_subprocess_exec(
            "docker", "compose", "-p", project, "-f", str(new_compose),
            "up", "-d", "--wait", "--remove-orphans",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        elapsed_ms = int((time.time() - t0) * 1000)

        if proc.returncode != 0:
            err = stderr.decode()[:500] if stderr else "unknown error"
            logger.error("Transition failed (%dms): %s → %s: %s", elapsed_ms, old_state, new_state, err)
            raise RuntimeError(f"State transition failed: {err}")

        logger.info("Transition complete (%dms): %s → %s", elapsed_ms, old_state, new_state)
        info["state"] = new_state
        info["running"] = True
        info["actual_vus"] = 0
        info["display_vus"] = 0

    def get_session_info(self, session_id: str) -> Optional[dict]:
        info = self._sessions.get(session_id)
        if not info:
            return None
        return {k: v for k, v in info.items() if k not in ("k6_process", "created_dt", "ws_connections", "ws_ever_connected")}

    def touch_heartbeat(self, session_id: str) -> None:
        info = self._sessions.get(session_id)
        if info:
            info["last_heartbeat"] = time.time()

    def register_ws(self, session_id: str) -> None:
        info = self._sessions.get(session_id)
        if info:
            info["ws_connections"] = info.get("ws_connections", 0) + 1
            info["ws_ever_connected"] = True
            info["last_heartbeat"] = time.time()

    def unregister_ws(self, session_id: str) -> None:
        info = self._sessions.get(session_id)
        if info:
            info["ws_connections"] = max(0, info.get("ws_connections", 1) - 1)

    async def start_traffic(self, session_id: str, virtual_users: int) -> dict:
        info = self._sessions.get(session_id)
        if not info:
            return {"ok": False, "error": "session not found"}

        old_proc = info.get("k6_process")
        if old_proc and old_proc.returncode is None:
            try:
                old_proc.terminate()
                await old_proc.wait()
            except Exception:
                pass
        info["k6_process"] = None

        if virtual_users == 0:
            info["actual_vus"] = 0
            info["display_vus"] = 0
            return {"ok": True, "actual_vus": 0, "display_vus": 0, "estimated_rps": 0}

        actual_vus = min(max(1, virtual_users // VU_SCALE_FACTOR), MAX_ACTUAL_VUS)
        display_vus = virtual_users
        estimated_rps = actual_vus * RPS_PER_VU

        script = self._infra_root / info["scenario"] / info["state"] / "k6_script.js"
        if not script.exists():
            return {"ok": False, "error": f"k6 script not found: {script}"}

        app_port = await self.get_container_port(session_id, "app", 8080)
        env = os.environ.copy()
        if app_port:
            env["TARGET_URL"] = f"http://localhost:{app_port}"

        try:
            proc = await asyncio.create_subprocess_exec(
                "k6", "run", "--vus", str(actual_vus), "--duration", "30m", str(script),
                env=env,
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            info["k6_process"] = proc
            info["actual_vus"] = actual_vus
            info["display_vus"] = display_vus
        except FileNotFoundError:
            return {"ok": False, "error": "k6 not installed"}

        return {"ok": True, "actual_vus": actual_vus, "display_vus": display_vus, "estimated_rps": estimated_rps}

    async def get_container_port(self, session_id: str, service: str, internal_port: int) -> Optional[int]:
        info = self._sessions.get(session_id)
        if not info:
            return None
        container = f"{info['project_name']}-{service}-1"
        try:
            proc = await asyncio.create_subprocess_exec(
                "docker", "port", container, str(internal_port),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, _ = await proc.communicate()
            if proc.returncode != 0:
                return None
            line = stdout.decode().strip().split("\n")[0]
            return int(line.rsplit(":", 1)[-1])
        except Exception:
            return None

    async def start_cleanup_loop(self):
        asyncio.create_task(self._cleanup_loop())

    async def _cleanup_loop(self):
        while True:
            await asyncio.sleep(CLEANUP_INTERVAL)
            now = datetime.now()
            now_ts = time.time()

            expired_ttl = [
                sid for sid, info in list(self._sessions.items())
                if now - info.get("created_dt", now) > SESSION_TTL
            ]
            stale_heartbeat = [
                sid for sid, info in list(self._sessions.items())
                if sid not in expired_ttl
                and info.get("ws_ever_connected", False)
                and info.get("ws_connections", 0) == 0
                and now_ts - info.get("last_heartbeat", now_ts) > HEARTBEAT_TIMEOUT
            ]

            for sid in expired_ttl:
                logger.info("TTL expiry: destroying %s", sid)
                await self.destroy_session(sid)

            for sid in stale_heartbeat:
                logger.info("Heartbeat stale (no WS, %ds): destroying %s",
                            int(now_ts - self._sessions.get(sid, {}).get("last_heartbeat", 0)), sid)
                await self.destroy_session(sid)
