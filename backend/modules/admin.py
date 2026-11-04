import pyotp
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from core.audit import audit
from core.config import DEFAULT_SETTINGS, PLATFORM_ROLES
from core.db import db
from core.deps import require_admin
from core.security import new_id, iso, decrypt
from core.settings_store import get_settings
from modules.payments import invoice_detail, reconcile_verify, reconcile_fail, transition, ingest_payment_event, public_invoice
from modules.providers import PROVIDERS

router = APIRouter(prefix="/api/admin", tags=["admin"])
admin_dep = require_admin()


class ReasonIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


class VerifyIn(BaseModel):
    event_id: str
    note: str = Field(min_length=5, max_length=500)
    totp_code: str = Field(min_length=6, max_length=6)


class FailIn(BaseModel):
    note: str = Field(min_length=5, max_length=500)
    totp_code: str = Field(min_length=6, max_length=6)


class UserPatch(BaseModel):
    status: str | None = Field(None, pattern="^(ACTIVE|DISABLED)$")
    platform_role: str | None = Field(None, pattern="^(SUPER_ADMIN|ADMIN|NONE)$")


class PlanIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    description: str = Field(max_length=300)
    price_label: str = Field(max_length=60)
    features: list[str] = Field(default_factory=list)
    highlighted: bool = False
    active: bool = True
    sort: int = 0


class IngestIn(BaseModel):
    merchant_id: str
    amount: int = Field(gt=0)
    reference: str = Field(min_length=3, max_length=64)
    qris_account_id: str | None = None


class TicketPatch(BaseModel):
    status: str = Field(pattern="^(OPEN|IN_PROGRESS|RESOLVED|CLOSED)$")


async def _step_up(admin: dict, code: str) -> None:
    full = await db.users.find_one({"id": admin["id"]})
    if not full.get("mfa_enabled") or not pyotp.TOTP(decrypt(full["mfa_secret_enc"])).verify(code, valid_window=1):
        raise HTTPException(401, "Kode 2FA untuk otorisasi tambahan salah")


def _page(page, page_size):
    return (page - 1) * page_size, page_size


@router.get("/overview")
async def overview(admin: dict = Depends(admin_dep)):
    by_status = {r["_id"]: r["n"] async for r in db.invoices.aggregate([{"$group": {"_id": "$status", "n": {"$sum": 1}}}])}
    m_status = {r["_id"]: r["n"] async for r in db.merchants.aggregate([{"$group": {"_id": "$status", "n": {"$sum": 1}}}])}
    return {
        "users": await db.users.count_documents({}), "merchants": m_status, "invoices": by_status,
        "review_queue": by_status.get("REVIEW_REQUIRED", 0) + by_status.get("AWAITING_VERIFICATION", 0),
        "unmatched_events": await db.payment_events.count_documents({"status": "UNMATCHED"}),
        "pending_qris": await db.qris_accounts.count_documents({"status": "PENDING_REVIEW"}),
        "open_tickets": await db.support_tickets.count_documents({"status": {"$in": ["OPEN", "IN_PROGRESS"]}}),
        "dead_letter_webhooks": await db.webhook_deliveries.count_documents({"status": "DEAD_LETTER"}),
        "recent_audit": await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(8).to_list(8),
    }


@router.get("/merchants")
async def merchants(status: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
                    admin: dict = Depends(admin_dep)):
    q = {"status": status} if status else {}
    skip, lim = _page(page, page_size)
    rows = await db.merchants.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(lim).to_list(lim)
    owners = {u["id"]: u for u in await db.users.find({"id": {"$in": [r["owner_user_id"] for r in rows]}},
                                                      {"_id": 0, "id": 1, "email": 1, "name": 1}).to_list(lim)}
    for r in rows:
        r["owner"] = owners.get(r["owner_user_id"])
        r["invoice_count"] = await db.invoices.count_documents({"merchant_id": r["id"]})
    return {"items": rows, "total": await db.merchants.count_documents(q)}


