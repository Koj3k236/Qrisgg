import ipaddress
import logging
import os
import re
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse

import httpx

from core.db import db
from core.security import iso, new_id

logger = logging.getLogger("qrisgg.email")

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ["EMERGENT_EMAIL_KEY"]
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")

_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str, template: str) -> dict:
    """Sends via Emergent managed Resend. Never raises; returns delivery status and logs it."""
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if EMAIL_REPLY_TO:
        payload["contact_email"] = EMAIL_REPLY_TO
    result = {"status": "SENT", "provider_id": None, "error": None}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send", headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        resp.raise_for_status()
        result["provider_id"] = resp.json().get("id")
    except httpx.HTTPStatusError as e:
        try:
            code = e.response.json().get("code", "")
        except ValueError:
            code = ""
        result = {"status": "PAUSED" if code in ("insufficient_credits", "integration_disabled", "daily_limit_reached") else "FAILED",
                  "provider_id": None, "error": f"{e.response.status_code} {code}".strip()}
        logger.warning("Email send failed (%s): %s", template, result["error"])
    except Exception as e:
        result = {"status": "FAILED", "provider_id": None, "error": str(e)[:200]}
        logger.error("Email send error (%s): %s", template, e)
    await db.email_logs.insert_one({"id": new_id("eml"), "to": to, "template": template, **result, "created_at": iso()})
    return result


def _layout(title: str, body_html: str) -> str:
    brand = escape(EMAIL_FROM_NAME)
    return (f'<table role="presentation" width="100%" style="background:#F5F7FB;padding:32px 0"><tr><td align="center">'
            f'<table role="presentation" width="520" style="background:#ffffff;border-radius:12px;padding:32px;font-family:Arial,sans-serif;color:#0B1736">'
            f'<tr><td><p style="font-size:20px;font-weight:bold;color:#2563EB;margin:0 0 16px">{brand}</p>'
            f'<p style="font-size:18px;font-weight:bold;margin:0 0 12px">{escape(title)}</p>{body_html}'
            f'<p style="font-size:12px;color:#64748B;margin-top:24px">Dikirim oleh {brand}. Kami tidak pernah meminta password, PIN, atau OTP Anda melalui email.</p>'
            f'</td></tr></table></td></tr></table>')


def _button(url: str, label: str) -> str:
    return (f'<p style="margin:24px 0"><a href="{escape(url)}" style="background:#2563EB;color:#ffffff;padding:12px 20px;'
            f'border-radius:8px;text-decoration:none;font-weight:bold">{escape(label)}</a></p>')


def verification_email(name: str, url: str) -> tuple[str, str]:
    body = (f'<p style="font-size:14px;line-height:1.6">Halo {escape(name)}, terima kasih telah mendaftar. '
            f'Konfirmasi alamat email Anda untuk mengaktifkan akun.</p>{_button(url, "Verifikasi Email")}'
            f'<p style="font-size:12px;color:#64748B">Tautan berlaku 24 jam.</p>')
    return f"Verifikasi email akun {EMAIL_FROM_NAME}", _layout("Verifikasi email Anda", body)


def reset_email(name: str, url: str) -> tuple[str, str]:
    body = (f'<p style="font-size:14px;line-height:1.6">Halo {escape(name)}, kami menerima permintaan untuk mengatur ulang '
            f'kata sandi akun Anda.</p>{_button(url, "Atur Ulang Kata Sandi")}'
            f'<p style="font-size:12px;color:#64748B">Tautan berlaku 1 jam. Abaikan email ini jika Anda tidak memintanya.</p>')
    return f"Atur ulang kata sandi {EMAIL_FROM_NAME}", _layout("Atur ulang kata sandi", body)
