from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from core.audit import client_ip
from core.db import db, state
from core.security import new_id, iso, now

router = APIRouter(prefix="/api", tags=["public"])


class ContactIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    company: str | None = Field(None, max_length=120)
    message: str = Field(min_length=10, max_length=3000)


@router.get("/health")
async def health():
    await db.command("ping")
    return {"status": "ok", "database": "ok", "transactions_supported": state["transactions"], "mode": "SANDBOX", "time": iso()}


@router.get("/public/plans")
async def plans():
    return await db.pricing_plans.find({"active": True}, {"_id": 0}).sort("sort", 1).to_list(20)


@router.get("/public/pay/{invoice_id}")
async def pay_page(invoice_id: str):
    inv = await db.invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        raise HTTPException(404, "Invoice tidak ditemukan")
    merchant = await db.merchants.find_one({"id": inv["merchant_id"]}, {"_id": 0, "name": 1})
    return {"id": inv["id"], "merchant_name": merchant["name"] if merchant else None, "amount": inv["amount"],
            "unique_code": inv["unique_code"], "payable_amount": inv["payable_amount"], "currency": inv["currency"],
            "status": inv["status"], "mode": inv["mode"], "expires_at": inv["expires_at"], "description": inv.get("description"),
            "qr_string": inv.get("qr_string"), "qr_type": inv.get("qr_type", "DEMO"), "server_time": iso(now())}


@router.post("/public/contact")
async def contact(body: ContactIn, request: Request):
    ip = client_ip(request)
    recent = await db.support_tickets.count_documents({"source": "CONTACT_FORM", "ip": ip, "created_at": {"$gt": iso(now().replace(minute=0, second=0))}})
    if recent >= 5:
        raise HTTPException(429, "Terlalu banyak pesan. Coba lagi nanti.")
    await db.support_tickets.insert_one({"id": new_id("tkt"), "merchant_id": None, "user_id": None, "subject": f"Kontak: {body.name}",
                                         "message": body.message, "contact_email": body.email, "company": body.company,
                                         "category": "SALES", "status": "OPEN", "source": "CONTACT_FORM", "ip": ip, "created_at": iso()})
    return {"message": "Terima kasih, pesan Anda telah kami terima."}
