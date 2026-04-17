import asyncio
import logging
import os
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional

logger = logging.getLogger("LocalAIProcessManager")


class LocalAIProcessManager:
    """
    Supervises the local llama-server.exe process that hosts Gemma.
    - Starts on Gateway lifespan startup (if QFLX_LOCAL_AI_AUTOSTART=1).
    - Terminates on shutdown.
    - Performs readiness check before declaring started.
    """
    def __init__(self) -> None:
        self.enabled = os.getenv("QFLX_LOCAL_AI_AUTOSTART", "0") == "1"
        self.exe = os.getenv("QFLX_LOCAL_AI_EXE", "")
        self.model_path = os.getenv("QFLX_LOCAL_AI_MODEL_PATH", "")
        self.port = int(os.getenv("QFLX_LOCAL_AI_PORT", "8080"))
        self.threads = int(os.getenv("QFLX_LOCAL_AI_THREADS", "8"))
        self.host = os.getenv("QFLX_LOCAL_AI_HOST", "127.0.0.1")
        self._proc: Optional[subprocess.Popen] = None
        self._log_file: Optional[Path] = None

    def _resolve_log_dir(self) -> Path:
        """Return the log directory, falling back to a temp dir if needed."""
        base = os.getenv("QFLX_LOG_DIR")
        if base:
            p = Path(base)
            if p.is_dir():
                return p
        # Fallback: use project root / system_LOGS
        root = Path(__file__).resolve().parents[3]
        fallback = root / "system_LOGS"
        fallback.mkdir(parents=True, exist_ok=True)
        return fallback

    async def start(self) -> bool:
        if not self.enabled:
            logger.info("LocalAIProcessManager disabled (QFLX_LOCAL_AI_AUTOSTART != 1)")
            return False
        if not self.exe or not self.model_path:
            logger.warning("LocalAIProcessManager misconfigured — missing EXE or MODEL_PATH")
            return False
        if not os.path.isfile(self.exe):
            logger.error("llama-server.exe not found at %s", self.exe)
            return False
        if not os.path.isfile(self.model_path):
            logger.error("Gemma model file not found at %s", self.model_path)
            return False

        # Open a log file for stdout/stderr (Core Principle #8: zero silent failures)
        log_dir = self._resolve_log_dir()
        ts = datetime.utcnow().strftime("%Y%m%dT%H%M%S")
        self._log_file = log_dir / f"llama-server-{ts}.log"
        try:
            log_handle = open(self._log_file, "w", encoding="utf-8")
        except OSError as exc:
            logger.warning("Could not open log file %s: %s — continuing without log capture", self._log_file, exc)
            log_handle = subprocess.DEVNULL

        cmd = [
            self.exe,
            "-m", self.model_path,
            "--host", self.host,
            "--port", str(self.port),
            "--threads", str(self.threads),
            "--no-warmup",
        ]
        logger.info("Starting local AI subprocess: %s  (log → %s)", " ".join(cmd), self._log_file)
        creationflags = 0
        if os.name == "nt":
            creationflags = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore
        self._proc = subprocess.Popen(
            cmd,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            creationflags=creationflags,
        )
        ok = await self._wait_ready(timeout=60.0)
        if not ok:
            logger.error("Local AI failed to become ready within timeout; terminating.")
            await self.stop()
            return False
        logger.info("Local AI subprocess ready on %s:%s (pid=%s)", self.host, self.port, self._proc.pid)
        return True

    async def _wait_ready(self, timeout: float) -> bool:
        import httpx
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # Outside async context (e.g. sync test) — skip
            return False
        deadline = loop.time() + timeout
        url = f"http://{self.host}:{self.port}/v1/models"
        while loop.time() < deadline:
            try:
                async with httpx.AsyncClient(timeout=1.5) as c:
                    r = await c.get(url)
                    if r.status_code == 200:
                        return True
            except Exception:
                pass
            await asyncio.sleep(1.0)
        return False

    async def stop(self) -> None:
        if not self._proc:
            return
        pid = self._proc.pid
        logger.info("Stopping local AI subprocess (pid=%s)", pid)
        try:
            self._proc.terminate()
            # Use asyncio.to_thread so we don't block the event loop (Fix #5)
            try:
                await asyncio.to_thread(self._proc.wait, timeout=5.0)
            except (subprocess.TimeoutExpired, asyncio.TimeoutError):
                logger.warning("Process did not terminate in 5s — killing (pid=%s)", pid)
                self._proc.kill()
                await asyncio.to_thread(self._proc.wait)
        except Exception as exc:
            logger.warning("Error stopping local AI subprocess: %s", exc)
        finally:
            self._proc = None
            # Close log file
            if self._log_file and self._log_file.exists():
                logger.info("llama-server log saved to %s", self._log_file)