async def _set_merchant_status(mid, status, admin, request, reason):
    m = await db.merchants.find_one({"id": mid})
    if not m:
        raise HTTPException(404, "Merchant tidak ditemukan")
    await db.merchants.update_one({"id": mid}, {"$set": {"status": status, "status_reason": reason, "updated_at": iso()}})
    await audit(f"admin.merchant_{status.lower()}", actor_id=admin["id"], merchant_id=mid, target_type="merchant",
                target_id=mid, metadata={"from": m["status"], "reason": reason}, request=request)
    return await db.merchants.find_one({"id": mid}, {"_id": 0})


@router.post("/merchants/{mid}/approve")
async def approve(mid: str, request: Request, admin: dict = Depends(admin_dep)):
    return await _set_merchant_status(mid, "ACTIVE", admin, request, "Disetujui admin")


@router.post("/merchants/{mid}/suspend")
async def suspend(mid: str, body: ReasonIn, request: Request, admin: dict = Depends(admin_dep)):
    return await _set_merchant_status(mid, "SUSPENDED", admin, request, body.reason)


@router.get("/users")
async def users(page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), admin: dict = Depends(admin_dep)):
    skip, lim = _page(page, page_size)
    rows = await db.users.find({}, {"_id": 0, "password_hash": 0, "mfa_secret_enc": 0, "mfa_pending_enc": 0}).sort("created_at", -1).skip(skip).limit(lim).to_list(lim)
    return {"items": rows, "total": await db.users.count_documents({})}


@router.patch("/users/{uid}")
async def patch_user(uid: str, body: UserPatch, request: Request, admin: dict = Depends(admin_dep)):
    if uid == admin["id"]:
        raise HTTPException(403, "Tidak dapat mengubah akun sendiri")
    target = await db.users.find_one({"id": uid})
    if not target:
        raise HTTPException(404, "Pengguna tidak ditemukan")
    changes = {}
    if body.platform_role is not None:
        if admin.get("platform_role") != "SUPER_ADMIN":
            raise HTTPException(403, "Hanya SUPER_ADMIN yang dapat mengubah peran platform")
        changes["platform_role"] = None if body.platform_role == "NONE" else body.platform_role
    if body.status is not None:
        if target.get("platform_role") == "SUPER_ADMIN":
            raise HTTPException(403, "SUPER_ADMIN tidak dapat dinonaktifkan")
        changes["status"] = body.status
    if changes:
        await db.users.update_one({"id": uid}, {"$set": changes})
        if changes.get("status") == "DISABLED":
            await db.sessions.update_many({"user_id": uid, "revoked_at": None}, {"$set": {"revoked_at": iso()}})
        await audit("admin.user_updated", actor_id=admin["id"], target_type="user", target_id=uid, metadata=changes, request=request)
    return await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0, "mfa_secret_enc": 0, "mfa_pending_enc": 0})


@router.get("/invoices")
async def invoices(status: str | None = None, merchant_id: str | None = None, page: int = Query(1, ge=1),
                   page_size: int = Query(25, ge=1, le=100), admin: dict = Depends(admin_dep)):
    q = {k: v for k, v in {"status": status, "merchant_id": merchant_id}.items() if v}
    skip, lim = _page(page, page_size)
    rows = await db.invoices.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(lim).to_list(lim)
    names = {m["id"]: m["name"] for m in await db.merchants.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)}
    return {"items": [{**public_invoice(r), "merchant_name": names.get(r["merchant_id"])} for r in rows],
            "total": await db.invoices.count_documents(q)}


@router.get("/invoices/{invoice_id}")
async def invoice(invoice_id: str, admin: dict = Depends(admin_dep)):
    return await invoice_detail(invoice_id, None)


@router.post("/invoices/{invoice_id}/verify")
async def verify(invoice_id: str, body: VerifyIn, request: Request, admin: dict = Depends(admin_dep)):
    await _step_up(admin, body.totp_code)
    inv = await reconcile_verify(invoice_id, event_id=body.event_id, actor_id=admin["id"], note=body.note)
    await audit("admin.payment_verified", actor_id=admin["id"], merchant_id=inv["merchant_id"], target_type="invoice",
                target_id=invoice_id, metadata={"event_id": body.event_id, "note": body.note}, request=request)
    return inv


