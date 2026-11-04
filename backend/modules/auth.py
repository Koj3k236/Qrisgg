import asyncio
import re
import secrets
from datetime import timedelta

import jwt
import pyotp
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field, field_validator

from core.audit import audit, client_ip
from core.config import APP_PUBLIC_URL, REFRESH_TTL_DAYS, ACCESS_TTL_MIN, PLATFORM_ROLES
from core.db import db
from core.deps import get_current_session, get_current_user
from core.email import send_email, verification_email, reset_email, login_alert_email
from core.security import (new_id, iso, now, hash_password, verify_password, sha256, encrypt, decrypt,
                           access_token, refresh_token, decode_token, create_token)

router = APIRouter(prefix="/api/auth", tags=["auth"])
MAX_FAILS, MAX_ACCOUNT_FAILS, LOCK_MIN = 5, 10, 15


def _strong(pw: str) -> str:
    if len(pw) < 10 or not re.search(r"[A-Za-z]", pw) or not re.search(r"\d", pw):
        raise ValueError("Kata sandi minimal 10 karakter dan mengandung huruf serta angka")
    return pw


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str
    business_name: str = Field(min_length=2, max_length=120)

    @field_validator("password")
    @classmethod
    def check_pw(cls, v):
        return _strong(v)


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class MfaVerifyIn(BaseModel):
    mfa_token: str
    code: str = Field(min_length=6, max_length=6)


