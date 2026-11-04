from collections import defaultdict
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr, Field

from core.audit import audit
from core.config import MERCHANT_ROLES
from core.db import db
from core.deps import get_merchant_ctx, require_perm
from core.security import new_id, iso, now
from modules.providers import MandiriStaticQrisConfiguration

router = APIRouter(prefix="/api/merchant", tags=["merchant"])


class ProfileIn(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=120)
    business_type: str | None = Field(None, max_length=80)
    phone: str | None = Field(None, max_length=30)
    website: str | None = Field(None, max_length=200)
    address: str | None = Field(None, max_length=300)


class MemberIn(BaseModel):
    email: EmailStr
    role: str


class RoleIn(BaseModel):
    role: str


class QrisIn(BaseModel):
    label: str = Field(min_length=2, max_length=80)
    qris_payload: str | None = Field(None, max_length=512)
    nmid: str | None = Field(None, max_length=40)
    authorization_confirmed: bool


class TicketIn(BaseModel):
    subject: str = Field(min_length=3, max_length=140)
    message: str = Field(min_length=5, max_length=3000)
    category: str = Field("GENERAL", max_length=30)


@router.get("/overview")
async def overview(ctx: dict = Depends(require_perm("invoices:read"))):
    mid = ctx["merchant"]["id"]
    by_status = {r["_id"]: {"count": r["count"], "amount": r["amount"]} async for r in db.invoices.aggregate([
        {"$match": {"merchant_id": mid}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}, "amount": {"$sum": "$payable_amount"}}}])}
    total = sum(v["count"] for v in by_status.values())
    start = (now() - timedelta(days=13)).replace(hour=0, minute=0, second=0, microsecond=0)
    days = {(start + timedelta(days=i)).date().isoformat(): {"date": (start + timedelta(days=i)).date().isoformat(),
                                                             "created": 0, "verified": 0, "verified_amount": 0} for i in range(14)}
    async for inv in db.invoices.find({"merchant_id": mid, "created_at": {"$gte": iso(start)}},
                                      {"_id": 0, "created_at": 1, "status": 1, "payable_amount": 1, "verified_at": 1}):
        d = inv["created_at"][:10]
        if d in days:
            days[d]["created"] += 1
        if inv["status"] == "PAID_VERIFIED" and inv.get("verified_at", "")[:10] in days:
            days[inv["verified_at"][:10]]["verified"] += 1
            days[inv["verified_at"][:10]]["verified_amount"] += inv["payable_amount"]
    recent = await db.invoices.find({"merchant_id": mid}, {"_id": 0, "id": 1, "external_id": 1, "payable_amount": 1,
                                                          "status": 1, "created_at": 1}).sort("created_at", -1).limit(6).to_list(6)
    wh = defaultdict(int)
    async for r in db.webhook_deliveries.aggregate([{"$match": {"merchant_id": mid}}, {"$group": {"_id": "$status", "n": {"$sum": 1}}}]):
        wh[r["_id"]] = r["n"]
    activity = await db.audit_logs.find({"merchant_id": mid}, {"_id": 0}).sort("created_at", -1).limit(8).to_list(8)
    pending_states = ("PENDING", "PAYMENT_DETECTED", "AWAITING_VERIFICATION")
    return {
        "merchant": ctx["merchant"], "role": ctx["role"], "total_invoices": total, "by_status": by_status,
        "verified_count": by_status.get("PAID_VERIFIED", {}).get("count", 0),
        "verified_amount": by_status.get("PAID_VERIFIED", {}).get("amount", 0),
        "pending_count": sum(by_status.get(s, {}).get("count", 0) for s in pending_states),
        "review_count": by_status.get("REVIEW_REQUIRED", {}).get("count", 0),
        "chart": list(days.values()), "recent_invoices": recent, "webhook_deliveries": dict(wh),
        "qris_accounts": await db.qris_accounts.count_documents({"merchant_id": mid}), "activity": activity,
    }


@router.get("/profile")
async def get_profile(ctx: dict = Depends(get_merchant_ctx)):
    return {**ctx["merchant"], "role": ctx["role"]}


@router.patch("/profile")
async def update_profile(body: ProfileIn, request: Request, ctx: dict = Depends(require_perm("settings:manage"))):
    changes = {k: v for k, v in body.model_dump().items() if v is not None}
    if changes:
        await db.merchants.update_one({"id": ctx["merchant"]["id"]}, {"$set": {**changes, "updated_at": iso()}})
        await audit("merchant.profile_updated", actor_id=ctx["user"]["id"], merchant_id=ctx["merchant"]["id"],
                    target_type="merchant", target_id=ctx["merchant"]["id"], metadata={"fields": list(changes)}, request=request)
    return await db.merchants.find_one({"id": ctx["merchant"]["id"]}, {"_id": 0})


@router.get("/team")
async def team(ctx: dict = Depends(get_merchant_ctx)):
    members = await db.merchant_members.find({"merchant_id": ctx["merchant"]["id"]}, {"_id": 0}).to_list(200)
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": [m["user_id"] for m in members]}},
                                                     {"_id": 0, "id": 1, "name": 1, "email": 1}).to_list(200)}
    return [{**m, "name": users.get(m["user_id"], {}).get("name"), "email": users.get(m["user_id"], {}).get("email")} for m in members]


