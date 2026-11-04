import pyotp

from core.db import db
from core.security import decrypt


async def verify_totp_once(user_id: str, secret_enc: str, code: str) -> bool:
    """Valid TOTP code that has not been used before (replay protection via last used time-step)."""
    totp = pyotp.TOTP(decrypt(secret_enc))
    now_step = totp.timecode(__import__("datetime").datetime.now())
    step = next((s for s in (now_step - 1, now_step, now_step + 1) if totp.generate_otp(s) == code), None)
    if step is None:
        return False
    res = await db.users.update_one({"id": user_id, "$or": [{"last_totp_step": {"$lt": step}}, {"last_totp_step": {"$exists": False}}]},
                                    {"$set": {"last_totp_step": step}})
    return res.modified_count == 1
