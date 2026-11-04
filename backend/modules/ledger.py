"""Phase 8 (SANDBOX): immutable double-entry ledger, settlements, holds, bank accounts and simulated withdrawals.
Journals embed their lines so each journal write is a single atomic document insert, even without replica-set transactions."""
import asyncio
from datetime import timedelta

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from core.db import db
from core.security import new_id, iso, now
from core.settings_store import get_settings
from modules.webhooks import emit_event

SETTLEMENT_TRANSITIONS = {"PENDING_CONFIRMATION": {"CONFIRMED", "FAILED"}, "CONFIRMED": {"RELEASED", "REVIEW_REQUIRED"},
                          "REVIEW_REQUIRED": {"RELEASED", "FAILED"}, "FAILED": set(), "RELEASED": set()}
WITHDRAWAL_TRANSITIONS = {"REQUESTED": {"APPROVED", "REJECTED"}, "APPROVED": {"PROCESSING"},
                          "PROCESSING": {"COMPLETED", "RETRY_PENDING", "FAILED"}, "RETRY_PENDING": {"PROCESSING"},
                          "COMPLETED": set(), "REJECTED": set(), "FAILED": set()}
MAX_PAYOUT_ATTEMPTS = 3


def acct(merchant_id: str, kind: str) -> str:
    return f"merchant:{merchant_id}:{kind}"


async def post_journal(*, idempotency_key: str, reference_type: str, reference_id: str, merchant_id: str | None,
                       description: str, lines: list[tuple[str, int, int]], actor_id: str | None) -> dict:
    """lines: (account, debit, credit). Rejects unbalanced journals; duplicate idempotency_key returns the existing journal."""
    if not lines or any(d < 0 or c < 0 or (d and c) for _, d, c in lines):
        raise ValueError("Baris jurnal tidak valid")
    if sum(d for _, d, _ in lines) != sum(c for _, _, c in lines):
        raise ValueError("Jurnal tidak seimbang")
    doc = {"id": new_id("jrn"), "idempotency_key": idempotency_key, "reference_type": reference_type, "reference_id": reference_id,
           "merchant_id": merchant_id, "description": description, "mode": "SANDBOX", "actor_id": actor_id, "created_at": iso(),
           "lines": [{"account": a, "debit": d, "credit": c} for a, d, c in lines]}
    try:
        await db.ledger_journals.insert_one(dict(doc))
    except DuplicateKeyError:
        return await db.ledger_journals.find_one({"idempotency_key": idempotency_key}, {"_id": 0})
    return doc


async def balances(merchant_id: str) -> dict:
    prefix = f"merchant:{merchant_id}:"
    out = {"pending": 0, "available": 0, "payout_reserved": 0}
    async for r in db.ledger_journals.aggregate([
        {"$match": {"lines.account": {"$regex": f"^{prefix}"}}}, {"$unwind": "$lines"},
        {"$match": {"lines.account": {"$regex": f"^{prefix}"}}},
        {"$group": {"_id": "$lines.account", "bal": {"$sum": {"$subtract": ["$lines.credit", "$lines.debit"]}}}}]):
        out[r["_id"][len(prefix):]] = r["bal"]
    return out


async def invariants() -> dict:
    unbalanced, total_d, total_c, count = [], 0, 0, 0
    async for j in db.ledger_journals.find({}, {"_id": 0, "id": 1, "lines": 1}):
        d, c = sum(l["debit"] for l in j["lines"]), sum(l["credit"] for l in j["lines"])
        count, total_d, total_c = count + 1, total_d + d, total_c + c
        if d != c:
            unbalanced.append(j["id"])
    negative = []
    async for r in db.ledger_journals.aggregate([{"$unwind": "$lines"}, {"$match": {"lines.account": {"$regex": "^merchant:"}}},
                                                 {"$group": {"_id": "$lines.account", "bal": {"$sum": {"$subtract": ["$lines.credit", "$lines.debit"]}}}},
                                                 {"$match": {"bal": {"$lt": 0}}}]):
        negative.append(r)
    dup_credit = [r async for r in db.ledger_journals.aggregate([
        {"$match": {"reference_type": "settlement_confirmed"}}, {"$group": {"_id": "$reference_id", "n": {"$sum": 1}}}, {"$match": {"n": {"$gt": 1}}}])]
    return {"journals": count, "total_debit": total_d, "total_credit": total_c, "balanced": total_d == total_c and not unbalanced,
            "unbalanced_journals": unbalanced, "negative_merchant_accounts": negative, "double_credits": dup_credit,
            "ok": total_d == total_c and not unbalanced and not negative and not dup_credit}


