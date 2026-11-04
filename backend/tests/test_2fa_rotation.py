"""2FA rotation on a SECOND (TEST_) admin — never rotates the seeded SUPER_ADMIN."""
import time

import pyotp
import requests

from conftest import API, PASSWORD, register


def wait_new_window():
    time.sleep(31 - (time.time() % 30))


class TestRotation:
    def test_rotate_second_admin(self, admin):
        u = register("TEST_adm2")
        uid = u.get(f"{API}/auth/me").json()["id"]
        r = admin.patch(f"{API}/admin/users/{uid}", json={"platform_role": "ADMIN"})
        assert r.status_code == 200, r.text
        s = requests.Session()
        d = s.post(f"{API}/auth/login", json={"email": u.email, "password": PASSWORD}).json()
        print("login as new admin (no mfa yet):", {k: d.get(k) for k in ("mfa_required", "mfa_setup_required")})
        r = s.post(f"{API}/auth/2fa/setup", json={})
        assert r.status_code == 200, r.text
        old = r.json()["secret"]
        assert s.post(f"{API}/auth/2fa/enable", json={"code": pyotp.TOTP(old).now()}).json()["mfa_enabled"] is True
        # rotation without current code -> 400
        assert s.post(f"{API}/auth/2fa/setup", json={}).status_code == 400
        assert s.post(f"{API}/auth/2fa/setup", json={"code": "000000"}).status_code == 400
        r = s.post(f"{API}/auth/2fa/setup", json={"code": pyotp.TOTP(old).now()})
        assert r.status_code == 200, r.text
        new = r.json()["secret"]
        assert new != old
        # old secret still active until enable; enabling with old code must fail
        assert s.post(f"{API}/auth/2fa/enable", json={"code": pyotp.TOTP(old).now()}).status_code == 400 or pyotp.TOTP(old).now() == pyotp.TOTP(new).now()
        assert s.post(f"{API}/auth/2fa/enable", json={"code": pyotp.TOTP(new).now()}).status_code == 200
        # fresh login: old secret rejected, new accepted
        s2 = requests.Session()
        tok = s2.post(f"{API}/auth/login", json={"email": u.email, "password": PASSWORD}).json()
        assert tok.get("mfa_required") is True, tok
        assert s2.post(f"{API}/auth/2fa/verify", json={"mfa_token": tok["mfa_token"], "code": pyotp.TOTP(old).now()}).status_code in (400, 401)
        tok = s2.post(f"{API}/auth/login", json={"email": u.email, "password": PASSWORD}).json()
        assert s2.post(f"{API}/auth/2fa/verify", json={"mfa_token": tok["mfa_token"], "code": pyotp.TOTP(new).now()}).status_code == 200
        with open("/tmp/qgg_admin2.txt", "w") as f:
            f.write(f"{u.email}\n{new}\n")
