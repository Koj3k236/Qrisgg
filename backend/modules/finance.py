import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from core.audit import audit
from core.db import db
from core.deps import require_admin, require_perm, require_scope
from core.security import new_id, iso, encrypt
from modules import ledger as L
from modules.admin import _step_up

merchant = APIRouter(prefix="/api/merchant", tags=["finance"])
admin = APIRouter(prefix="/api/admin", tags=["admin-finance"])
v1 = APIRouter(prefix="/api/v1", tags=["public-api-v1"])
admin_dep = require_admin()


class BankIn(BaseModel):
    bank_name: str = Field(min_length=2, max_length=60)
    account_holder: str = Field(min_length=2, max_length=100)
    account_number: str = Field(pattern=r"^\d{6,20}$")


class WithdrawIn(BaseModel):
    amount: int = Field(gt=0)
    bank_account_id: str


class AutoIn(BaseModel):
    enabled: bool
    bank_account_id: str | None = None
    min_amount: int = Field(0, ge=0)


class DecisionIn(BaseModel):
    note: str = Field(min_length=3, max_length=300)
    totp_code: str = Field(min_length=6, max_length=6)


def _bank_view(b):
    return {k: b.get(k) for k in ("id", "bank_name", "account_holder", "account_number_masked", "status", "created_at")}