async def _merchant_lock(merchant_id: str):
    for _ in range(50):
        try:
            await db.ledger_locks.find_one_and_update(
                {"merchant_id": merchant_id, "$or": [{"locked_until": {"$lt": iso()}}, {"locked_until": None}]},
                {"$set": {"locked_until": iso(now() + timedelta(seconds=10))}}, upsert=True)
            return
        except DuplicateKeyError:
            await asyncio.sleep(0.1)
    raise HTTPException(409, "Ledger merchant sedang diproses, coba lagi")


async def _unlock(merchant_id: str):
    await db.ledger_locks.update_one({"merchant_id": merchant_id}, {"$set": {"locked_until": None}})


async def _move(coll, doc_id: str, table: dict, to: str, extra: dict | None = None) -> dict:
    cur = await db[coll].find_one({"id": doc_id}, {"_id": 0})
    if not cur:
        raise HTTPException(404, "Data tidak ditemukan")
    if to not in table.get(cur["status"], set()):
        raise HTTPException(409, f"Transisi {cur['status']} -> {to} tidak diizinkan")
    hist = {"from": cur["status"], "to": to, "at": iso(), **({"reason": extra.pop("reason")} if extra and "reason" in extra else {})}
    res = await db[coll].update_one({"id": doc_id, "status": cur["status"]},
                                    {"$set": {"status": to, "updated_at": iso(), **(extra or {})}, "$push": {"history": hist}})
    if res.modified_count != 1:
        raise HTTPException(409, "Status berubah bersamaan, ulangi")
    return {**cur, "status": to, **(extra or {})}


# ---------- Settlement ----------

async def create_settlement_for_invoice(inv: dict) -> None:
    try:
        await db.settlements.insert_one({"id": new_id("stl"), "invoice_id": inv["id"], "merchant_id": inv["merchant_id"],
                                         "amount": inv["payable_amount"], "status": "PENDING_CONFIRMATION", "mode": "SANDBOX",
                                         "hold_release_at": None, "history": [], "created_at": iso(), "updated_at": iso()})
    except DuplicateKeyError:
        pass


async def confirm_settlement(sid: str, actor_id: str, note: str) -> dict:
    hours = (await get_settings())["hold_hours"]
    cur = await db.settlements.find_one({"id": sid}, {"_id": 0})
    if not cur:
        raise HTTPException(404, "Data tidak ditemukan")
    if "CONFIRMED" not in SETTLEMENT_TRANSITIONS[cur["status"]]:
        raise HTTPException(409, f"Transisi {cur['status']} -> CONFIRMED tidak diizinkan")
    await post_journal(idempotency_key=f"settlement_confirmed:{sid}", reference_type="settlement_confirmed", reference_id=sid,
                       merchant_id=cur["merchant_id"], description=f"Settlement sandbox dikonfirmasi untuk {cur['invoice_id']}",
                       lines=[("platform:settlement_clearing", cur["amount"], 0), (acct(cur["merchant_id"], "pending"), 0, cur["amount"])], actor_id=actor_id)
    s = await _move("settlements", sid, SETTLEMENT_TRANSITIONS, "CONFIRMED",
                    {"confirmed_at": iso(), "confirmed_by": actor_id, "hold_release_at": iso(now() + timedelta(hours=hours)), "reason": note})
    await emit_event(s["merchant_id"], "settlement.confirmed", {"settlement_id": sid, "invoice_id": s["invoice_id"], "amount": s["amount"]})
    return s


async def fail_settlement(sid: str, actor_id: str, note: str) -> dict:
    cur = await db.settlements.find_one({"id": sid}, {"_id": 0})
    if cur and cur["status"] == "REVIEW_REQUIRED":
        raise HTTPException(409, "Settlement yang sudah dikreditkan harus dirilis atau ditinjau manual")
    return await _move("settlements", sid, SETTLEMENT_TRANSITIONS, "FAILED", {"failed_by": actor_id, "reason": note})


