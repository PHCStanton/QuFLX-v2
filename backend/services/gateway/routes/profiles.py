import json
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel, Field

from backend.services.gateway.routes.settings import load_settings

router = APIRouter()
logger = logging.getLogger("gateway.profiles")

project_root = Path(__file__).resolve().parents[4]
PROFILES_DIR = project_root / "data" / "profiles"
ACTIVE_PROFILE_FILE = PROFILES_DIR / "active_profile.json"


class ProfileCreatePayload(BaseModel):
    name: str = Field(..., min_length=1)
    settings: Optional[Dict[str, Any]] = None


class ProfileUpdatePayload(BaseModel):
    name: Optional[str] = None
    settings: Optional[Dict[str, Any]] = None


class ActiveProfilePayload(BaseModel):
    profileId: str = Field(..., min_length=1)


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _ensure_profiles_dir() -> None:
    PROFILES_DIR.mkdir(parents=True, exist_ok=True)


def _safe_profile_id(profile_id: str) -> str:
    if not profile_id or not isinstance(profile_id, str):
        raise HTTPException(status_code=400, detail="profileId is required")
    if not re.match(r"^[A-Za-z0-9_-]+$", profile_id):
        raise HTTPException(status_code=400, detail="profileId contains invalid characters")
    return profile_id


def _slugify(value: str) -> str:
    base = re.sub(r"[^A-Za-z0-9_-]+", "-", value.strip().lower()).strip("-")
    return base or "profile"


def _profile_path(profile_id: str) -> Path:
    return PROFILES_DIR / f"{profile_id}.json"


def _read_json(path: Path) -> Optional[Dict[str, Any]]:
    try:
        if not path.exists():
            return None
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as exc:
        logger.error(f"Failed to read {path}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to read profile data")


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
    except Exception as exc:
        logger.error(f"Failed to write {path}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to save profile data")


def _list_profiles() -> List[Dict[str, Any]]:
    _ensure_profiles_dir()
    profiles = []
    for file in PROFILES_DIR.glob("*.json"):
        if file.name == ACTIVE_PROFILE_FILE.name:
            continue
        data = _read_json(file)
        if not data:
            continue
        profiles.append({
            "id": data.get("id"),
            "name": data.get("name"),
            "createdAt": data.get("createdAt"),
            "updatedAt": data.get("updatedAt"),
        })
    return sorted(profiles, key=lambda p: (p.get("name") or "").lower())


def _get_profile(profile_id: str) -> Dict[str, Any]:
    _ensure_profiles_dir()
    safe_id = _safe_profile_id(profile_id)
    path = _profile_path(safe_id)
    data = _read_json(path)
    if not data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return data


def _write_profile(profile_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    safe_id = _safe_profile_id(profile_id)
    payload["id"] = safe_id
    payload["updatedAt"] = _now_iso()
    _write_json(_profile_path(safe_id), payload)
    return payload


def _load_active_profile_id() -> Optional[str]:
    data = _read_json(ACTIVE_PROFILE_FILE)
    if not data:
        return None
    return data.get("activeProfileId")


def _set_active_profile_id(profile_id: str) -> None:
    safe_id = _safe_profile_id(profile_id)
    _write_json(ACTIVE_PROFILE_FILE, {"activeProfileId": safe_id})


def _ensure_default_profile() -> Dict[str, Any]:
    profiles = _list_profiles()
    if profiles:
        active_id = _load_active_profile_id()
        if not active_id:
            _set_active_profile_id(profiles[0]["id"])
        return _get_profile(_load_active_profile_id() or profiles[0]["id"])

    settings = load_settings()
    default_profile = {
        "id": "default",
        "name": "Default",
        "settings": settings,
        "createdAt": _now_iso(),
        "updatedAt": _now_iso(),
    }
    _write_profile("default", default_profile)
    _set_active_profile_id("default")
    return default_profile


@router.get("")
async def list_profiles():
    _ensure_default_profile()
    return {"profiles": _list_profiles()}


@router.get("/active")
async def get_active_profile():
    profile = _ensure_default_profile()
    active_id = _load_active_profile_id()
    if active_id:
        profile = _get_profile(active_id)
    return {"activeProfileId": profile.get("id"), "profile": profile}


@router.post("/active")
async def set_active_profile(payload: ActiveProfilePayload = Body(...)):
    profile_id = _safe_profile_id(payload.profileId)
    _get_profile(profile_id)
    _set_active_profile_id(profile_id)
    profile = _get_profile(profile_id)
    return {"activeProfileId": profile_id, "profile": profile}


@router.post("")
async def create_profile(payload: ProfileCreatePayload = Body(...)):
    _ensure_profiles_dir()
    base_id = _slugify(payload.name)
    profile_id = base_id
    counter = 2
    while _profile_path(profile_id).exists():
        profile_id = f"{base_id}-{counter}"
        counter += 1

    settings = payload.settings if isinstance(payload.settings, dict) else load_settings()
    profile = {
        "id": profile_id,
        "name": payload.name.strip(),
        "settings": settings,
        "createdAt": _now_iso(),
        "updatedAt": _now_iso(),
    }
    _write_profile(profile_id, profile)
    if not _load_active_profile_id():
        _set_active_profile_id(profile_id)
    return profile


@router.get("/{profile_id}")
async def get_profile(profile_id: str):
    return _get_profile(profile_id)


@router.put("/{profile_id}")
async def update_profile(profile_id: str, payload: ProfileUpdatePayload = Body(...)):
    current = _get_profile(profile_id)
    name = payload.name.strip() if isinstance(payload.name, str) else current.get("name")
    settings = payload.settings if isinstance(payload.settings, dict) else current.get("settings")
    updated = {
        **current,
        "name": name,
        "settings": settings,
    }
    return _write_profile(profile_id, updated)


@router.delete("/{profile_id}")
async def delete_profile(profile_id: str):
    safe_id = _safe_profile_id(profile_id)
    path = _profile_path(safe_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Profile not found")
    try:
        path.unlink()
    except Exception as exc:
        logger.error(f"Failed to delete profile {safe_id}: {exc}")
        raise HTTPException(status_code=500, detail="Failed to delete profile")

    active_id = _load_active_profile_id()
    if active_id == safe_id:
        remaining = _list_profiles()
        if remaining:
            _set_active_profile_id(remaining[0]["id"])
        else:
            _ensure_default_profile()

    return {"ok": True}