@merchant.get("/balance")
async def balance(ctx: dict = Depends(require_perm("invoices:read"))):
    mid = ctx["merchant"]["id"]
    journals = await db.ledger_journals.find({"merchant_id": mid}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    holds = await db.settlements.find({"merchant_id": mid, "status": {"$in": ["CONFIRMED", "REVIEW_REQUIRED"]}}, {"_id": 0, "history": 0}).to_list(100)
    return {"mode": "SANDBOX", "model": "MANAGED_SIMULATION", "balances": await L.balances(mid), "journals": journals, "holds": holds}


@merchant.get("/settlements")
async def settlements(ctx: dict = Depends(require_perm("invoices:read"))):
    return await db.settlements.find({"merchant_id": ctx["merchant"]["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)


@merchant.get("/bank-accounts")
async def bank_accounts(ctx: dict = Depends(require_perm("settings:manage"))):
    return [_bank_view(b) for b in await db.bank_accounts.find({"merchant_id": ctx["merchant"]["id"], "status": {"$ne": "REMOVED"}}, {"_id": 0}).to_list(20)]


@merchant.post("/bank-accounts")
async def add_bank(body: BankIn, request: Request, ctx: dict = Depends(require_perm("settings:manage"))):
    doc = {"id": new_id("bnk"), "merchant_id": ctx["merchant"]["id"], "bank_name": body.bank_name, "account_holder": body.account_holder,
           "account_number_enc": encrypt(body.account_number), "account_number_last4": body.account_number[-4:],
           "account_number_masked": "•••• " + body.account_number[-4:], "status": "PENDING_VERIFICATION", "created_at": iso()}
    await db.bank_accounts.insert_one(dict(doc))
    await audit("bank_account.added", actor_id=ctx["user"]["id"], merchant_id=doc["merchant_id"], target_type="bank_account", target_id=doc["id"], request=request)
    return _bank_view(doc)


@merchant.delete("/bank-accounts/{bid}")
async def remove_bank(bid: str, request: Request, ctx: dict = Depends(require_perm("settings:manage"))):
    res = await db.bank_accounts.update_one({"id": bid, "merchant_id": ctx["merchant"]["id"]}, {"$set": {"status": "REMOVED"}})
    if not res.matched_count:
        raise HTTPException(404, "Rekening tidak ditemukan")
    await audit("bank_account.removed", actor_id=ctx["user"]["id"], merchant_id=ctx["merchant"]["id"], target_type="bank_account", target_id=bid, request=request)
    return {"ok": True}


@merchant.get("/withdrawals")
async def withdrawals(ctx: dict = Depends(require_perm("invoices:read"))):
    rows = await db.withdrawal_requests.find({"merchant_id": ctx["merchant"]["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return {"items": rows, "auto_withdraw": ctx["merchant"].get("auto_withdraw") or {"enabled": False}}


@merchant.post("/withdrawals")
async def create_withdrawal(body: WithdrawIn, request: Request, idempotency_key: str | None = Header(None, max_length=100),
                            ctx: dict = Depends(require_perm("settings:manage"))):
    w = await L.request_withdrawal(ctx["merchant"], amount=body.amount, bank_account_id=body.bank_account_id, actor_id=ctx["user"]["id"],
                                   idempotency_key=idempotency_key or secrets.token_hex(12), source="MANUAL")
    await audit("withdrawal.requested", actor_id=ctx["user"]["id"], merchant_id=ctx["merchant"]["id"], target_type="withdrawal",
                target_id=w["id"], metadata={"amount": body.amount}, request=request)
    return w


@merchant.put("/withdrawals/auto")
async def set_auto(body: AutoIn, request: Request, ctx: dict = Depends(require_perm("settings:manage"))):
    if body.enabled and not await db.bank_accounts.find_one({"id": body.bank_account_id, "merchant_id": ctx["merchant"]["id"], "status": "VERIFIED"}):
        raise HTTPException(422, "Pilih rekening terverifikasi untuk penarikan otomatis")
    value = {**body.model_dump(), "last_run_at": (ctx["merchant"].get("auto_withdraw") or {}).get("last_run_at")}
    await db.merchants.update_one({"id": ctx["merchant"]["id"]}, {"$set": {"auto_withdraw": value}})
    await audit("withdrawal.auto_updated", actor_id=ctx["user"]["id"], merchant_id=ctx["merchant"]["id"], metadata=body.model_dump(), request=request)
    return value


@admin.get("/ledger")
async def ledger(admin_user: dict = Depends(admin_dep)):
    journals = await db.ledger_journals.find({}, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    return {"journals": journals, "invariants": await L.invariants()}


@admin.get("/settlements")
async def admin_settlements(admin_user: dict = Depends(admin_dep)):
    return await db.settlements.find({}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)


@admin.post("/settlements/{sid}/{action}")
async def settlement_action(sid: str, action: str, body: DecisionIn, request: Request, admin_user: dict = Depends(admin_dep)):
    fn = {"confirm": L.confirm_settlement, "fail": L.fail_settlement, "release": L.admin_release_review}.get(action)
    if not fn:
        raise HTTPException(404, "Aksi tidak dikenal")
    await _step_up(admin_user, body.totp_code)
    s = await fn(sid, admin_user["id"], body.note)
    await audit(f"admin.settlement_{action}", actor_id=admin_user["id"], merchant_id=s["merchant_id"], target_type="settlement", target_id=sid,
                metadata={"note": body.note}, request=request)
    return {k: v for k, v in s.items() if k != "history"}


@admin.get("/withdrawals")
async def admin_withdrawals(admin_user: dict = Depends(admin_dep)):
    return await db.withdrawal_requests.find({}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)


@admin.post("/withdrawals/{wid}/{action}")
async def withdrawal_action(wid: str, action: str, body: DecisionIn, request: Request, admin_user: dict = Depends(admin_dep)):
    if action not in ("approve", "reject"):
        raise HTTPException(404, "Aksi tidak dikenal")
    await _step_up(admin_user, body.totp_code)
    if action == "approve":
        w = await L._move("withdrawal_requests", wid, L.WITHDRAWAL_TRANSITIONS, "APPROVED", {"decided_by": admin_user["id"], "reason": body.note, "next_attempt_at": None})
    else:
        w = await L.reject_withdrawal(wid, admin_user["id"], body.note)
    await audit(f"admin.withdrawal_{action}", actor_id=admin_user["id"], merchant_id=w["merchant_id"], target_type="withdrawal", target_id=wid,
                metadata={"note": body.note, "amount": w["amount"]}, request=request)
    return {k: v for k, v in w.items() if k != "history"}


@admin.get("/bank-accounts")
async def admin_banks(admin_user: dict = Depends(admin_dep)):
    return [{**_bank_view(b), "merchant_id": b["merchant_id"]} for b in await db.bank_accounts.find({"status": {"$ne": "REMOVED"}}, {"_id": 0}).to_list(200)]


@admin.post("/bank-accounts/{bid}/{action}")
async def bank_action(bid: str, action: str, request: Request, admin_user: dict = Depends(admin_dep)):
    status = {"verify": "VERIFIED", "reject": "REJECTED"}.get(action)
    if not status:
        raise HTTPException(404, "Aksi tidak dikenal")
    b = await db.bank_accounts.find_one_and_update({"id": bid, "status": "PENDING_VERIFICATION"}, {"$set": {"status": status, "reviewed_by": admin_user["id"]}})
    if not b:
        raise HTTPException(409, "Rekening tidak dalam status menunggu verifikasi")
    await audit(f"admin.bank_account_{action}", actor_id=admin_user["id"], merchant_id=b["merchant_id"], target_type="bank_account", target_id=bid, request=request)
    return {"id": bid, "status": status}


@v1.get("/balances")
async def v1_balances(ctx: dict = Depends(require_scope("invoices:read"))):
    return {"mode": "SANDBOX", "data": await L.balances(ctx["merchant"]["id"])}


@v1.get("/settlements")
async def v1_settlements(ctx: dict = Depends(require_scope("invoices:read"))):
    return {"data": await db.settlements.find({"merchant_id": ctx["merchant"]["id"]}, {"_id": 0, "history": 0}).sort("created_at", -1).limit(100).to_list(100)}
