import logging
from contextlib import asynccontextmanager
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

from core.config import MONGO_URL, DB_NAME

logger = logging.getLogger("qrisgg.db")
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]
state = {"transactions": False}


async def detect_transactions() -> None:
    info = await client.admin.command("hello")
    state["transactions"] = bool(info.get("setName")) or info.get("msg") == "isdbgrid"
    logger.info("MongoDB multi-document transactions supported: %s", state["transactions"])


@asynccontextmanager
async def atomic():
    """Yields a session inside a transaction when the deployment supports it, else None."""
    if not state["transactions"]:
        yield None
        return
    async with await client.start_session() as session:
        async with session.start_transaction():
            yield session


def clean(doc):
    if doc is None:
        return None
    doc.pop("_id", None)
    return doc


def I(keys, **kw):
    return IndexModel(keys, **kw)


INDEXES = {
    "users": [I([("id", ASCENDING)], unique=True, name="id"), I([("email", ASCENDING)], unique=True, name="email")],
    "sessions": [I([("id", ASCENDING)], unique=True, name="id"), I([("user_id", ASCENDING)], name="user"),
                 I([("expires_at", ASCENDING)], expireAfterSeconds=0, name="ttl")],
    "auth_tokens": [I([("token_hash", ASCENDING)], unique=True, name="token"),
                    I([("expires_at", ASCENDING)], expireAfterSeconds=0, name="ttl")],
    "login_attempts": [I([("identifier", ASCENDING)], unique=True, name="identifier")],
    "merchants": [I([("id", ASCENDING)], unique=True, name="id"), I([("status", ASCENDING)], name="status")],
    "merchant_members": [I([("merchant_id", ASCENDING), ("user_id", ASCENDING)], unique=True, name="member"),
                         I([("user_id", ASCENDING)], name="user")],
    "qris_accounts": [I([("id", ASCENDING)], unique=True, name="id"), I([("merchant_id", ASCENDING)], name="merchant")],
    "invoices": [
        I([("id", ASCENDING)], unique=True, name="id"),
        I([("merchant_id", ASCENDING), ("created_at", DESCENDING)], name="merchant_created"),
        I([("merchant_id", ASCENDING), ("external_id", ASCENDING)], unique=True, name="merchant_external",
          partialFilterExpression={"external_id": {"$type": "string"}}),
        I([("status", ASCENDING), ("expires_at", ASCENDING)], name="status_expiry"),
    ],
    "invoice_unique_allocations": [
        I([("account_key", ASCENDING), ("payable_amount", ASCENDING)], unique=True, name="active_payable",
          partialFilterExpression={"active": True}),
        I([("invoice_id", ASCENDING)], name="invoice"),
        I([("active", ASCENDING), ("reuse_after", ASCENDING)], name="release"),
    ],
    "invoice_transitions": [I([("invoice_id", ASCENDING), ("created_at", ASCENDING)], name="invoice")],
    "payment_events": [I([("id", ASCENDING)], unique=True, name="id"), I([("dedupe_key", ASCENDING)], unique=True, name="dedupe"),
                       I([("merchant_id", ASCENDING), ("created_at", DESCENDING)], name="merchant")],
    "reconciliation_records": [I([("invoice_id", ASCENDING)], name="invoice")],
    "idempotency_keys": [I([("merchant_id", ASCENDING), ("key", ASCENDING)], unique=True, name="key"),
                         I([("created_at", ASCENDING)], expireAfterSeconds=86400, name="ttl")],
    "api_keys": [I([("id", ASCENDING)], unique=True, name="id"), I([("key_hash", ASCENDING)], unique=True, name="hash"),
                 I([("merchant_id", ASCENDING)], name="merchant")],
    "webhook_endpoints": [I([("id", ASCENDING)], unique=True, name="id"), I([("merchant_id", ASCENDING)], name="merchant")],
    "webhook_deliveries": [I([("id", ASCENDING)], unique=True, name="id"),
                           I([("status", ASCENDING), ("next_attempt_at", ASCENDING)], name="queue"),
                           I([("merchant_id", ASCENDING), ("created_at", DESCENDING)], name="merchant")],
    "pricing_plans": [I([("id", ASCENDING)], unique=True, name="id")],
    "audit_logs": [I([("created_at", DESCENDING)], name="created"), I([("merchant_id", ASCENDING), ("created_at", DESCENDING)], name="merchant")],
    "support_tickets": [I([("id", ASCENDING)], unique=True, name="id"), I([("merchant_id", ASCENDING)], name="merchant")],
    "system_settings": [I([("key", ASCENDING)], unique=True, name="key")],
    "email_logs": [I([("created_at", DESCENDING)], name="created")],
    "ledger_journals": [I([("idempotency_key", ASCENDING)], unique=True, name="idem"), I([("lines.account", ASCENDING)], name="account"),
                        I([("merchant_id", ASCENDING), ("created_at", DESCENDING)], name="merchant")],
    "settlements": [I([("id", ASCENDING)], unique=True, name="id"), I([("invoice_id", ASCENDING)], unique=True, name="invoice"),
                    I([("status", ASCENDING), ("hold_release_at", ASCENDING)], name="release")],
    "bank_accounts": [I([("id", ASCENDING)], unique=True, name="id"), I([("merchant_id", ASCENDING)], name="merchant")],
    "withdrawal_requests": [I([("id", ASCENDING)], unique=True, name="id"),
                            I([("merchant_id", ASCENDING), ("idempotency_key", ASCENDING)], unique=True, name="idem"),
                            I([("status", ASCENDING)], name="status")],
    "payout_attempts": [I([("withdrawal_id", ASCENDING)], name="withdrawal")],
    "ledger_locks": [I([("merchant_id", ASCENDING)], unique=True, name="merchant")],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
