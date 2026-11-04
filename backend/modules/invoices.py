import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel, EmailStr, Field

from core.audit import audit
from core.db import db
from core.deps import require_perm
from modules.payments import create_invoice, invoice_detail, transition, ingest_payment_event, public_invoice

router = APIRouter(prefix="/api/merchant/invoices", tags=["invoices"])


class InvoiceIn(BaseModel):
    amount: int = Field(gt=0)
    external_id: str | None = Field(None, min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:\-]+$")
    description: str | None = Field(None, max_length=200)
    customer_name: str | None = Field(None, max_length=100)
    customer_email: EmailStr | None = None
    expires_in: int | None = Field(None, ge=60, le=86400)
    qris_account_id: str | None = None


class SimulateIn(BaseModel):
    amount: int | None = Field(None, gt=0)
    reference: str | None = Field(None, max_length=64)


class ReasonIn(BaseModel):
    reason: str = Field("Dibatalkan oleh merchant", min_length=3, max_length=200)


@router.post("")
async def create(body: InvoiceIn, request: Request, idempotency_key: str | None = Header(None, max_length=100),
                 ctx: dict = Depends(require_perm("invoices:write"))):
    data = body.model_dump(exclude_none=True)
    inv = await create_invoice(ctx["merchant"], data, actor_id=ctx["user"]["id"], source="DASHBOARD", idempotency_key=idempotency_key)
    if not inv.get("idempotent_replay"):
        await audit("invoice.created", actor_id=ctx["user"]["id"], merchant_id=ctx["merchant"]["id"], target_type="invoice",
                    target_id=inv["id"], metadata={"payable_amount": inv["payable_amount"]}, request=request)
    return inv


@router.get("")
async def list_invoices(status: str | None = None, q: str | None = Query(None, max_length=64),
                        page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                        ctx: dict = Depends(require_perm("invoices:read"))):
    flt = {"merchant_id": ctx["merchant"]["id"]}
    if status:
        flt["status"] = status
    if q:
        flt["$or"] = [{"id": q}, {"external_id": q}]
    total = await db.invoices.count_documents(flt)
    rows = await db.invoices.find(flt, {"_id": 0}).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    return {"items": [public_invoice(r) for r in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/{invoice_id}")
async def get_invoice(invoice_id: str, ctx: dict = Depends(require_perm("invoices:read"))):
    return await invoice_detail(invoice_id, ctx["merchant"]["id"])


@router.post("/{invoice_id}/cancel")
async def cancel(invoice_id: str, body: ReasonIn, request: Request, ctx: dict = Depends(require_perm("invoices:write"))):
    current = await invoice_detail(invoice_id, ctx["merchant"]["id"])
    if current["status"] != "PENDING":
        raise HTTPException(409, "Merchant hanya dapat membatalkan invoice yang masih menunggu pembayaran")
    inv = await transition(invoice_id, "CANCELLED", source="MERCHANT", actor_id=ctx["user"]["id"], reason=body.reason)
    await audit("invoice.cancelled", actor_id=ctx["user"]["id"], merchant_id=ctx["merchant"]["id"], target_type="invoice",
                target_id=invoice_id, request=request)
    return public_invoice(inv)


@router.post("/{invoice_id}/sandbox/simulate-payment")
async def simulate(invoice_id: str, body: SimulateIn, request: Request, ctx: dict = Depends(require_perm("invoices:write"))):
    inv = await invoice_detail(invoice_id, ctx["merchant"]["id"])
    if inv["mode"] != "SANDBOX":
        raise HTTPException(403, "Simulator hanya tersedia untuk invoice SANDBOX")
    amount = body.amount or inv["payable_amount"]
    ref = body.reference or f"SIM-{secrets.token_hex(6).upper()}"
    event = await ingest_payment_event(
        source="SANDBOX_SIMULATOR", merchant_id=ctx["merchant"]["id"], account_key=inv["account_key"], amount=amount,
        reference=ref, dedupe_key=f"sandbox:{inv['account_key']}:{ref}", actor_id=ctx["user"]["id"],
        candidate_invoice_id=invoice_id, raw={"simulated": True})
    await audit("invoice.sandbox_payment_simulated", actor_id=ctx["user"]["id"], merchant_id=ctx["merchant"]["id"],
                target_type="invoice", target_id=invoice_id, metadata={"amount": amount, "result": event["match_result"]}, request=request)
    return {"event": {k: v for k, v in event.items() if k != "raw"}, "invoice": await invoice_detail(invoice_id, ctx["merchant"]["id"])}