async def release_due_holds() -> int:
    """Releases pending -> available only when settlement CONFIRMED, hold elapsed, merchant ACTIVE and invoice still PAID_VERIFIED."""
    n = 0
    async for s in db.settlements.find({"status": "CONFIRMED", "hold_release_at": {"$lte": iso()}}, {"_id": 0}):
        merchant = await db.merchants.find_one({"id": s["merchant_id"]}, {"status": 1})
        inv = await db.invoices.find_one({"id": s["invoice_id"]}, {"status": 1})
        if not merchant or merchant["status"] != "ACTIVE" or not inv or inv["status"] != "PAID_VERIFIED":
            reason = "Merchant tidak aktif atau status invoice berubah"
            await _move("settlements", s["id"], SETTLEMENT_TRANSITIONS, "REVIEW_REQUIRED", {"reason": reason})
            continue
        await post_journal(idempotency_key=f"hold_release:{s['id']}", reference_type="hold_release", reference_id=s["id"],
                           merchant_id=s["merchant_id"], description="Pelepasan hold", actor_id=None,
                           lines=[(acct(s["merchant_id"], "pending"), s["amount"], 0), (acct(s["merchant_id"], "available"), 0, s["amount"])])
        await _move("settlements", s["id"], SETTLEMENT_TRANSITIONS, "RELEASED", {"released_at": iso(), "reason": "Hold selesai & eligibility terpenuhi"})
        n += 1
    return n


async def admin_release_review(sid: str, actor_id: str, note: str) -> dict:
    s = await _move("settlements", sid, SETTLEMENT_TRANSITIONS, "RELEASED", {"released_at": iso(), "reason": note})
    await post_journal(idempotency_key=f"hold_release:{sid}", reference_type="hold_release", reference_id=sid, merchant_id=s["merchant_id"],
                       description="Pelepasan hold setelah review admin", actor_id=actor_id,
                       lines=[(acct(s["merchant_id"], "pending"), s["amount"], 0), (acct(s["merchant_id"], "available"), 0, s["amount"])])
    return s


# ---------- Withdrawals ----------

async def request_withdrawal(merchant: dict, *, amount: int, bank_account_id: str, actor_id: str, idempotency_key: str, source: str) -> dict:
    prior = await db.withdrawal_requests.find_one({"merchant_id": merchant["id"], "idempotency_key": idempotency_key}, {"_id": 0})
    if prior:
        return prior
    settings = await get_settings()
    if not settings["withdrawal_min"] <= amount <= settings["withdrawal_max"]:
        raise HTTPException(422, f"Nominal penarikan harus Rp{settings['withdrawal_min']:,} - Rp{settings['withdrawal_max']:,}".replace(",", "."))
    bank = await db.bank_accounts.find_one({"id": bank_account_id, "merchant_id": merchant["id"], "status": "VERIFIED"})
    if not bank:
        raise HTTPException(422, "Rekening tujuan belum terverifikasi")
    if merchant["status"] != "ACTIVE":
        raise HTTPException(403, "Merchant harus berstatus ACTIVE untuk menarik dana")
    await _merchant_lock(merchant["id"])
    try:
        prior = await db.withdrawal_requests.find_one({"merchant_id": merchant["id"], "idempotency_key": idempotency_key}, {"_id": 0})
        if prior:
            return prior
        if (await balances(merchant["id"]))["available"] < amount:
            raise HTTPException(422, "Saldo tersedia (sandbox) tidak mencukupi")
        wid = new_id("wdr")
        doc = {"id": wid, "merchant_id": merchant["id"], "amount": amount, "bank_account_id": bank_account_id,
               "bank_snapshot": {k: bank[k] for k in ("bank_name", "account_holder", "account_number_masked")},
               "status": "REQUESTED", "mode": "SANDBOX", "attempts": 0, "idempotency_key": idempotency_key, "source": source,
               "requested_by": actor_id, "history": [], "created_at": iso(), "updated_at": iso()}
        await db.withdrawal_requests.insert_one(dict(doc))
        await post_journal(idempotency_key=f"withdrawal_reserve:{wid}", reference_type="withdrawal_reserve", reference_id=wid,
                           merchant_id=merchant["id"], description="Reservasi dana penarikan", actor_id=actor_id,
                           lines=[(acct(merchant["id"], "available"), amount, 0), (acct(merchant["id"], "payout_reserved"), 0, amount)])
    finally:
        await _unlock(merchant["id"])
    return doc


async def reject_withdrawal(wid: str, actor_id: str, note: str) -> dict:
    w = await _move("withdrawal_requests", wid, WITHDRAWAL_TRANSITIONS, "REJECTED", {"reason": note, "decided_by": actor_id})
    await _reverse(w, actor_id)
    return w


async def _reverse(w: dict, actor_id: str | None) -> None:
    await post_journal(idempotency_key=f"withdrawal_reverse:{w['id']}", reference_type="withdrawal_reverse", reference_id=w["id"],
                       merchant_id=w["merchant_id"], description="Pengembalian reservasi penarikan", actor_id=actor_id,
                       lines=[(acct(w["merchant_id"], "payout_reserved"), w["amount"], 0), (acct(w["merchant_id"], "available"), 0, w["amount"])])


