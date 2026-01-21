import os
import logging
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field


router = APIRouter()
logger = logging.getLogger('gateway.dev_logs')

project_root = Path(__file__).resolve().parents[4]


def _is_enabled() -> bool:
    return str(os.getenv('QFLX_ENABLE_DEV_LOGS', '0')).strip() in {'1', 'true', 'True', 'yes', 'YES'}


def _is_local(request: Request) -> bool:
    host = request.client.host if request.client else ''
    return host in {'127.0.0.1', '::1'}


def _gate(request: Request) -> None:
    if not _is_enabled():
        raise HTTPException(status_code=403, detail='Dev logs API is disabled (set QFLX_ENABLE_DEV_LOGS=1).')
    if not _is_local(request):
        raise HTTPException(status_code=403, detail='Dev logs API is local-only.')


def _base_dir() -> Path:
    raw = os.getenv('QFLX_LOG_DIR')
    if raw:
        return Path(raw)
    return project_root / 'system_LOGS'


def _safe_service_dir(service: str) -> Path:
    if not service or '/' in service or '\\' in service or '..' in service:
        raise HTTPException(status_code=400, detail='Invalid service name.')
    return _base_dir() / service


def _safe_log_file(service_dir: Path, filename: str) -> Path:
    if not filename or '/' in filename or '\\' in filename or '..' in filename:
        raise HTTPException(status_code=400, detail='Invalid filename.')
    candidate = (service_dir / filename).resolve()
    base = service_dir.resolve()
    if base not in candidate.parents and candidate != base:
        raise HTTPException(status_code=400, detail='Invalid path.')
    if candidate.suffix != '.log':
        raise HTTPException(status_code=400, detail='Only .log files are supported.')
    return candidate


def _tail_lines(path: Path, lines: int) -> List[str]:
    if lines < 1:
        return []
    capped = min(lines, 1000)
    dq: deque[str] = deque(maxlen=capped)
    with path.open('r', encoding='utf-8', errors='replace') as f:
        for line in f:
            dq.append(line.rstrip('\n'))
    return list(dq)


class LogLevelPayload(BaseModel):
    level: str = Field(..., min_length=1)


@router.get('/index')
async def list_logs(request: Request):
    _gate(request)
    base = _base_dir()
    if not base.exists():
        return {'ok': True, 'base_dir': str(base), 'services': []}

    services: List[Dict[str, Any]] = []
    for entry in sorted(base.iterdir()):
        if not entry.is_dir():
            continue

        files = []
        for fp in sorted(entry.glob('*.log')):
            try:
                st = fp.stat()
                files.append({
                    'name': fp.name,
                    'size_bytes': st.st_size,
                    'modified_at': datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
                })
            except OSError:
                continue

        services.append({'name': entry.name, 'files': files})

    return {'ok': True, 'base_dir': str(base), 'services': services}


@router.get('/tail')
async def tail_log(request: Request, service: str, file: str, lines: int = 200):
    _gate(request)
    service_dir = _safe_service_dir(service)
    if not service_dir.exists():
        raise HTTPException(status_code=404, detail='Service log directory not found.')

    target = _safe_log_file(service_dir, file)
    if not target.exists():
        raise HTTPException(status_code=404, detail='Log file not found.')

    try:
        content = _tail_lines(target, lines)
        return {
            'ok': True,
            'service': service,
            'file': file,
            'lines': len(content),
            'content': content,
        }
    except OSError as exc:
        logger.error('Tail log failed for %s: %s', str(target), exc)
        raise HTTPException(status_code=500, detail='Failed to read log file.')


@router.get('/state')
async def dev_logs_state(request: Request):
    _gate(request)
    return {
        'ok': True,
        'enabled': True,
        'base_dir': str(_base_dir()),
        'gateway_log_level': logging.getLevelName(logging.getLogger().level),
        'debug_errors': str(os.getenv('QFLX_DEBUG_ERRORS', '0')).strip() in {'1', 'true', 'True', 'yes', 'YES'},
    }


@router.post('/log-level')
async def set_gateway_log_level(request: Request, payload: LogLevelPayload):
    _gate(request)
    level = str(payload.level).strip().upper()
    mapping = {
        'DEBUG': logging.DEBUG,
        'INFO': logging.INFO,
        'WARNING': logging.WARNING,
        'WARN': logging.WARNING,
        'ERROR': logging.ERROR,
        'CRITICAL': logging.CRITICAL,
    }
    if level not in mapping:
        raise HTTPException(status_code=400, detail='Invalid log level.')

    root = logging.getLogger()
    root.setLevel(mapping[level])
    logger.info('Gateway log level updated to %s', level)
    return {'ok': True, 'gateway_log_level': level}

