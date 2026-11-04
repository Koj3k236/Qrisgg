import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, Field

from core.audit import audit
from core.config import API_KEY_SCOPES, WEBHOOK_EVENTS, PLATFORM_MODE
from core.db import db
from core.deps import require_perm, require_scope
from core.security import new_id, iso, sha256, generate_api_key, encrypt
from modules.payments import create_invoice, public_invoice
from modules.webhooks import assert_public_https_url, emit_event

router = APIRouter(prefix="/api/merchant", tags=["developers"])
v1 = APIRouter(prefix="/api/v1", tags=["public-api-v1"])


class ApiKeyIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    scopes: list[str] = Field(min_length=1)


class WebhookIn(BaseModel):
    url: str = Field(max_length=500)
    events: list[str] = Field(min_length=1)


class WebhookPatch(BaseModel):
    enabled: bool | None = None
    events: list[str] | None = None


class V1InvoiceIn(BaseModel):
    amount: int = Field(gt=0)
    external_id: str | None = Field(None, min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:\-]+$")
    currency: str = Field("IDR", pattern="^IDR$")
    payment_method: str = Field("QRIS", pattern="^QRIS$")
    expires_in: int | None = Field(None, ge=60, le=86400)
    description: str | None = Field(None, max_length=200)


def _key_view(k: dict) -> dict:
    return {f: k.get(f) for f in ("id", "name", "prefix", "scopes", "mode", "created_at", "last_used_at", "revoked_at", "rotated_from")}


async def _new_key(ctx, name, scopes, rotated_from=None):
    bad = [s for s in scopes if s not in API_KEY_SCOPES]
    if bad:
        raise HTTPException(422, f"Scope tidak dikenal: {', '.join(bad)}")
    raw = generate_api_key(PLATFORM_MODE)
    doc = {"id": new_id("key"), "merchant_id": ctx["merchant"]["id"], "name": name, "prefix": raw[:18], "key_hash": sha256(raw),
           "scopes": sorted(set(scopes)), "mode": PLATFORM_MODE, "created_by": ctx["user"]["id"], "created_at": iso(),
           "last_used_at": None, "revoked_at": None, "rotated_from": rotated_from}
    await db.api_keys.insert_one(dict(doc))
    return {**_key_view(doc), "secret": raw}


@router.get("/api-keys")
async def list_keys(ctx: dict = Depends(require_perm("developers:manage"))):
    rows = await db.api_keys.find({"merchant_id": ctx["merchant"]["id"]}, {"_id": 0, "key_hash": 0}).sort("created_at", -1).to_list(100)
    return [_key_view(r) for r in rows]


@router.post("/api-keys")
async def create_key(body: ApiKeyIn, request: Request, ctx: dict = Depends(require_perm("developers:manage"))):
    key = await _new_key(ctx, body.name, body.scopes)
    await audit("api_key.created", actor_id=ctx["user"]["id"], merchant_id=ctx["merchant"]["id"], target_type="api_key",
                target_id=key["id"], metadata={"scopes": key["scopes"]}, request=request)
    return key


async def _revoke(ctx, key_id):
    res = await db.api_keys.find_one_and_update({"id": key_id, "merchant_id": ctx["merchant"]["id"], "revoked_at": None},
                                                {"$set": {"revoked_at": iso()}}, projection={"_id": 0})
    if not res:
        raise HTTPException(404, "API key tidak ditemukan atau sudah dicabut")
    return res


@router.post("/api-keys/{key_id}/rotate")
async def rotate_key(key_id: str, request: Request, ctx: dict = Depends(require_perm("developers:manage"))):
    old = await _revoke(ctx, key_id)
    key = await _new_key(ctx, old["name"], old["scopes"], rotated_from=key_id)
    await audit("api_key.rotated", actor_id=ctx["user"]["id"], merchant_id=ctx["merchant"]["id"], target_type="api_key",
                target_id=key["id"], metadata={"previous": key_id}, request=request)
    return key


@router.delete("/api-keys/{key_id}")
async def revoke_key(key_id: str, request: Request, ctx: dict = Depends(require_perm("developers:manage"))):
    await _revoke(ctx, key_id)
    await audit("api_key.revoked", actor_id=ctx["user"]["id"], merchant_id=ctx["merchant"]["id"], target_type="api_key",
                target_id=key_id, request=request)
    return {"ok": True}


def _ep_view(e):
    return {f: e.get(f) for f in ("id", "url", "events", "enabled", "created_at", "secret_rotated_at")}


def _check_events(events):
    bad = [e for e in events if e not in WEBHOOK_EVENTS]
    if bad:
        raise HTTPException(422, f"Event tidak dikenal: {', '.join(bad)}")


@router.get("/webhooks")
async def list_webhooks(ctx: dict = Depends(require_perm("developers:manage"))):
    return [_ep_view(e) for e in await db.webhook_endpoints.find({"merchant_id": ctx["merchant"]["id"]}, {"_id": 0}).to_list(50)]


@router.post("/webhooks")
async def create_webhook(body: WebhookIn, request: Request, ctx: dict = Depends(require_perm("developers:manage"))):
    _check_events(body.events)
    assert_public_https_url(body.url)
    secret = f"whsec_{secrets.token_urlsafe(32)}"
    doc = {"id": new_id("whk"), "merchant_id": ctx["merchant"]["id"], "url": body.url, "events": sorted(set(body.events)),
           "enabled": True, "secret_enc": encrypt(secret), "created_at": iso(), "secret_rotated_at": None}
    await db.webhook_endpoints.insert_one(dict(doc))
    await audit("webhook.created", actor_id=ctx["user"]["id"], merchant_id=ctx["merchant"]["id"], target_type="webhook",
                target_id=doc["id"], request=request)
    return {**_ep_view(doc), "secret": secret}