@router.post("/team")
async def add_member(body: MemberIn, request: Request, ctx: dict = Depends(require_perm("team:manage"))):
    if body.role not in MERCHANT_ROLES or body.role == "MERCHANT_OWNER":
        raise HTTPException(422, "Peran tidak valid")
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0, "id": 1})
    if not user:
        raise HTTPException(404, "Pengguna belum terdaftar. Minta mereka mendaftar akun Qrisgg terlebih dahulu.")
    mid = ctx["merchant"]["id"]
    if await db.merchant_members.find_one({"merchant_id": mid, "user_id": user["id"]}):
        raise HTTPException(409, "Pengguna sudah menjadi anggota")
    doc = {"id": new_id("mem"), "merchant_id": mid, "user_id": user["id"], "role": body.role, "created_at": iso()}
    await db.merchant_members.insert_one(dict(doc))
    await audit("merchant.member_added", actor_id=ctx["user"]["id"], merchant_id=mid, target_type="user",
                target_id=user["id"], metadata={"role": body.role}, request=request)
    return doc


async def _member(ctx, member_id):
    m = await db.merchant_members.find_one({"id": member_id, "merchant_id": ctx["merchant"]["id"]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Anggota tidak ditemukan")
    if m["role"] == "MERCHANT_OWNER":
        raise HTTPException(403, "Pemilik merchant tidak dapat diubah")
    return m


@router.patch("/team/{member_id}")
async def change_role(member_id: str, body: RoleIn, request: Request, ctx: dict = Depends(require_perm("team:manage"))):
    if body.role not in MERCHANT_ROLES or body.role == "MERCHANT_OWNER":
        raise HTTPException(422, "Peran tidak valid")
    m = await _member(ctx, member_id)
    await db.merchant_members.update_one({"id": member_id}, {"$set": {"role": body.role}})
    await audit("merchant.member_role_changed", actor_id=ctx["user"]["id"], merchant_id=ctx["merchant"]["id"],
                target_type="user", target_id=m["user_id"], metadata={"from": m["role"], "to": body.role}, request=request)
    return {**m, "role": body.role}


@router.delete("/team/{member_id}")
async def remove_member(member_id: str, request: Request, ctx: dict = Depends(require_perm("team:manage"))):
    m = await _member(ctx, member_id)
    await db.merchant_members.delete_one({"id": member_id})
    await audit("merchant.member_removed", actor_id=ctx["user"]["id"], merchant_id=ctx["merchant"]["id"],
                target_type="user", target_id=m["user_id"], request=request)
    return {"ok": True}


@router.get("/qris")
async def list_qris(ctx: dict = Depends(get_merchant_ctx)):
    return await db.qris_accounts.find({"merchant_id": ctx["merchant"]["id"]}, {"_id": 0, "qris_payload": 0}).to_list(50)


@router.post("/qris")
async def add_qris(body: QrisIn, request: Request, ctx: dict = Depends(require_perm("qris:manage"))):
    if not body.authorization_confirmed:
        raise HTTPException(422, "Anda wajib menyatakan bahwa QRIS ini milik/diotorisasi untuk bisnis Anda")
    parsed = {}
    if body.qris_payload:
        try:
            parsed = MandiriStaticQrisConfiguration.validate(body.qris_payload)
        except ValueError as e:
            raise HTTPException(422, str(e))
    doc = {"id": new_id("qra"), "merchant_id": ctx["merchant"]["id"], "provider": "MANDIRI_LIVIN_USAHA", "label": body.label,
           "nmid": body.nmid, "qris_payload": body.qris_payload, "qris_merchant_name": parsed.get("merchant_name"),
           "qris_merchant_city": parsed.get("merchant_city"), "payload_validated": bool(parsed), "status": "PENDING_REVIEW",
           "authorization_confirmed_by": ctx["user"]["id"], "created_at": iso()}
    await db.qris_accounts.insert_one(dict(doc))
    await audit("qris.account_submitted", actor_id=ctx["user"]["id"], merchant_id=ctx["merchant"]["id"],
                target_type="qris_account", target_id=doc["id"], request=request)
    doc.pop("qris_payload")
    return doc


@router.delete("/qris/{qris_id}")
async def disable_qris(qris_id: str, request: Request, ctx: dict = Depends(require_perm("qris:manage"))):
    res = await db.qris_accounts.update_one({"id": qris_id, "merchant_id": ctx["merchant"]["id"]}, {"$set": {"status": "DISABLED"}})
    if not res.matched_count:
        raise HTTPException(404, "Akun QRIS tidak ditemukan")
    await audit("qris.account_disabled", actor_id=ctx["user"]["id"], merchant_id=ctx["merchant"]["id"],
                target_type="qris_account", target_id=qris_id, request=request)
    return {"ok": True}


@router.get("/payment-events")
async def payment_events(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                         ctx: dict = Depends(require_perm("invoices:read"))):
    q = {"merchant_id": ctx["merchant"]["id"]}
    total = await db.payment_events.count_documents(q)
    items = await db.payment_events.find(q, {"_id": 0, "raw": 0}).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/audit-logs")
async def merchant_audit(ctx: dict = Depends(require_perm("settings:manage"))):
    return await db.audit_logs.find({"merchant_id": ctx["merchant"]["id"]}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)


@router.get("/support")
async def list_tickets(ctx: dict = Depends(get_merchant_ctx)):
    return await db.support_tickets.find({"merchant_id": ctx["merchant"]["id"]}, {"_id": 0}).sort("created_at", -1).to_list(100)


@router.post("/support")
async def create_ticket(body: TicketIn, request: Request, ctx: dict = Depends(get_merchant_ctx)):
    doc = {"id": new_id("tkt"), "merchant_id": ctx["merchant"]["id"], "user_id": ctx["user"]["id"], "subject": body.subject,
           "message": body.message, "category": body.category, "status": "OPEN", "source": "DASHBOARD", "created_at": iso()}
    await db.support_tickets.insert_one(dict(doc))
    await audit("support.ticket_created", actor_id=ctx["user"]["id"], merchant_id=ctx["merchant"]["id"],
                target_type="ticket", target_id=doc["id"], request=request)
    return doc
