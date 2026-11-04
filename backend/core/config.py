import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
CORS_ORIGINS = [o.strip() for o in os.environ["CORS_ORIGINS"].split(",") if o.strip()]
APP_PUBLIC_URL = os.environ["APP_PUBLIC_URL"].rstrip("/")
JWT_SECRET = os.environ["JWT_SECRET"]
ENCRYPTION_KEY = os.environ["ENCRYPTION_KEY"]
PLATFORM_MODE = os.environ.get("PLATFORM_MODE", "SANDBOX")

ACCESS_TTL_MIN = 15
REFRESH_TTL_DAYS = 7

PLATFORM_ROLES = ("SUPER_ADMIN", "ADMIN")
MERCHANT_ROLES = ("MERCHANT_OWNER", "MERCHANT_ADMIN", "MERCHANT_DEVELOPER", "MERCHANT_VIEWER")

ROLE_PERMISSIONS = {
    "MERCHANT_OWNER": {"invoices:read", "invoices:write", "qris:manage", "developers:manage", "team:manage", "settings:manage"},
    "MERCHANT_ADMIN": {"invoices:read", "invoices:write", "qris:manage", "developers:manage", "team:manage", "settings:manage"},
    "MERCHANT_DEVELOPER": {"invoices:read", "invoices:write", "developers:manage"},
    "MERCHANT_VIEWER": {"invoices:read"},
}

API_KEY_SCOPES = ("invoices:read", "invoices:write", "webhooks:read")

WEBHOOK_EVENTS = (
    "payment.detected", "payment.verified", "payment.failed", "payment.expired",
    "settlement.confirmed", "withdrawal.processing", "withdrawal.completed", "withdrawal.failed",
)

DEFAULT_SETTINGS = {
    "unique_code_min": 1,
    "unique_code_max": 999,
    "reuse_cooldown_minutes": 60,
    "default_expiry_seconds": 900,
    "min_amount": 1000,
    "max_amount": 100_000_000,
    "hold_hours": 6,
}