async def _endpoint(ctx, wid):
    e = await db.webhook_endpoints.find_one({"id": wid, "merchant_id": ctx["merchant"]["id"]}, {"_id": 0})
    if not e:
        raise HTTPException(404, "Endpoint webhook tidak ditemukan")
    return e


@router.patch("/webhooks/{wid}")
async def update_webhook(wid: str, body: WebhookPatch, ctx: dict = Depends(require_perm("developers:manage"))):
    await _endpoint(ctx, wid)
    changes = body.model_dump(exclude_none=True)
    if "events" in changes:
        _check_events(changes["events"])
    await db.webhook_endpoints.update_one({"id": wid}, {"$set": changes})
    return _ep_view(await _endpoint(ctx, wid))


@router.post("/webhooks/{wid}/rotate-secret")
async def rotate_secret(wid: str, request: Request, ctx: dict = Depends(require_perm("developers:manage"))):
    await _endpoint(ctx, wid)
    secret = f"whsec_{secrets.token_urlsafe(32)}"
    await db.webhook_endpoints.update_one({"id": wid}, {"$set": {"secret_enc": encrypt(secret), "secret_rotated_at": iso()}})
    await audit("webhook.secret_rotated", actor_id=ctx["user"]["id"], merchant_id=ctx["merchant"]["id"], target_type="webhook",
                target_id=wid, request=request)
    return {"id": wid, "secret": secret}


@router.post("/webhooks/{wid}/test")
async def test_webhook(wid: str, ctx: dict = Depends(require_perm("developers:manage"))):
    e = await _endpoint(ctx, wid)
    from core.security import now
    from modules.webhooks import process_due_deliveries
    did = new_id("whd")
    payload = {"id": new_id("whe"), "type": "webhook.test", "created_at": iso(), "mode": "SANDBOX", "data": {"message": "Tes dari Qrisgg"}}
    await db.webhook_deliveries.insert_one({"id": did, "event_id": payload["id"], "event_type": "webhook.test", "endpoint_id": wid,
                                            "merchant_id": e["merchant_id"], "url": e["url"], "payload": payload, "status": "PENDING",
                                            "attempts": 0, "next_attempt_at": iso(now()), "created_at": iso()})
    await process_due_deliveries()
    return await db.webhook_deliveries.find_one({"id": did}, {"_id": 0, "payload": 0})


@router.delete("/webhooks/{wid}")
async def delete_webhook(wid: str, request: Request, ctx: dict = Depends(require_perm("developers:manage"))):
    await _endpoint(ctx, wid)
    await db.webhook_endpoints.delete_one({"id": wid})
    await audit("webhook.deleted", actor_id=ctx["user"]["id"], merchant_id=ctx["merchant"]["id"], target_type="webhook",
                target_id=wid, request=request)
    return {"ok": True}


@router.get("/webhook-deliveries")
async def deliveries(ctx: dict = Depends(require_perm("developers:manage"))):
    return await db.webhook_deliveries.find({"merchant_id": ctx["merchant"]["id"]}, {"_id": 0, "payload": 0}).sort("created_at", -1).limit(100).to_list(100)


# ---------- Public developer API v1 (API key auth) ----------

@v1.post("/invoices")
async def v1_create_invoice(body: V1InvoiceIn, request: Request, idempotency_key: str | None = Header(None, max_length=100),
                            ctx: dict = Depends(require_scope("invoices:write"))):
    data = body.model_dump(exclude_none=True, exclude={"currency", "payment_method"})
    inv = await create_invoice(ctx["merchant"], data, actor_id=ctx["api_key"]["id"], source="API", idempotency_key=idempotency_key)
    if not inv.get("idempotent_replay"):
        await audit("invoice.created", actor_id=ctx["api_key"]["id"], actor_type="API_KEY", merchant_id=ctx["merchant"]["id"],
                    target_type="invoice", target_id=inv["id"], request=request)
    return inv


@v1.get("/invoices")
async def v1_list(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), ctx: dict = Depends(require_scope("invoices:read"))):
    q = {"merchant_id": ctx["merchant"]["id"]}
    rows = await db.invoices.find(q, {"_id": 0}).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    return {"data": [public_invoice(r) for r in rows], "page": page, "page_size": page_size, "total": await db.invoices.count_documents(q)}


@v1.get("/invoices/{invoice_id}")
async def v1_get(invoice_id: str, ctx: dict = Depends(require_scope("invoices:read"))):
    inv = await db.invoices.find_one({"id": invoice_id, "merchant_id": ctx["merchant"]["id"]}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice tidak ditemukan")
    return public_invoice(inv)


@v1.get("/webhook-deliveries")
async def v1_deliveries(ctx: dict = Depends(require_scope("webhooks:read"))):
    return {"data": await db.webhook_deliveries.find({"merchant_id": ctx["merchant"]["id"]}, {"_id": 0, "payload": 0}).sort("created_at", -1).limit(100).to_list(100)}


@v1.api_route("/{path:path}", methods=["GET", "POST"], include_in_schema=False)
async def v1_not_implemented(path: str):
    if path.split("/")[0] in ("payments", "payment-links", "transactions", "balances", "settlements", "withdrawals", "webhook-endpoints"):
        raise HTTPException(501, f"Endpoint /v1/{path} belum diimplementasikan (NOT_IMPLEMENTED)")
    raise HTTPException(404, "Endpoint tidak ditemukan")


__all__ = ["router", "v1", "emit_event"]
