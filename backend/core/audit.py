from fastapi import Request

from core.db import db
from core.security import new_id, iso


def client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


async def audit(action: str, *, actor_id: str | None, actor_type: str = "USER", merchant_id: str | None = None,
                target_type: str | None = None, target_id: str | None = None, metadata: dict | None = None,
                request: Request | None = None) -> None:
    await db.audit_logs.insert_one({
        "id": new_id("aud"), "action": action, "actor_id": actor_id, "actor_type": actor_type,
        "merchant_id": merchant_id, "target_type": target_type, "target_id": target_id,
        "metadata": metadata or {}, "ip": client_ip(request),
        "request_id": request.state.request_id if request is not None and hasattr(request.state, "request_id") else None,
        "created_at": iso(),
    })
