"""Invoice engine: unique amount allocation, payment state machine, event ingestion and reconciliation."""
import random
from datetime import timedelta

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from core.db import db, atomic, clean
from core.security import new_id, iso, now
from core.settings_store import get_settings
from modules.providers import active_provider
from modules.webhooks import emit_event

TRANSITIONS = {
    "CREATED": {"PENDING", "CANCELLED"},
    "PENDING": {"PAYMENT_DETECTED", "EXPIRED", "CANCELLED", "REVIEW_REQUIRED"},
    "PAYMENT_DETECTED": {"AWAITING_VERIFICATION", "REVIEW_REQUIRED"},
    "AWAITING_VERIFICATION": {"PAID_VERIFIED", "REVIEW_REQUIRED", "FAILED"},
    "REVIEW_REQUIRED": {"PAID_VERIFIED", "FAILED", "CANCELLED"},
    "EXPIRED": {"REVIEW_REQUIRED"},
    "PAID_VERIFIED": {"REFUNDED"},
    "FAILED": set(), "CANCELLED": set(), "REFUNDED": set(),
}
RELEASE_ON = {"PAID_VERIFIED", "CANCELLED", "FAILED", "EXPIRED"}
VERIFY_SOURCES = {"ADMIN_RECONCILIATION", "OFFICIAL_PROVIDER_CALLBACK"}


async def transition(invoice_id: str, to: str, *, source: str, actor_id: str | None, reason: str,
                     event_id: str | None = None, extra: dict | None = None, session=None) -> dict:
    if to == "PAID_VERIFIED" and source not in VERIFY_SOURCES:
        raise HTTPException(409, f"Sumber {source} tidak berwenang memverifikasi pembayaran")
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0}, session=session)
    if not inv:
        raise HTTPException(404, "Invoice tidak ditemukan")
    frm = inv["status"]
    if to not in TRANSITIONS.get(frm, set()):
        raise HTTPException(409, f"Transisi status {frm} -> {to} tidak diizinkan")
    ts = iso()
    res = await db.invoices.update_one({"id": invoice_id, "status": frm},
                                       {"$set": {"status": to, "updated_at": ts, **(extra or {})}}, session=session)
    if res.modified_count != 1:
        raise HTTPException(409, "Status invoice berubah secara bersamaan, silakan ulangi")
    await db.invoice_transitions.insert_one({
        "id": new_id("trn"), "invoice_id": invoice_id, "merchant_id": inv["merchant_id"], "from_status": frm,
        "to_status": to, "event_id": event_id, "source": source, "actor_id": actor_id, "reason": reason, "created_at": ts,
    }, session=session)
    if to in RELEASE_ON:
        cooldown = (await get_settings())["reuse_cooldown_minutes"]
        await db.invoice_unique_allocations.update_one(
            {"invoice_id": invoice_id, "active": True, "reuse_after": None},
            {"$set": {"reuse_after": iso(now() + timedelta(minutes=cooldown))}}, session=session)
    return {**inv, "status": to, **(extra or {})}


async def allocate_unique_code(account_key: str, amount: int, invoice_id: str, merchant_id: str, settings: dict) -> int:
    lo, hi = settings["unique_code_min"], settings["unique_code_max"]
    used = {a["payable_amount"] async for a in db.invoice_unique_allocations.find(
        {"account_key": account_key, "active": True, "payable_amount": {"$gte": amount + lo, "$lte": amount + hi}},
        {"payable_amount": 1})}
    free = [c for c in range(lo, hi + 1) if amount + c not in used]
    random.shuffle(free)
    for code in free[:40]:
        try:
            await db.invoice_unique_allocations.insert_one({
                "id": new_id("alc"), "account_key": account_key, "merchant_id": merchant_id, "invoice_id": invoice_id,
                "base_amount": amount, "unique_code": code, "payable_amount": amount + code,
                "active": True, "reuse_after": None, "created_at": iso(),
            })
            return code
        except DuplicateKeyError:
            continue
    raise HTTPException(409, "Kode unik untuk nominal ini sedang habis. Coba nominal lain atau tunggu beberapa saat.")


def public_invoice(inv: dict) -> dict:
    keys = ("id", "external_id", "merchant_id", "amount", "unique_code", "payable_amount", "currency", "payment_method",
            "status", "mode", "description", "customer_name", "customer_email", "qris_account_id", "expires_at",
            "created_at", "updated_at", "paid_amount", "detected_at", "verified_at", "review_reason", "provider")
    return {k: inv.get(k) for k in keys}


