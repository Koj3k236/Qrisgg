import asyncio
import logging
import os
import uuid
from contextlib import suppress

from core.config import CORS_ORIGINS  # loads .env first
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

from core.db import db, client, ensure_indexes, detect_transactions
from core.security import hash_password, encrypt, new_id, iso
from modules import auth, merchant, invoices, developers, admin, public
from modules.payments import expire_due_invoices, release_allocations
from modules.webhooks import process_due_deliveries

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("qrisgg")

app = FastAPI(title="Qrisgg API", version="0.1.0-sandbox", docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None,
              description="Qrisgg QRIS payment management API. Mode: SANDBOX. Provider fase 1: Bank Mandiri — Livin' Usaha "
                          "(sandbox; adapter resmi nonaktif). Endpoint developer: /api/v1/* dengan header Authorization: Bearer qgg_sk_...")

for r in (public.router, auth.router, merchant.router, invoices.router, developers.router, developers.v1, admin.router):
    app.include_router(r)

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def request_context(request: Request, call_next):
    request.state.request_id = request.headers.get("x-request-id") or f"req_{uuid.uuid4().hex[:16]}"
    origin = request.headers.get("origin")
    req_host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    same_origin = bool(origin) and origin.split("://", 1)[-1].rstrip("/") == req_host.split(",")[0].strip()
    if (request.method in UNSAFE and request.cookies.get("access_token") and origin and not same_origin
            and origin not in CORS_ORIGINS and not request.url.path.startswith("/api/v1/")):
        return JSONResponse({"detail": "Origin tidak diizinkan (CSRF)", "error": {"code": "CSRF_REJECTED"}}, status_code=403)
    response = await call_next(request)
    response.headers["X-Request-Id"] = request.state.request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


def _error(request: Request, status: int, detail, code: str):
    message = detail if isinstance(detail, str) else "Validasi gagal"
    return JSONResponse({"detail": detail, "error": {"code": code, "message": message, "request_id": getattr(request.state, "request_id", None)}},
                        status_code=status, headers={"X-Request-Id": getattr(request.state, "request_id", "")})


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException):
    codes = {400: "BAD_REQUEST", 401: "UNAUTHENTICATED", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONFLICT",
             422: "VALIDATION_ERROR", 429: "RATE_LIMITED", 501: "NOT_IMPLEMENTED"}
    return _error(request, exc.status_code, exc.detail, codes.get(exc.status_code, "ERROR"))


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    detail = [{"loc": e.get("loc"), "msg": e.get("msg")} for e in exc.errors()]
    return _error(request, 422, detail, "VALIDATION_ERROR")


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    logger.exception("Unhandled error %s", getattr(request.state, "request_id", None))
    return _error(request, 500, "Terjadi kesalahan internal", "INTERNAL_ERROR")


app.add_middleware(CORSMiddleware, allow_credentials=True, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"],
                   expose_headers=["X-Request-Id"])


async def seed() -> None:
    email = os.environ["ADMIN_EMAIL"].lower()
    if not await db.users.find_one({"email": email}):
        await db.users.insert_one({"id": new_id("usr"), "name": "Super Admin Qrisgg", "email": email,
                                   "password_hash": hash_password(os.environ["ADMIN_PASSWORD"]), "email_verified": True,
                                   "platform_role": "SUPER_ADMIN", "status": "ACTIVE", "mfa_enabled": True,
                                   "mfa_secret_enc": encrypt(os.environ["ADMIN_TOTP_SECRET"]), "default_merchant_id": None,
                                   "created_at": iso()})
        logger.info("Seeded SUPER_ADMIN %s", email)
    if not await db.pricing_plans.count_documents({}):
        plans = [
            ("Sandbox", "Uji alur invoice dan API Qrisgg tanpa transaksi nyata.", "Akses Sandbox",
             ["Invoice sandbox tanpa batas wajar", "Simulator pembayaran", "API key & webhook sandbox"], False, 0),
            ("Bisnis", "Untuk merchant yang siap mengelola pembayaran QRIS Mandiri miliknya sendiri.", "Segera Hadir",
             ["Dashboard merchant", "Invoice & nominal unik", "Tim dan peran akses"], True, 1),
            ("Enterprise", "Kebutuhan integrasi khusus, volume tinggi, dan dukungan prioritas.", "Hubungi Kami",
             ["Integrasi API khusus", "Dukungan teknis prioritas", "Konsultasi arsitektur"], False, 2),
        ]
        await db.pricing_plans.insert_many([{"id": new_id("pln"), "name": n, "description": d, "price_label": p, "features": f,
                                             "highlighted": h, "active": True, "sort": s, "created_at": iso()} for n, d, p, f, h, s in plans])


async def worker_loop() -> None:
    """In-process scheduler (sandbox). Each job uses claim/conditional updates so it is safe to run in parallel."""
    while True:
        try:
            await expire_due_invoices()
            await release_allocations()
            await process_due_deliveries()
        except Exception:
            logger.exception("worker loop error")
        await asyncio.sleep(10)


@app.on_event("startup")
async def startup():
    await detect_transactions()
    await ensure_indexes()
    await seed()
    app.state.worker = asyncio.create_task(worker_loop())


@app.on_event("shutdown")
async def shutdown():
    app.state.worker.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.worker
    client.close()
