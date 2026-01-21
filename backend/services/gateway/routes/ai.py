import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Body
# We need to import ai_service, but it's instantiated in main.py.
# For modularity, we should probably pass it or use a singleton.
# For now, I'll assume we can import it from a service module.
from backend.services.ai.service import AIService

router = APIRouter()
logger = logging.getLogger("gateway.ai")

# Note: The actual ai_service instance will be injected or shared.
# In a full refactor, we'd use a dependency injection pattern.
# For now, we'll assume a global or imported instance.
ai_service = AIService()

@router.post("/ask")
async def ask_ai(payload: Dict[str, Any] = Body(...)):
    prompt = payload.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip():
        raise HTTPException(status_code=400, detail="prompt is required")

    context: Dict[str, Any] = {}
    context_raw = payload.get("context")
    if isinstance(context_raw, dict):
        context.update(context_raw)

    asset = payload.get("asset")
    timeframe = payload.get("timeframe")
    if isinstance(asset, str) and asset.strip():
        context["asset"] = asset.strip()
    if isinstance(timeframe, str) and timeframe.strip():
        context["timeframe"] = timeframe.strip()

    image_raw = payload.get("image_base64")
    if not (isinstance(image_raw, str) and image_raw.strip()):
        image_raw = payload.get("image")
    image: Optional[str] = None
    if isinstance(image_raw, str) and image_raw.strip():
        image = image_raw.strip()

    try:
        result = await ai_service.ask(prompt=prompt, context=context or None, image=image)
        return result
    except Exception as exc:
        logger.error("AI ask failed: %s", exc)
        raise HTTPException(status_code=500, detail="AI request failed")