@router.post("/invoices/{invoice_id}/fail")
async def fail(invoice_id: str, body: FailIn, request: Request, admin: dict = Depends(admin_dep)):
    await _step_up(admin, body.totp_code)
    inv = await reconcile_fail(invoice_id, actor_id=admin["id"], note=body.note)
    await audit("admin.payment_failed", actor_id=admin["id"], merchant_id=inv["merchant_id"], target_type="invoice",
                target_id=invoice_id, metadata={"note": body.note}, request=request)
    return inv


@router.post("/invoices/{invoice_id}/review")
async def mark_review(invoice_id: str, body: ReasonIn, request: Request, admin: dict = Depends(admin_dep)):
    inv = await transition(invoice_id, "REVIEW_REQUIRED", source="ADMIN", actor_id=admin["id"], reason=body.reason,
                           extra={"review_reason": body.reason})
    await audit("admin.invoice_review", actor_id=admin["id"], merchant_id=inv["merchant_id"], target_type="invoice",
                target_id=invoice_id, metadata={"reason": body.reason}, request=request)
    return public_invoice(inv)


@router.get("/payment-events")
async def events(status: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
                 admin: dict = Depends(admin_dep)):
    q = {"status": status} if status else {}
    skip, lim = _page(page, page_size)
    rows = await db.payment_events.find(q, {"_id": 0, "raw": 0}).sort("created_at", -1).skip(skip).limit(lim).to_list(lim)
    return {"items": rows, "total": await db.payment_events.count_documents(q)}


@router.post("/payment-events/ingest")
async def ingest(body: IngestIn, request: Request, admin: dict = Depends(admin_dep)):
    """Sandbox manual event ingestion — exercises amount-based matching without a candidate invoice."""
    if not await db.merchants.find_one({"id": body.merchant_id}):
        raise HTTPException(404, "Merchant tidak ditemukan")
    key = f"qris:{body.qris_account_id}" if body.qris_account_id else f"sandbox:{body.merchant_id}"
    event = await ingest_payment_event(source="ADMIN_SANDBOX_INGEST", merchant_id=body.merchant_id, account_key=key,
                                       amount=body.amount, reference=body.reference, dedupe_key=f"admin:{key}:{body.reference}",
                                       actor_id=admin["id"])
    await audit("admin.payment_event_ingested", actor_id=admin["id"], merchant_id=body.merchant_id, target_type="payment_event",
                target_id=event["id"], metadata={"amount": body.amount, "result": event["match_result"]}, request=request)
    return {k: v for k, v in event.items() if k != "raw"}


@router.get("/reconciliation")
async def reconciliation(admin: dict = Depends(admin_dep)):
    return await db.reconciliation_records.find({}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)


@router.get("/qris-accounts")
async def qris_accounts(admin: dict = Depends(admin_dep)):
    return await db.qris_accounts.find({}, {"_id": 0, "qris_payload": 0}).sort("created_at", -1).to_list(200)


@router.post("/qris-accounts/{qid}/{action}")
async def qris_action(qid: str, action: str, request: Request, admin: dict = Depends(admin_dep)):
    status = {"approve": "ACTIVE", "reject": "REJECTED"}.get(action)
    if not status:
        raise HTTPException(404, "Aksi tidak dikenal")
    acct = await db.qris_accounts.find_one_and_update({"id": qid}, {"$set": {"status": status, "reviewed_by": admin["id"], "reviewed_at": iso()}},
                                                      projection={"_id": 0, "qris_payload": 0})
    if not acct:
        raise HTTPException(404, "Akun QRIS tidak ditemukan")
    await audit(f"admin.qris_{action}", actor_id=admin["id"], merchant_id=acct["merchant_id"], target_type="qris_account",
                target_id=qid, request=request)
    return {**acct, "status": status}


