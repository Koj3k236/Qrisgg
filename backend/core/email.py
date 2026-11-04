import asyncio
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
EMAIL_PROVIDER = os.environ.get("EMAIL_PROVIDER", "emergent")  # emergent | resend | smtp
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
EMAIL_FROM_ADDRESS = os.environ.get("EMAIL_FROM_ADDRESS")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
RETRYABLE = {429, 500, 502, 503, 504}

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


async def _send_once(to: str, subject: str, html: str) -> str | None:
    async with httpx.AsyncClient(timeout=30) as client:
        if EMAIL_PROVIDER == "resend":
            payload = {"from": f"{EMAIL_FROM_NAME} <{EMAIL_FROM_ADDRESS}>", "to": [to], "subject": subject, "html": html}
            if EMAIL_REPLY_TO:
                payload["reply_to"] = EMAIL_REPLY_TO
            resp = await client.post("https://api.resend.com/emails", json=payload,
                                     headers={"Authorization": f"Bearer {os.environ['RESEND_API_KEY']}"})
        else:
            payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
            if EMAIL_REPLY_TO:
                payload["contact_email"] = EMAIL_REPLY_TO
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send", headers={"X-Email-Key": EMAIL_KEY}, json=payload)
    resp.raise_for_status()
    return resp.json().get("id")


def _smtp_send(to: str, subject: str, html: str) -> None:
    import smtplib
    from email.message import EmailMessage
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = f"{EMAIL_FROM_NAME} <{EMAIL_FROM_ADDRESS}>", to, subject
    if EMAIL_REPLY_TO:
        msg["Reply-To"] = EMAIL_REPLY_TO
    msg.set_content("Buka email ini dengan klien yang mendukung HTML.")
    msg.add_alternative(html, subtype="html")
    with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "587")), timeout=30) as s:
        s.starttls()
        s.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
        s.send_message(msg)


async def send_email(*, to: str, subject: str, html: str, template: str) -> dict:
    """Provider adapter (emergent/resend/smtp) with up to 3 attempts on transient errors. Never raises; logs status.
    SENT means the provider accepted the message, not that it was received."""
    _assert_safe_email(subject, html)
    result = {"status": "SENT", "provider": EMAIL_PROVIDER, "provider_id": None, "error": None, "attempts": 0}
    for attempt in range(1, 4):
        result["attempts"] = attempt
        try:
            if EMAIL_PROVIDER == "smtp":
                await asyncio.to_thread(_smtp_send, to, subject, html)
            else:
                result["provider_id"] = await _send_once(to, subject, html)
            result.update(status="SENT", error=None)
            break
        except httpx.HTTPStatusError as e:
            try:
                code = e.response.json().get("code", "")
            except ValueError:
                code = ""
            paused = code in ("insufficient_credits", "integration_disabled", "daily_limit_reached")
            result.update(status="PAUSED" if paused else "FAILED", error=f"{e.response.status_code} {code}".strip())
            if paused or e.response.status_code not in RETRYABLE:
                break
        except Exception as e:
            result.update(status="FAILED", error=str(e)[:200])
        await asyncio.sleep(2 * attempt)
    if result["status"] != "SENT":
        logger.warning("Email send failed (%s): %s", template, result["error"])
    await db.email_logs.insert_one({"id": new_id("eml"), "to": to, "template": template, **result, "created_at": iso()})
    return result


def login_alert_email(name: str, ip: str | None, when: str) -> tuple[str, str]:
    body = (f'<p style="font-size:14px;line-height:1.6">Halo {escape(name)}, ada login baru ke akun Anda dari IP '
            f'<strong>{escape(ip or "-")}</strong> pada {escape(when)} (UTC).</p>'
            f'<p style="font-size:14px">Jika ini bukan Anda, segera atur ulang kata sandi dan cabut sesi di halaman Pengaturan.</p>')
    return f"Login baru ke akun {EMAIL_FROM_NAME}", _layout("Peringatan keamanan login", body)


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
