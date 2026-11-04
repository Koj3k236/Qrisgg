from fastapi import Depends, HTTPException, Request

from core.config import ROLE_PERMISSIONS, PLATFORM_ROLES
from core.db import db
from core.security import decode_token, iso
import jwt


def _extract_token(request: Request) -> str | None:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer ") and not auth[7:].startswith("qgg_sk_"):
            token = auth[7:]
    return token


async def get_current_session(request: Request) -> dict:
    token = _extract_token(request)
    if not token:
        raise HTTPException(401, "Belum masuk")
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Sesi kedaluwarsa")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token tidak valid")
    if payload.get("type") != "access":
        raise HTTPException(401, "Jenis token tidak valid")
    session = await db.sessions.find_one({"id": payload.get("sid"), "revoked_at": None}, {"_id": 0})
    if not session:
        raise HTTPException(401, "Sesi telah dicabut")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0, "mfa_secret_enc": 0, "mfa_pending_enc": 0})
    if not user:
        raise HTTPException(401, "Pengguna tidak ditemukan")
    if user.get("status") == "DISABLED":
        raise HTTPException(403, "Akun dinonaktifkan")
    return {"user": user, "session": session}


async def get_current_user(ctx: dict = Depends(get_current_session)) -> dict:
    return ctx["user"]


def require_admin(*roles: str):
    allowed = roles or PLATFORM_ROLES

    async def dep(ctx: dict = Depends(get_current_session)) -> dict:
        user = ctx["user"]
        if user.get("platform_role") not in allowed:
            raise HTTPException(403, "Akses admin diperlukan")
        if not ctx["session"].get("mfa_verified"):
            raise HTTPException(403, "MFA_REQUIRED")
        return user
    return dep


async def get_merchant_ctx(request: Request, user: dict = Depends(get_current_user)) -> dict:
    merchant_id = request.headers.get("X-Merchant-Id") or user.get("default_merchant_id")
    if not merchant_id:
        raise HTTPException(403, "Tidak tergabung dengan merchant mana pun")
    member = await db.merchant_members.find_one({"merchant_id": merchant_id, "user_id": user["id"]}, {"_id": 0})
    if not member:
        raise HTTPException(403, "Bukan anggota merchant ini")
    merchant = await db.merchants.find_one({"id": merchant_id}, {"_id": 0})
    if not merchant:
        raise HTTPException(404, "Merchant tidak ditemukan")
    return {"user": user, "merchant": merchant, "role": member["role"], "member": member}


def require_perm(perm: str):
    async def dep(ctx: dict = Depends(get_merchant_ctx)) -> dict:
        if perm not in ROLE_PERMISSIONS.get(ctx["role"], set()):
            raise HTTPException(403, f"Peran {ctx['role']} tidak memiliki izin {perm}")
        if perm.endswith(":write") and ctx["merchant"]["status"] == "SUSPENDED":
            raise HTTPException(403, "Merchant ditangguhkan")
        return ctx
    return dep


async def get_api_key_ctx(request: Request) -> dict:
    from core.security import sha256
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer qgg_sk_"):
        raise HTTPException(401, "API key tidak ada atau tidak valid")
    key = await db.api_keys.find_one({"key_hash": sha256(auth[7:]), "revoked_at": None}, {"_id": 0})
    if not key:
        raise HTTPException(401, "API key tidak valid atau telah dicabut")
    merchant = await db.merchants.find_one({"id": key["merchant_id"]}, {"_id": 0})
    if not merchant or merchant["status"] == "SUSPENDED":
        raise HTTPException(403, "Merchant tidak aktif")
    await db.api_keys.update_one({"id": key["id"]}, {"$set": {"last_used_at": iso()}})
    return {"api_key": key, "merchant": merchant}


def require_scope(scope: str):
    async def dep(ctx: dict = Depends(get_api_key_ctx)) -> dict:
        if scope not in ctx["api_key"]["scopes"]:
            raise HTTPException(403, f"API key tidak memiliki scope {scope}")
        return ctx
    return dep
