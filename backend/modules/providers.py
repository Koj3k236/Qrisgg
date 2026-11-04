"""Payment provider abstraction. Phase 1: Bank Mandiri — Livin' Usaha only."""
from abc import ABC, abstractmethod


class ProviderDisabledError(Exception):
    pass


def crc16_ccitt(data: str) -> str:
    crc = 0xFFFF
    for ch in data.encode():
        crc ^= ch << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if crc & 0x8000 else (crc << 1)
            crc &= 0xFFFF
    return f"{crc:04X}"


def parse_emv(payload: str) -> dict:
    tags, i = {}, 0
    while i + 4 <= len(payload):
        tag, length = payload[i:i + 2], payload[i + 2:i + 4]
        if not length.isdigit():
            raise ValueError("Format TLV tidak valid")
        n = int(length)
        tags[tag] = payload[i + 4:i + 4 + n]
        i += 4 + n
    return tags


class MandiriStaticQrisConfiguration:
    """Validates an operator-authorized static QRIS payload (EMVCo MPM)."""

    @staticmethod
    def validate(payload: str) -> dict:
        payload = payload.strip()
        if not payload.startswith("000201"):
            raise ValueError("Payload QRIS harus diawali 000201 (EMVCo)")
        if "6304" not in payload[-8:]:
            raise ValueError("Payload QRIS tidak memiliki tag CRC (63)")
        if crc16_ccitt(payload[:-4]) != payload[-4:].upper():
            raise ValueError("CRC payload QRIS tidak valid")
        tags = parse_emv(payload)
        if tags.get("01") != "11":
            raise ValueError("Hanya QRIS statis (tag 01 = 11) yang didukung pada fase ini")
        return {"merchant_name": tags.get("59"), "merchant_city": tags.get("60"), "currency": tags.get("53")}


class PaymentProvider(ABC):
    code: str

    @abstractmethod
    async def get_capabilities(self) -> dict: ...

    @abstractmethod
    async def create_payment(self, invoice: dict) -> dict: ...

    @abstractmethod
    async def get_payment_status(self, invoice: dict) -> dict: ...

    @abstractmethod
    async def verify_webhook(self, payload: dict) -> dict: ...

    @abstractmethod
    async def reconcile_payment(self, invoice: dict) -> dict: ...

    @abstractmethod
    async def get_settlement_status(self, invoice: dict) -> dict: ...


class MandiriSandboxProvider(PaymentProvider):
    code = "MANDIRI_LIVIN_USAHA_SANDBOX"

    async def get_capabilities(self) -> dict:
        return {"provider": self.code, "mode": "SANDBOX", "enabled": True, "dynamic_qris": False,
                "bank_callbacks": False, "settlement_api": False, "payout_api": False,
                "verification": "MANUAL_ADMIN_RECONCILIATION"}

    async def create_payment(self, invoice: dict) -> dict:
        # Sandbox never renders a payable QRIS; the string below is a non-EMV demo marker.
        return {"qr_string": f"QRISGG-SANDBOX-DEMO|{invoice['id']}|{invoice['payable_amount']}|TIDAK-UNTUK-PEMBAYARAN",
                "qr_type": "DEMO"}

    async def get_payment_status(self, invoice: dict) -> dict:
        return {"status": invoice["status"], "source": "QRISGG_DATABASE"}

    async def verify_webhook(self, payload: dict) -> dict:
        return {"verified": False, "reason": "Sandbox tidak menerima callback bank"}

    async def reconcile_payment(self, invoice: dict) -> dict:
        return {"supported": False, "method": "MANUAL_ADMIN_RECONCILIATION"}

    async def get_settlement_status(self, invoice: dict) -> dict:
        return {"status": "NOT_IMPLEMENTED"}


class MandiriOfficialProviderAdapter(PaymentProvider):
    """Disabled until official Mandiri documentation, credentials and contractual authorization exist."""
    code = "MANDIRI_LIVIN_USAHA_OFFICIAL"

    async def get_capabilities(self) -> dict:
        return {"provider": self.code, "mode": "LIVE", "enabled": False,
                "reason": "Belum ada dokumentasi API resmi, kredensial, dan otorisasi kontraktual dari Bank Mandiri"}

    async def _disabled(self, *_):
        raise ProviderDisabledError("Adapter resmi Mandiri belum diaktifkan")

    create_payment = get_payment_status = verify_webhook = reconcile_payment = get_settlement_status = _disabled


PROVIDERS = {p.code: p for p in (MandiriSandboxProvider(), MandiriOfficialProviderAdapter())}


def active_provider() -> PaymentProvider:
    return PROVIDERS[MandiriSandboxProvider.code]
