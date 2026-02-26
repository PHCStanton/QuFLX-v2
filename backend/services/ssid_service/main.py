
import os
import sys
import logging
import asyncio
import uuid
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv

# Add project root to sys.path
project_root = Path(__file__).resolve().parents[3]
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

# Load project .env explicitly so standalone ssid_service runs consistently
env_path = project_root / ".env"
load_dotenv(dotenv_path=env_path)

from backend.services.ssid_service.routes import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("ssid_service")

DEBUG_ERRORS = str(os.getenv("QFLX_DEBUG_ERRORS", "0")).strip() in {"1", "true", "True", "yes"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Load SSIDs from environment at startup
    app.state.ssid_demo = os.getenv("QFLX_SSID_DEMO", "").strip()
    app.state.ssid_real = os.getenv("QFLX_SSID_REAL", "").strip()
    app.state.demo_session = None
    app.state.real_session = None
    app.state.active_mode = "demo"
    app.state.session_lock = asyncio.Lock()

    logger.info("SSID Service started")
    yield

    # Cleanup on shutdown
    for session in [app.state.demo_session, app.state.real_session]:
        if session:
            try:
                session.stop()
            except Exception as exc:
                logger.error("Failed to stop session during shutdown: %s", exc, exc_info=True)
    logger.info("SSID Service stopped")


app = FastAPI(title="QuFLX SSID Service", lifespan=lifespan)

app.include_router(router, prefix="/api")


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Principle 8: Zero Silent Failures.
    Catch-all handler ensures every unhandled error returns a structured JSON response
    instead of crashing silently or returning an HTML error page.
    """
    error_id = uuid.uuid4().hex[:12]
    logger.error("SSID Service unhandled error error_id=%s path=%s: %s", error_id, request.url.path, exc, exc_info=True)

    payload = {
        "success": False,
        "error": "Internal server error",
        "error_id": error_id,
    }
    if DEBUG_ERRORS:
        payload["debug"] = {"type": exc.__class__.__name__, "message": str(exc)}

    return JSONResponse(status_code=500, content=payload)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ssid_service"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("QFLX_SSID_SERVICE_PORT", "8001"))
    uvicorn.run(app, host="0.0.0.0", port=port)
