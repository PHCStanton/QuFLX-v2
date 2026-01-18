import os
import sys
import asyncio
import logging
import socket
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse


router = APIRouter()
logger = logging.getLogger("gateway.ops")

project_root = Path(__file__).resolve().parents[4]

_ops_lock = asyncio.Lock()

_registry: Dict[str, Dict[str, Any]] = {
    "chrome": {
        "proc": None,
        "pid": None,
        "started_at": None,
        "last_error": None,
    },
    "collector": {
        "proc": None,
        "pid": None,
        "started_at": None,
        "last_error": None,
        "log_path": None,
        "log_file": None,
    },
}


def _json_error(
    *,
    status_code: int,
    error_code: str,
    error_message: str,
    user_message: str,
    details: Optional[Dict[str, Any]] = None,
) -> JSONResponse:
    payload: Dict[str, Any] = {
        "ok": False,
        "error_code": error_code,
        "error_message": error_message,
        "user_message": user_message,
    }
    if details is not None:
        payload["details"] = details
    return JSONResponse(status_code=status_code, content=payload)


def _client_host(request: Request) -> str:
    if request.client is None:
        return ""
    return request.client.host or ""


def _is_local_client(host: str) -> bool:
    return host in {"127.0.0.1", "::1", "testclient"}


def _check_dev_gate(request: Request, ops_token: Optional[str]) -> Optional[JSONResponse]:
    if os.getenv("QFLX_ENABLE_OPS") != "1":
        return _json_error(
            status_code=403,
            error_code="ops_disabled",
            error_message="QFLX_ENABLE_OPS is not enabled",
            user_message="Ops controls are disabled. Enable local ops to use this feature.",
        )

    host = _client_host(request)
    if not _is_local_client(host):
        return _json_error(
            status_code=403,
            error_code="ops_local_only",
            error_message=f"Ops endpoints are local-only. client_host={host}",
            user_message="Ops controls are only allowed from the local machine.",
        )

    expected_token = os.getenv("QFLX_OPS_TOKEN", "").strip()
    if expected_token:
        provided = (ops_token or "").strip()
        if provided != expected_token:
            return _json_error(
                status_code=403,
                error_code="ops_token_required",
                error_message="Missing or invalid ops token",
                user_message="Ops token required to use local controls.",
            )

    return None


def _is_port_open(host: str, port: int, timeout_s: float = 0.4) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout_s):
            return True
    except Exception:
        return False


def _find_chrome_executable() -> Optional[str]:
    env_path = os.getenv("QFLX_CHROME_PATH")
    if env_path and Path(env_path).exists():
        return env_path

    which = shutil.which("chrome") or shutil.which("chrome.exe")
    if which:
        return which

    program_files = os.getenv("ProgramFiles")
    program_files_x86 = os.getenv("ProgramFiles(x86)")
    local_app_data = os.getenv("LocalAppData")

    candidates = [
        (program_files, "Google", "Chrome", "Application", "chrome.exe"),
        (program_files_x86, "Google", "Chrome", "Application", "chrome.exe"),
        (local_app_data, "Google", "Chrome", "Application", "chrome.exe"),
    ]
    for base, *rest in candidates:
        if not base:
            continue
        p = Path(base).joinpath(*rest)
        if p.exists():
            return str(p)

    return None


def _cleanup_if_exited(entry: Dict[str, Any]) -> None:
    proc = entry.get("proc")
    if proc is None:
        return
    try:
        exited = proc.poll() is not None
    except Exception:
        exited = True
    if not exited:
        return

    log_f = entry.get("log_file")
    if log_f is not None:
        try:
            log_f.close()
        except Exception:
            pass

    entry["proc"] = None
    entry["pid"] = None
    entry["log_file"] = None