async def create_invoice(merchant: dict, data: dict, *, actor_id: str, source: str, idempotency_key: str | None) -> dict:
    settings = await get_settings()
    amount = data["amount"]
    if not isinstance(amount, int) or not settings["min_amount"] <= amount <= settings["max_amount"]:
        raise HTTPException(422, f"Nominal harus bilangan bulat Rp{settings['min_amount']:,} - Rp{settings['max_amount']:,}".replace(",", "."))
    if idempotency_key:
        prior = await db.idempotency_keys.find_one({"merchant_id": merchant["id"], "key": idempotency_key}, {"_id": 0})
        if prior:
            if prior["request"] != data:
                raise HTTPException(409, "Idempotency-Key sudah dipakai dengan isi permintaan berbeda")
            inv = await db.invoices.find_one({"id": prior["invoice_id"]}, {"_id": 0})
            return {**public_invoice(inv), "idempotent_replay": True}
    external_id = data.get("external_id")
    if external_id and await db.invoices.find_one({"merchant_id": merchant["id"], "external_id": external_id}):
        raise HTTPException(409, "external_id sudah digunakan")
    qris_id = data.get("qris_account_id")
    if qris_id:
        acct = await db.qris_accounts.find_one({"id": qris_id, "merchant_id": merchant["id"]})
        if not acct or acct["status"] != "ACTIVE":
            raise HTTPException(422, "Akun QRIS tidak ditemukan atau belum disetujui")
        account_key = f"qris:{qris_id}"
    else:
        account_key = f"sandbox:{merchant['id']}"
    expires_in = data.get("expires_in") or settings["default_expiry_seconds"]
    invoice_id = new_id("inv")
    code = await allocate_unique_code(account_key, amount, invoice_id, merchant["id"], settings)
    provider = active_provider()
    ts = iso()
    doc = {
        "id": invoice_id, "merchant_id": merchant["id"], "external_id": external_id, "amount": amount,
        "unique_code": code, "payable_amount": amount + code, "currency": "IDR", "payment_method": "QRIS",
        "status": "CREATED", "mode": "SANDBOX", "provider": provider.code, "account_key": account_key,
        "qris_account_id": qris_id, "description": data.get("description"), "customer_name": data.get("customer_name"),
        "customer_email": data.get("customer_email"), "expires_at": iso(now() + timedelta(seconds=expires_in)),
        "created_at": ts, "updated_at": ts, "created_by": actor_id, "created_via": source, "metadata": data.get("metadata") or {},
    }
    doc.update(await provider.create_payment(doc))
    try:
        async with atomic() as s:
            await db.invoices.insert_one(dict(doc), session=s)
            await db.invoice_transitions.insert_one({
                "id": new_id("trn"), "invoice_id": invoice_id, "merchant_id": merchant["id"], "from_status": None,
                "to_status": "CREATED", "event_id": None, "source": source, "actor_id": actor_id,
                "reason": "Invoice dibuat", "created_at": ts}, session=s)
            inv = await transition(invoice_id, "PENDING", source="SYSTEM", actor_id=None,
                                   reason="Menunggu pembayaran", session=s)
            if idempotency_key:
                await db.idempotency_keys.insert_one({"merchant_id": merchant["id"], "key": idempotency_key,
                                                      "request": data, "invoice_id": invoice_id, "created_at": now()}, session=s)
    except Exception:
        await db.invoice_unique_allocations.delete_one({"invoice_id": invoice_id})
        await db.invoices.delete_one({"id": invoice_id, "status": {"$in": ["CREATED", "PENDING"]}})
        raise
    return public_invoice(inv)