@router.get("/providers")
async def providers(admin: dict = Depends(admin_dep)):
    return [await p.get_capabilities() for p in PROVIDERS.values()]


@router.get("/plans")
async def plans(admin: dict = Depends(admin_dep)):
    return await db.pricing_plans.find({}, {"_id": 0}).sort("sort", 1).to_list(50)


@router.post("/plans")
async def create_plan(body: PlanIn, request: Request, admin: dict = Depends(admin_dep)):
    doc = {"id": new_id("pln"), **body.model_dump(), "created_at": iso()}
    await db.pricing_plans.insert_one(dict(doc))
    await audit("admin.plan_created", actor_id=admin["id"], target_type="plan", target_id=doc["id"], request=request)
    return doc


@router.put("/plans/{pid}")
async def update_plan(pid: str, body: PlanIn, request: Request, admin: dict = Depends(admin_dep)):
    res = await db.pricing_plans.update_one({"id": pid}, {"$set": body.model_dump()})
    if not res.matched_count:
        raise HTTPException(404, "Paket tidak ditemukan")
    await audit("admin.plan_updated", actor_id=admin["id"], target_type="plan", target_id=pid, request=request)
    return await db.pricing_plans.find_one({"id": pid}, {"_id": 0})


@router.delete("/plans/{pid}")
async def delete_plan(pid: str, request: Request, admin: dict = Depends(admin_dep)):
    res = await db.pricing_plans.delete_one({"id": pid})
    if not res.deleted_count:
        raise HTTPException(404, "Paket tidak ditemukan")
    await audit("admin.plan_deleted", actor_id=admin["id"], target_type="plan", target_id=pid, request=request)
    return {"ok": True}


@router.get("/audit-logs")
async def audit_logs(action: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
                     admin: dict = Depends(admin_dep)):
    q = {"action": {"$regex": f"^{action}"}} if action and action.replace(".", "").replace("_", "").isalnum() else {}
    skip, lim = _page(page, page_size)
    rows = await db.audit_logs.find(q, {"_id": 0}).sort("created_at", -1).skip(skip).limit(lim).to_list(lim)
    return {"items": rows, "total": await db.audit_logs.count_documents(q)}


@router.get("/settings")
async def get_settings_ep(admin: dict = Depends(admin_dep)):
    from core.db import state
    return {"values": await get_settings(), "transactions_supported": state["transactions"]}


@router.patch("/settings")
async def patch_settings(body: dict, request: Request, admin: dict = Depends(require_admin("SUPER_ADMIN"))):
    current = await get_settings()
    new = {}
    for k, v in body.items():
        if k not in DEFAULT_SETTINGS or not isinstance(v, int) or isinstance(v, bool) or v < 0:
            raise HTTPException(422, f"Pengaturan tidak valid: {k}")
        new[k] = v
    merged = {**current, **new}
    if not 0 < merged["unique_code_min"] < merged["unique_code_max"] <= 9999:
        raise HTTPException(422, "Rentang kode unik tidak valid")
    if merged["min_amount"] >= merged["max_amount"]:
        raise HTTPException(422, "Batas nominal tidak valid")
    await db.system_settings.update_one({"key": "platform"}, {"$set": {"value": merged, "updated_at": iso()}}, upsert=True)
    await audit("admin.settings_updated", actor_id=admin["id"], metadata=new, request=request)
    return merged


@router.get("/support")
async def support(admin: dict = Depends(admin_dep)):
    return await db.support_tickets.find({}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)


@router.patch("/support/{tid}")
async def patch_ticket(tid: str, body: TicketPatch, request: Request, admin: dict = Depends(admin_dep)):
    res = await db.support_tickets.update_one({"id": tid}, {"$set": {"status": body.status, "updated_at": iso()}})
    if not res.matched_count:
        raise HTTPException(404, "Tiket tidak ditemukan")
    await audit("admin.ticket_updated", actor_id=admin["id"], target_type="ticket", target_id=tid, metadata={"status": body.status}, request=request)
    return {"ok": True}


__all__ = ["router", "PLATFORM_ROLES"]