def _spawn_chrome(*, chrome_path: str, url: Optional[str]) -> subprocess.Popen:
    profile_dir = project_root / "Chrome_profile"
    profile_dir.mkdir(parents=True, exist_ok=True)

    args = [
        chrome_path,
        "--new-window",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-default-apps",
        "--disable-popup-blocking",
        "--disable-web-security",
        "--allow-running-insecure-content",
        "--remote-debugging-address=127.0.0.1",
        "--remote-debugging-port=9222",
        f"--user-data-dir={str(profile_dir)}",
    ]
    if url:
        args.append(url)

    return subprocess.Popen(
        args,
        cwd=str(project_root),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _spawn_collector(*, log_path: Path) -> subprocess.Popen:
    collector_path = project_root / "backend" / "services" / "collector" / "main.py"
    if not collector_path.exists():
        raise FileNotFoundError(str(collector_path))

    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_f = open(log_path, "w", encoding="utf-8")
    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    env["PYTHONPATH"] = str(project_root)

    proc = subprocess.Popen(
        [sys.executable, str(collector_path)],
        cwd=str(project_root),
        stdout=log_f,
        stderr=subprocess.STDOUT,
        env=env,
    )

    _registry["collector"]["log_file"] = log_f
    return proc


def _stop_process(proc: subprocess.Popen) -> None:
    try:
        proc.terminate()
        proc.wait(timeout=3)
        return
    except Exception:
        pass
    try:
        proc.kill()
        proc.wait(timeout=3)
    except Exception:
        pass


@router.post("/chrome/start")
async def start_chrome(request: Request, x_qflx_ops_token: Optional[str] = Header(default=None)):
    gate_err = _check_dev_gate(request, x_qflx_ops_token)
    if gate_err is not None:
        return gate_err

    try:
        if _is_port_open("127.0.0.1", 9222):
            return {"ok": True, "status": "already_running", "port": 9222}

        chrome_path = _find_chrome_executable()
        if not chrome_path:
            return _json_error(
                status_code=424,
                error_code="chrome_not_found",
                error_message="Chrome executable not found",
                user_message="Chrome executable not found. Please ensure Chrome is installed.",
                details={"hint": "Set QFLX_CHROME_PATH to the full path of chrome.exe"},
            )

        url = os.getenv("QFLX_CHROME_URL", "").strip() or "https://pocket2.click/cabinet/demo-quick-high-low"

        async with _ops_lock:
            entry = _registry["chrome"]
            _cleanup_if_exited(entry)
            if entry.get("proc") is not None:
                return {"ok": True, "status": "already_running", "pid": entry.get("pid"), "port": 9222}
            proc = _spawn_chrome(chrome_path=chrome_path, url=url)
            entry["proc"] = proc
            entry["pid"] = proc.pid
            entry["started_at"] = datetime.now(timezone.utc).isoformat()
            entry["last_error"] = None

        return {"ok": True, "status": "started", "pid": proc.pid, "port": 9222}
    except Exception as exc:
        logger.error("Chrome start failed: %s", exc, exc_info=True)
        return _json_error(
            status_code=500,
            error_code="chrome_start_failed",
            error_message=str(exc),
            user_message="Failed to start Chrome.",
        )


@router.post("/stream/start")
async def start_stream(request: Request, x_qflx_ops_token: Optional[str] = Header(default=None)):
    gate_err = _check_dev_gate(request, x_qflx_ops_token)
    if gate_err is not None:
        return gate_err

    try:
        async with _ops_lock:
            entry = _registry["collector"]
            _cleanup_if_exited(entry)
            proc = entry.get("proc")
            if proc is not None:
                return {
                    "ok": True,
                    "status": "already_running",
                    "pid": entry.get("pid"),
                    "log_path": entry.get("log_path"),
                }

            ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            log_path = project_root / "data" / "data_output" / "logs" / f"collector_{ts}.log"
            proc = _spawn_collector(log_path=log_path)
            entry["proc"] = proc
            entry["pid"] = proc.pid
            entry["started_at"] = datetime.now(timezone.utc).isoformat()
            entry["last_error"] = None
            entry["log_path"] = str(log_path)

        return {"ok": True, "status": "started", "pid": proc.pid, "log_path": str(log_path)}
    except FileNotFoundError as exc:
        return _json_error(
            status_code=424,
            error_code="collector_entrypoint_missing",
            error_message=str(exc),
            user_message="Collector entrypoint not found.",
        )
    except Exception as exc:
        logger.error("Stream start failed: %s", exc, exc_info=True)
        async with _ops_lock:
            _registry["collector"]["last_error"] = str(exc)
        return _json_error(
            status_code=500,
            error_code="stream_start_failed",
            error_message=str(exc),
            user_message="Failed to start Stream.",
        )


@router.post("/stream/pause")
async def pause_stream(request: Request, x_qflx_ops_token: Optional[str] = Header(default=None)):
    gate_err = _check_dev_gate(request, x_qflx_ops_token)
    if gate_err is not None:
        return gate_err

    try:
        async with _ops_lock:
            entry = _registry["collector"]
            _cleanup_if_exited(entry)
            proc = entry.get("proc")
            if proc is None:
                return {"ok": True, "status": "already_stopped"}

        await asyncio.to_thread(_stop_process, proc)

        async with _ops_lock:
            entry = _registry["collector"]
            log_f = entry.get("log_file")
            if log_f is not None:
                try:
                    log_f.close()
                except Exception:
                    pass
            entry["proc"] = None
            entry["pid"] = None
            entry["log_file"] = None
            entry["started_at"] = None

        return {"ok": True, "status": "stopped"}
    except Exception as exc:
        logger.error("Stream pause failed: %s", exc, exc_info=True)
        async with _ops_lock:
            _registry["collector"]["last_error"] = str(exc)
        return _json_error(
            status_code=500,
            error_code="stream_pause_failed",
            error_message=str(exc),
            user_message="Failed to pause Stream.",
        )


@router.get("/stream/status")
async def stream_status(request: Request, x_qflx_ops_token: Optional[str] = Header(default=None)):
    gate_err = _check_dev_gate(request, x_qflx_ops_token)
    if gate_err is not None:
        return gate_err

    async with _ops_lock:
        entry = _registry["collector"]
        _cleanup_if_exited(entry)
        proc = entry.get("proc")
        running = proc is not None
        return {
            "ok": True,
            "running": running,
            "pid": entry.get("pid"),
            "log_path": entry.get("log_path"),
            "last_error": entry.get("last_error"),
            "observed_at": datetime.now(timezone.utc).isoformat(),
        }