async def ingest_payment_event(*, source: str, merchant_id: str, account_key: str, amount: int, reference: str,
                               dedupe_key: str, actor_id: str | None, candidate_invoice_id: str | None = None,
                               raw: dict | None = None) -> dict:
    """Records an untrusted payment signal. Never moves an invoice to PAID_VERIFIED."""
    event = {"id": new_id("evt"), "source": source, "merchant_id": merchant_id, "account_key": account_key,
             "amount": amount, "reference": reference, "dedupe_key": dedupe_key, "status": "RECEIVED",
             "invoice_id": None, "match_result": None, "trusted": False, "raw": raw or {}, "created_at": iso()}
    try:
        await db.payment_events.insert_one(dict(event))
    except DuplicateKeyError:
        raise HTTPException(409, "Event pembayaran duplikat (dedupe_key sudah diproses)")
    alloc = await db.invoice_unique_allocations.find_one({"account_key": account_key, "active": True, "payable_amount": amount})
    matched = alloc["invoice_id"] if alloc else None
    target = candidate_invoice_id or matched
    if not target:
        await db.payment_events.update_one({"id": event["id"]}, {"$set": {"status": "UNMATCHED", "match_result": "NO_ACTIVE_INVOICE"}})
        return {**event, "status": "UNMATCHED", "match_result": "NO_ACTIVE_INVOICE"}
    inv = await db.invoices.find_one({"id": target, "merchant_id": merchant_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice tidak ditemukan")
    reason = None
    if amount != inv["payable_amount"]:
        reason = "UNDERPAYMENT" if amount < inv["payable_amount"] else "OVERPAYMENT"
    elif matched and matched != target:
        reason = "AMBIGUOUS_MATCH"
    st, eid = inv["status"], event["id"]
    if st == "PENDING":
        await transition(target, "PAYMENT_DETECTED", source=source, actor_id=actor_id, event_id=eid,
                         reason=f"Sinyal pembayaran Rp{amount} diterima",
                         extra={"paid_amount": amount, "detected_at": iso(), "last_event_id": eid})
        if reason:
            await transition(target, "REVIEW_REQUIRED", source="MATCHING_ENGINE", actor_id=None, event_id=eid,
                             reason=reason, extra={"review_reason": reason})
        else:
            await transition(target, "AWAITING_VERIFICATION", source="MATCHING_ENGINE", actor_id=None, event_id=eid,
                             reason="Nominal cocok; menunggu rekonsiliasi terpercaya")
        await emit_event(merchant_id, "payment.detected", {"invoice_id": target, "amount": amount, "event_id": eid})
    elif st == "EXPIRED":
        reason = "LATE_PAYMENT"
        await transition(target, "REVIEW_REQUIRED", source="MATCHING_ENGINE", actor_id=None, event_id=eid,
                         reason=reason, extra={"review_reason": reason, "paid_amount": amount, "last_event_id": eid})
    elif st in ("PAYMENT_DETECTED", "AWAITING_VERIFICATION"):
        reason = "DUPLICATE_PAYMENT"
        await transition(target, "REVIEW_REQUIRED", source="MATCHING_ENGINE", actor_id=None, event_id=eid,
                         reason=reason, extra={"review_reason": reason})
    else:
        reason = f"DUPLICATE_OR_INVALID_STATE_{st}"
    status = "REVIEW_REQUIRED" if reason else "MATCHED"
    await db.payment_events.update_one({"id": eid}, {"$set": {"status": status, "invoice_id": target, "match_result": reason or "EXACT_MATCH"}})
    return {**event, "status": status, "invoice_id": target, "match_result": reason or "EXACT_MATCH"}


async def reconcile_verify(invoice_id: str, *, event_id: str, actor_id: str, note: str) -> dict:
    event = await db.payment_events.find_one({"id": event_id, "invoice_id": invoice_id}, {"_id": 0})
    if not event:
        raise HTTPException(422, "Event pembayaran tidak terkait dengan invoice ini")
    inv = await transition(invoice_id, "PAID_VERIFIED", source="ADMIN_RECONCILIATION", actor_id=actor_id,
                           event_id=event_id, reason=note, extra={"verified_at": iso()})
    await db.reconciliation_records.insert_one({
        "id": new_id("rec"), "invoice_id": invoice_id, "merchant_id": inv["merchant_id"], "event_id": event_id,
        "method": "MANUAL_ADMIN_RECONCILIATION", "mode": "SANDBOX", "result": "VERIFIED", "note": note,
        "amount_expected": inv["payable_amount"], "amount_received": event["amount"], "actor_id": actor_id, "created_at": iso()})
    await db.payment_events.update_one({"id": event_id}, {"$set": {"status": "RECONCILED"}})
    await emit_event(inv["merchant_id"], "payment.verified", {"invoice_id": invoice_id, "amount": event["amount"], "event_id": event_id})
    return public_invoice(inv)


async def reconcile_fail(invoice_id: str, *, actor_id: str, note: str) -> dict:
    inv = await transition(invoice_id, "FAILED", source="ADMIN_RECONCILIATION", actor_id=actor_id, reason=note)
    await db.reconciliation_records.insert_one({
        "id": new_id("rec"), "invoice_id": invoice_id, "merchant_id": inv["merchant_id"], "event_id": inv.get("last_event_id"),
        "method": "MANUAL_ADMIN_RECONCILIATION", "mode": "SANDBOX", "result": "FAILED", "note": note,
        "actor_id": actor_id, "created_at": iso()})
    await emit_event(inv["merchant_id"], "payment.failed", {"invoice_id": invoice_id, "reason": note})
    return public_invoice(inv)


async def expire_due_invoices() -> int:
    count = 0
    async for inv in db.invoices.find({"status": "PENDING", "expires_at": {"$lte": iso()}}, {"_id": 0, "id": 1, "merchant_id": 1}):
        try:
            await transition(inv["id"], "EXPIRED", source="SYSTEM_SCHEDULER", actor_id=None, reason="Batas waktu pembayaran habis")
            await emit_event(inv["merchant_id"], "payment.expired", {"invoice_id": inv["id"]})
            count += 1
        except HTTPException:
            continue
    return count


async def release_allocations() -> int:
    res = await db.invoice_unique_allocations.update_many(
        {"active": True, "reuse_after": {"$ne": None, "$lte": iso()}}, {"$set": {"active": False, "released_at": iso()}})
    return res.modified_count


async def invoice_detail(invoice_id: str, merchant_id: str | None) -> dict:
    q = {"id": invoice_id} if merchant_id is None else {"id": invoice_id, "merchant_id": merchant_id}
    inv = await db.invoices.find_one(q, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice tidak ditemukan")
    transitions = await db.invoice_transitions.find({"invoice_id": invoice_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
    events = await db.payment_events.find({"invoice_id": invoice_id}, {"_id": 0, "raw": 0}).sort("created_at", 1).to_list(100)
    recs = await db.reconciliation_records.find({"invoice_id": invoice_id}, {"_id": 0}).to_list(50)
    return {**public_invoice(inv), "qr_string": inv.get("qr_string"), "transitions": transitions, "events": events,
            "reconciliations": recs, "account_key": inv["account_key"]}


__all__ = ["clean"]
