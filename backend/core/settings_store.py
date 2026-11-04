from core.config import DEFAULT_SETTINGS
from core.db import db


async def get_settings() -> dict:
    doc = await db.system_settings.find_one({"key": "platform"}, {"_id": 0})
    return {**DEFAULT_SETTINGS, **((doc or {}).get("value") or {})}
