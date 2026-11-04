"""Webhook delivery: HMAC-SHA256 signing, retries with exponential backoff, dead-letter."""
import ipaddress
import json
import logging
import socket
from datetime import timedelta
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

from core.db import db
from core.security import new_id, iso, now, decrypt, sign_webhook

logger = logging.getLogger("qrisgg.webhooks")
MAX_ATTEMPTS = 6
BASE_BACKOFF_SECONDS = 30


def assert_public_https_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise HTTPException(422, "URL webhook harus https")
    try:
        infos = socket.getaddrinfo(parsed.hostname, parsed.port or 443)
    except socket.gaierror:
        raise HTTPException(422, "Hostname webhook tidak dapat di-resolve")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise HTTPException(422, "URL webhook tidak boleh mengarah ke jaringan privat")


async def emit_event(merchant_id: str, event_type: str, data: dict) -> int:
    event_id = new_id("whe")
    created = iso()
    count = 0
    async for ep in db.webhook_endpoints.find({"merchant_id": merchant_id, "enabled": True, "events": event_type}, {"_id": 0}):
        payload = {"id": event_id, "type": event_type, "created_at": created, "mode": "SANDBOX", "data": data}
        await db.webhook_deliveries.insert_one({
            "id": new_id("whd"), "event_id": event_id, "event_type": event_type, "endpoint_id": ep["id"],
            "merchant_id": merchant_id, "url": ep["url"], "payload": payload, "status": "PENDING", "attempts": 0,
            "next_attempt_at": created, "last_status_code": None, "last_error": None, "created_at": created})
        count += 1
    return count


async def _attempt(delivery: dict) -> None:
    ep = await db.webhook_endpoints.find_one({"id": delivery["endpoint_id"]}, {"_id": 0})
    attempts = delivery["attempts"] + 1
    update = {"attempts": attempts, "last_attempt_at": iso()}
    if not ep or not ep.get("enabled"):
        update.update(status="CANCELLED", last_error="Endpoint dinonaktifkan")
        await db.webhook_deliveries.update_one({"id": delivery["id"]}, {"$set": update})
        return
    body = json.dumps(delivery["payload"], separators=(",", ":"))
    ts = int(now().timestamp())
    sig = sign_webhook(decrypt(ep["secret_enc"]), ts, body)
    headers = {"Content-Type": "application/json", "X-Qrisgg-Event-Id": delivery["event_id"],
               "X-Qrisgg-Event-Type": delivery["event_type"], "X-Qrisgg-Signature": f"t={ts},v1={sig}",
               "User-Agent": "Qrisgg-Webhooks/1.0"}
    try:
        assert_public_https_url(ep["url"])
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            resp = await client.post(ep["url"], content=body, headers=headers)
        update["last_status_code"] = resp.status_code
        ok = 200 <= resp.status_code < 300
        update["last_error"] = None if ok else f"HTTP {resp.status_code}"
    except HTTPException as e:
        ok, update["last_error"] = False, str(e.detail)
    except Exception as e:
        ok, update["last_error"] = False, str(e)[:200]
    if ok:
        update.update(status="DELIVERED", delivered_at=iso())
    elif attempts >= MAX_ATTEMPTS:
        update.update(status="DEAD_LETTER")
    else:
        update.update(status="PENDING", next_attempt_at=iso(now() + timedelta(seconds=BASE_BACKOFF_SECONDS * 2 ** (attempts - 1))))
    await db.webhook_deliveries.update_one({"id": delivery["id"]}, {"$set": update})


async def process_due_deliveries(limit: int = 20) -> int:
    processed = 0
    for _ in range(limit):
        delivery = await db.webhook_deliveries.find_one_and_update(
            {"status": "PENDING", "next_attempt_at": {"$lte": iso()}},
            {"$set": {"status": "DELIVERING"}}, projection={"_id": 0}, sort=[("next_attempt_at", 1)])
        if not delivery:
            break
        await _attempt(delivery)
        processed += 1
    return processed