class CodeIn(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class TokenIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class EmailIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str

    @field_validator("password")
    @classmethod
    def check_pw(cls, v):
        return _strong(v)


class ChangePwIn(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def check_pw(cls, v):
        return _strong(v)


def _set_cookies(response: Response, user_id: str, sid: str) -> None:
    opts = dict(httponly=True, secure=True, samesite="none", path="/")
    response.set_cookie("access_token", access_token(user_id, sid), max_age=ACCESS_TTL_MIN * 60, **opts)
    response.set_cookie("refresh_token", refresh_token(user_id, sid), max_age=REFRESH_TTL_DAYS * 86400, **opts)


async def _create_session(request: Request, user_id: str, mfa_verified: bool) -> str:
    sid = new_id("ses")
    await db.sessions.insert_one({"id": sid, "user_id": user_id, "ip": client_ip(request),
                                  "user_agent": request.headers.get("user-agent", "")[:200], "mfa_verified": mfa_verified,
                                  "created_at": iso(), "last_seen_at": iso(), "revoked_at": None,
                                  "expires_at": now() + timedelta(days=REFRESH_TTL_DAYS)})
    return sid


async def _issue_token(user: dict, purpose: str, ttl: timedelta) -> str:
    raw = secrets.token_urlsafe(32)
    await db.auth_tokens.insert_one({"token_hash": sha256(raw), "user_id": user["id"], "purpose": purpose,
                                     "used_at": None, "expires_at": now() + ttl, "created_at": iso()})
    return raw


async def _consume_token(raw: str, purpose: str) -> dict:
    tok = await db.auth_tokens.find_one_and_update(
        {"token_hash": sha256(raw), "purpose": purpose, "used_at": None, "expires_at": {"$gt": now()}},
        {"$set": {"used_at": iso()}})
    if not tok:
        raise HTTPException(400, "Tautan tidak valid atau sudah kedaluwarsa")
    return tok


async def _send_verification(user: dict) -> dict:
    raw = await _issue_token(user, "verify_email", timedelta(hours=24))
    subject, html = verification_email(user["name"], f"{APP_PUBLIC_URL}/verify-email?token={raw}")
    return await send_email(to=user["email"], subject=subject, html=html, template="verify_email")


async def build_me(user: dict, session: dict) -> dict:
    members = await db.merchant_members.find({"user_id": user["id"]}, {"_id": 0}).to_list(50)
    ids = [m["merchant_id"] for m in members]
    merchants = {m["id"]: m for m in await db.merchants.find({"id": {"$in": ids}}, {"_id": 0}).to_list(50)}
    return {
        "id": user["id"], "name": user["name"], "email": user["email"], "email_verified": user.get("email_verified", False),
        "platform_role": user.get("platform_role"), "mfa_enabled": user.get("mfa_enabled", False),
        "mfa_verified": session.get("mfa_verified", False), "default_merchant_id": user.get("default_merchant_id"),
        "memberships": [{"merchant_id": m["merchant_id"], "role": m["role"],
                         "merchant_name": merchants.get(m["merchant_id"], {}).get("name"),
                         "merchant_status": merchants.get(m["merchant_id"], {}).get("status")} for m in members],
        "session_id": session["id"],
    }


@router.post("/register")
async def register(body: RegisterIn, request: Request, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "Email sudah terdaftar")
    user_id, merchant_id = new_id("usr"), new_id("mch")
    ts = iso()
    user = {"id": user_id, "name": body.name.strip(), "email": email, "password_hash": hash_password(body.password),
            "email_verified": False, "platform_role": None, "status": "ACTIVE", "mfa_enabled": False,
            "default_merchant_id": merchant_id, "created_at": ts}
    await db.users.insert_one(dict(user))
    await db.merchants.insert_one({"id": merchant_id, "name": body.business_name.strip(), "status": "PENDING_REVIEW",
                                   "mode": "SANDBOX", "business_type": None, "phone": None, "website": None, "address": None,
                                   "owner_user_id": user_id, "created_at": ts, "updated_at": ts})
    await db.merchant_members.insert_one({"id": new_id("mem"), "merchant_id": merchant_id, "user_id": user_id,
                                          "role": "MERCHANT_OWNER", "created_at": ts})
    sid = await _create_session(request, user_id, mfa_verified=False)
    _set_cookies(response, user_id, sid)
    mail = await _send_verification(user)
    await audit("auth.register", actor_id=user_id, merchant_id=merchant_id, target_type="user", target_id=user_id,
                metadata={"verification_email": mail["status"]}, request=request)
    session = await db.sessions.find_one({"id": sid}, {"_id": 0})
    return {**await build_me(user, session), "verification_email_status": mail["status"]}


@router.post("/login")
async def login(body: LoginIn, request: Request, response: Response):
    email = body.email.lower()
    idents = {f"{client_ip(request)}:{email}": MAX_FAILS, f"acct:{email}": MAX_ACCOUNT_FAILS}
    atts = {a["identifier"]: a async for a in db.login_attempts.find({"identifier": {"$in": list(idents)}})}
    if any(a.get("locked_until") and a["locked_until"] > iso() for a in atts.values()):
        raise HTTPException(429, "Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit.")
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        for ident, limit in idents.items():
            fails = atts.get(ident, {}).get("count", 0) + 1
            upd = {"count": fails, "locked_until": None, "updated_at": iso()}
            if fails >= limit:
                upd = {"count": 0, "locked_until": iso(now() + timedelta(minutes=LOCK_MIN)), "updated_at": iso()}
            await db.login_attempts.update_one({"identifier": ident}, {"$set": upd}, upsert=True)
        await audit("auth.login_failed", actor_id=user["id"] if user else None, metadata={"email": email}, request=request)
        raise HTTPException(401, "Email atau kata sandi salah")
    if user.get("status") == "DISABLED":
        raise HTTPException(403, "Akun dinonaktifkan")
    await db.login_attempts.delete_many({"identifier": {"$in": list(idents)}})
    if user.get("mfa_enabled"):
        return {"mfa_required": True, "mfa_token": create_token(user["id"], "mfa", timedelta(minutes=5))}
    sid = await _create_session(request, user["id"], mfa_verified=False)
    _set_cookies(response, user["id"], sid)
    await audit("auth.login", actor_id=user["id"], request=request)
    session = await db.sessions.find_one({"id": sid}, {"_id": 0})
    return await build_me(user, session)


@router.post("/2fa/verify")
async def mfa_verify(body: MfaVerifyIn, request: Request, response: Response):
    try:
        payload = decode_token(body.mfa_token)
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Sesi verifikasi 2FA kedaluwarsa, silakan masuk ulang")
    if payload.get("type") != "mfa":
        raise HTTPException(401, "Token tidak valid")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user or not user.get("mfa_enabled"):
        raise HTTPException(401, "2FA tidak aktif")
    if not pyotp.TOTP(decrypt(user["mfa_secret_enc"])).verify(body.code, valid_window=1):
        await audit("auth.mfa_failed", actor_id=user["id"], request=request)
        raise HTTPException(401, "Kode 2FA salah")
    sid = await _create_session(request, user["id"], mfa_verified=True)
    _set_cookies(response, user["id"], sid)
    await audit("auth.login_mfa", actor_id=user["id"], request=request)
    if user.get("platform_role"):
        subject, html = login_alert_email(user["name"], client_ip(request), iso()[:19])
        asyncio.create_task(send_email(to=user["email"], subject=subject, html=html, template="admin_login_alert"))
    session = await db.sessions.find_one({"id": sid}, {"_id": 0})
    return await build_me(user, session)


class RotateIn(BaseModel):
    code: str | None = Field(None, min_length=6, max_length=6)


@router.post("/2fa/setup")
async def mfa_setup(body: RotateIn | None = None, user: dict = Depends(get_current_user)):
    if user.get("mfa_enabled"):
        full = await db.users.find_one({"id": user["id"]})
        if not body or not body.code or not pyotp.TOTP(decrypt(full["mfa_secret_enc"])).verify(body.code, valid_window=1):
            raise HTTPException(400, "Untuk mengganti authenticator, masukkan kode 2FA saat ini yang valid")
    secret = pyotp.random_base32()
    await db.users.update_one({"id": user["id"]}, {"$set": {"mfa_pending_enc": encrypt(secret)}})
    return {"secret": secret, "otpauth_uri": pyotp.TOTP(secret).provisioning_uri(user["email"], issuer_name="Qrisgg")}


@router.post("/2fa/enable")
async def mfa_enable(body: CodeIn, request: Request, ctx: dict = Depends(get_current_session)):
    full = await db.users.find_one({"id": ctx["user"]["id"]}, {"_id": 0})
    if not full.get("mfa_pending_enc"):
        raise HTTPException(400, "Mulai pengaturan 2FA terlebih dahulu")
    secret = decrypt(full["mfa_pending_enc"])
    if not pyotp.TOTP(secret).verify(body.code, valid_window=1):
        raise HTTPException(400, "Kode 2FA salah")
    await db.users.update_one({"id": full["id"]}, {"$set": {"mfa_enabled": True, "mfa_secret_enc": encrypt(secret)},
                                                    "$unset": {"mfa_pending_enc": ""}})
    await db.sessions.update_one({"id": ctx["session"]["id"]}, {"$set": {"mfa_verified": True}})
    await audit("auth.mfa_enabled", actor_id=full["id"], request=request)
    return {"mfa_enabled": True}


@router.post("/2fa/disable")
async def mfa_disable(body: CodeIn, request: Request, user: dict = Depends(get_current_user)):
    if user.get("platform_role") in PLATFORM_ROLES:
        raise HTTPException(403, "2FA wajib untuk administrator dan tidak dapat dinonaktifkan")
    full = await db.users.find_one({"id": user["id"]})
    if not full.get("mfa_enabled") or not pyotp.TOTP(decrypt(full["mfa_secret_enc"])).verify(body.code, valid_window=1):
        raise HTTPException(400, "Kode 2FA salah")
    await db.users.update_one({"id": user["id"]}, {"$set": {"mfa_enabled": False}, "$unset": {"mfa_secret_enc": ""}})
    await audit("auth.mfa_disabled", actor_id=user["id"], request=request)
    return {"mfa_enabled": False}


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(401, "Tidak ada refresh token")
    try:
        payload = decode_token(token)
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Refresh token tidak valid")
    if payload.get("type") != "refresh":
        raise HTTPException(401, "Jenis token tidak valid")
    session = await db.sessions.find_one({"id": payload.get("sid"), "revoked_at": None})
    if not session:
        raise HTTPException(401, "Sesi telah dicabut")
    await db.sessions.update_one({"id": session["id"]}, {"$set": {"last_seen_at": iso()}})
    _set_cookies(response, payload["sub"], session["id"])
    return {"ok": True}


@router.post("/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("refresh_token") or request.cookies.get("access_token")
    if token:
        try:
            sid = decode_token(token).get("sid")
            await db.sessions.update_one({"id": sid}, {"$set": {"revoked_at": iso()}})
        except jwt.InvalidTokenError:
            pass
    for name in ("access_token", "refresh_token"):
        response.delete_cookie(name, path="/", secure=True, samesite="none")
    return {"ok": True}


@router.get("/me")
async def me(ctx: dict = Depends(get_current_session)):
    return await build_me(ctx["user"], ctx["session"])


@router.post("/verify-email")
async def verify_email(body: TokenIn, request: Request):
    tok = await _consume_token(body.token, "verify_email")
    await db.users.update_one({"id": tok["user_id"]}, {"$set": {"email_verified": True, "email_verified_at": iso()}})
    await audit("auth.email_verified", actor_id=tok["user_id"], request=request)
    return {"email_verified": True}


@router.post("/resend-verification")
async def resend_verification(request: Request, user: dict = Depends(get_current_user)):
    if user.get("email_verified"):
        return {"status": "ALREADY_VERIFIED"}
    recent = await db.auth_tokens.count_documents({"user_id": user["id"], "purpose": "verify_email",
                                                   "created_at": {"$gt": iso(now() - timedelta(minutes=2))}})
    if recent:
        raise HTTPException(429, "Tunggu 2 menit sebelum meminta email verifikasi lagi")
    mail = await _send_verification(user)
    return {"status": mail["status"]}


@router.post("/forgot-password")
async def forgot_password(body: EmailIn, request: Request):
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if user:
        raw = await _issue_token(user, "reset_password", timedelta(hours=1))
        subject, html = reset_email(user["name"], f"{APP_PUBLIC_URL}/reset-password?token={raw}")
        await send_email(to=user["email"], subject=subject, html=html, template="reset_password")
        await audit("auth.password_reset_requested", actor_id=user["id"], request=request)
    return {"message": "Jika email terdaftar, tautan atur ulang kata sandi telah dikirim."}


@router.post("/reset-password")
async def reset_password(body: ResetIn, request: Request):
    tok = await _consume_token(body.token, "reset_password")
    await db.users.update_one({"id": tok["user_id"]}, {"$set": {"password_hash": hash_password(body.password)}})
    await db.sessions.update_many({"user_id": tok["user_id"], "revoked_at": None}, {"$set": {"revoked_at": iso()}})
    await audit("auth.password_reset", actor_id=tok["user_id"], request=request)
    return {"message": "Kata sandi berhasil diperbarui. Silakan masuk kembali."}


@router.post("/change-password")
async def change_password(body: ChangePwIn, request: Request, ctx: dict = Depends(get_current_session)):
    full = await db.users.find_one({"id": ctx["user"]["id"]})
    if not verify_password(body.current_password, full["password_hash"]):
        raise HTTPException(400, "Kata sandi saat ini salah")
    await db.users.update_one({"id": full["id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await db.sessions.update_many({"user_id": full["id"], "revoked_at": None, "id": {"$ne": ctx["session"]["id"]}},
                                  {"$set": {"revoked_at": iso()}})
    await audit("auth.password_changed", actor_id=full["id"], request=request)
    return {"ok": True}


@router.get("/sessions")
async def list_sessions(ctx: dict = Depends(get_current_session)):
    rows = await db.sessions.find({"user_id": ctx["user"]["id"], "revoked_at": None},
                                  {"_id": 0, "expires_at": 0}).sort("created_at", -1).to_list(50)
    return [{**r, "current": r["id"] == ctx["session"]["id"]} for r in rows]


@router.delete("/sessions/{sid}")
async def revoke_session(sid: str, request: Request, ctx: dict = Depends(get_current_session)):
    res = await db.sessions.update_one({"id": sid, "user_id": ctx["user"]["id"], "revoked_at": None}, {"$set": {"revoked_at": iso()}})
    if not res.modified_count:
        raise HTTPException(404, "Sesi tidak ditemukan")
    await audit("auth.session_revoked", actor_id=ctx["user"]["id"], target_type="session", target_id=sid, request=request)
    return {"ok": True}