async def process_payouts() -> int:
    """Payout SIMULATOR. Account numbers ending in 0000 simulate a bank rejection (retried, then FAILED)."""
    n = 0
    stale = iso(now() - timedelta(minutes=5))
    await db.withdrawal_requests.update_many({"status": "PROCESSING", "updated_at": {"$lt": stale}},
                                             {"$set": {"status": "RETRY_PENDING", "next_attempt_at": None, "updated_at": iso()},
                                              "$push": {"history": {"from": "PROCESSING", "to": "RETRY_PENDING", "at": iso(), "reason": "Pemulihan proses macet"}}})
    for _ in range(20):
        w = await db.withdrawal_requests.find_one_and_update(
            {"status": {"$in": ["APPROVED", "RETRY_PENDING"]}, "$or": [{"next_attempt_at": None}, {"next_attempt_at": {"$lte": iso()}}, {"next_attempt_at": {"$exists": False}}]},
            {"$set": {"status": "PROCESSING", "updated_at": iso()}, "$inc": {"attempts": 1}}, projection={"_id": 0}, return_document=True)
        if not w:
            break
        n += 1
        await emit_event(w["merchant_id"], "withdrawal.processing", {"withdrawal_id": w["id"], "amount": w["amount"]})
        bank = await db.bank_accounts.find_one({"id": w["bank_account_id"]}, {"_id": 0})
        ok = bank is not None and not bank["account_number_last4"].endswith("0000")
        await db.payout_attempts.insert_one({"id": new_id("pya"), "withdrawal_id": w["id"], "attempt": w["attempts"], "provider": "PAYOUT_SIMULATOR",
                                             "result": "SUCCESS" if ok else "BANK_REJECTED", "created_at": iso()})
        if ok:
            await post_journal(idempotency_key=f"withdrawal_complete:{w['id']}", reference_type="withdrawal_complete", reference_id=w["id"],
                               merchant_id=w["merchant_id"], description="Payout simulasi selesai", actor_id=None,
                               lines=[(acct(w["merchant_id"], "payout_reserved"), w["amount"], 0), ("platform:payout_bank_sandbox", 0, w["amount"])])
            await db.withdrawal_requests.update_one({"id": w["id"]}, {"$set": {"status": "COMPLETED", "completed_at": iso()},
                                                                     "$push": {"history": {"from": "PROCESSING", "to": "COMPLETED", "at": iso()}}})
            await emit_event(w["merchant_id"], "withdrawal.completed", {"withdrawal_id": w["id"], "amount": w["amount"]})
        elif w["attempts"] < MAX_PAYOUT_ATTEMPTS:
            await db.withdrawal_requests.update_one({"id": w["id"]}, {"$set": {"status": "RETRY_PENDING", "next_attempt_at": iso(now() + timedelta(seconds=30 * w["attempts"]))},
                                                                     "$push": {"history": {"from": "PROCESSING", "to": "RETRY_PENDING", "at": iso()}}})
        else:
            await db.withdrawal_requests.update_one({"id": w["id"]}, {"$set": {"status": "FAILED"}, "$push": {"history": {"from": "PROCESSING", "to": "FAILED", "at": iso()}}})
            await _reverse(w, None)
            await emit_event(w["merchant_id"], "withdrawal.failed", {"withdrawal_id": w["id"], "amount": w["amount"]})
    return n


async def run_auto_withdrawals() -> int:
    n = 0
    async for m in db.merchants.find({"status": "ACTIVE", "auto_withdraw.enabled": True}, {"_id": 0}):
        aw = m["auto_withdraw"]
        if aw.get("last_run_at") and aw["last_run_at"] > iso(now() - timedelta(hours=24)):
            continue
        await db.merchants.update_one({"id": m["id"]}, {"$set": {"auto_withdraw.last_run_at": iso()}})
        bal = (await balances(m["id"]))["available"]
        settings = await get_settings()
        if bal < max(aw.get("min_amount", 0), settings["withdrawal_min"]):
            continue
        try:
            await request_withdrawal(m, amount=min(bal, settings["withdrawal_max"]), bank_account_id=aw["bank_account_id"], actor_id=None,
                                     idempotency_key=f"auto:{m['id']}:{iso()[:10]}", source="SCHEDULED")
            n += 1
        except HTTPException:
            continue
    return n
