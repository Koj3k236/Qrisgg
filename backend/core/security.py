import hashlib
import hmac
import secrets
from datetime import datetime, timezone, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError
from cryptography.fernet import Fernet

from core.config import JWT_SECRET, ENCRYPTION_KEY, ACCESS_TTL_MIN, REFRESH_TTL_DAYS

_ph = PasswordHasher()  # argon2id by default
_fernet = Fernet(ENCRYPTION_KEY.encode())
ALG = "HS256"


def now():
    return datetime.now(timezone.utc)


def iso(dt=None):
    return (dt or now()).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(10)}"


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return _ph.verify(hashed, password)
    except (VerifyMismatchError, InvalidHashError):
        return False


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def encrypt(value: str) -> str:
    return _fernet.encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    return _fernet.decrypt(value.encode()).decode()


def create_token(sub: str, ttype: str, ttl: timedelta, **extra) -> str:
    payload = {"sub": sub, "type": ttype, "exp": now() + ttl, "iat": now(), **extra}
    return jwt.encode(payload, JWT_SECRET, algorithm=ALG)


def access_token(user_id: str, sid: str) -> str:
    return create_token(user_id, "access", timedelta(minutes=ACCESS_TTL_MIN), sid=sid)


def refresh_token(user_id: str, sid: str) -> str:
    return create_token(user_id, "refresh", timedelta(days=REFRESH_TTL_DAYS), sid=sid)


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=[ALG])


def generate_api_key(mode: str) -> str:
    return f"qgg_sk_{mode.lower()}_{secrets.token_urlsafe(32)}"


def sign_webhook(secret: str, timestamp: int, body: str) -> str:
    return hmac.new(secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256).hexdigest()
