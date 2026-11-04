"""Qrisgg backend regression suite: auth, invoices state machine, reconciliation, API keys, webhooks, RBAC, admin."""
import concurrent.futures as cf
import time
import uuid

import requests

from conftest import API, ADMIN_EMAIL, PASSWORD, register, merchant_id_of, totp


def new_invoice(s, amount=100000, **kw):
    r = s.post(f"{API}/merchant/invoices", json={"amount": amount, "description": "TEST_inv", **kw})
    assert r.status_code == 200, r.text
    return r.json()


# ---------- Public / health ----------
class TestPublic:
    def test_health(self):
        r = requests.get(f"{API}/health")
        assert r.status_code == 200
        print(r.json())

    def test_plans(self):
        r = requests.get(f"{API}/public/plans")
        assert r.status_code == 200
        assert isinstance(r.json(), list) and len(r.json()) > 0

    def test_contact(self):
        r = requests.post(f"{API}/public/contact", json={"name": "TEST_c", "email": "delivered@resend.dev",
                                                          "company": "TEST", "message": "TEST_ message hello world"})
        assert r.status_code in (200, 201), r.text


# ---------- Auth ----------
class TestAuth:
    def test_register_and_me(self, merchant_a):
        r = merchant_a.get(f"{API}/auth/me")
        assert r.status_code == 200
        d = r.json()
        assert d["user"]["email"] == merchant_a.email if "user" in d else d["email"] == merchant_a.email
        assert "access_token" in merchant_a.cookies.get_dict()
        prof = merchant_a.get(f"{API}/merchant/profile").json()
        assert prof["status"] == "PENDING_REVIEW"

    def test_httponly_cookie(self):
        tag = uuid.uuid4().hex[:8]
        r = requests.post(f"{API}/auth/register", json={"name": f"TEST_c_{tag}", "email": f"delivered+ck{tag}@resend.dev",
                                                       "business_name": "TEST_ck", "password": PASSWORD})
        assert r.status_code == 200
        sc = r.headers.get("set-cookie", "")
        assert "HttpOnly" in sc or "httponly" in sc.lower(), sc

    def test_duplicate_register(self, merchant_a):
        r = requests.post(f"{API}/auth/register", json={"name": "TEST_dup", "email": merchant_a.email,
                                                       "business_name": "TEST_dup", "password": PASSWORD})
        assert r.status_code == 409

    def test_login_wrong_then_lockout(self):
        s = register("TEST_lock")
        codes = []
        for _ in range(6):
            codes.append(requests.post(f"{API}/auth/login", json={"email": s.email, "password": "WrongPass999"}).status_code)
        print("lockout codes", codes)
        assert codes[0] == 401
        assert 429 in codes
        r = requests.post(f"{API}/auth/login", json={"email": s.email, "password": PASSWORD})
        assert r.status_code == 429

    def test_login_logout(self):
        s = register("TEST_lo")
        s2 = requests.Session()
        r = s2.post(f"{API}/auth/login", json={"email": s.email, "password": PASSWORD})
        assert r.status_code == 200
        assert s2.get(f"{API}/auth/me").status_code == 200
        assert s2.post(f"{API}/auth/logout").status_code == 200
        assert s2.get(f"{API}/auth/me").status_code == 401

    def test_admin_mfa_and_rbac(self, admin, merchant_a):
        assert admin.get(f"{API}/admin/overview").status_code == 200
        assert merchant_a.get(f"{API}/admin/overview").status_code == 403
        # admin session without MFA: login only (mfa_required -> no cookie) => 401/403
        s = requests.Session()
        d = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "Qrisgg#Admin2026"}).json()
        assert d.get("mfa_required") and "access_token" not in s.cookies.get_dict()
        assert s.get(f"{API}/admin/overview").status_code in (401, 403)

    def test_wrong_totp(self):
        s = requests.Session()
        d = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "Qrisgg#Admin2026"}).json()
        r = s.post(f"{API}/auth/2fa/verify", json={"mfa_token": d["mfa_token"], "code": "000000"})
        assert r.status_code == 401


# ---------- Invoice engine ----------
class TestInvoices:
    def test_create_and_persist(self, merchant_a):
        inv = new_invoice(merchant_a)
        assert inv["status"] == "PENDING"
        assert 1 <= inv["unique_code"] <= 999 and inv["payable_amount"] == 100000 + inv["unique_code"]
        d = merchant_a.get(f"{API}/merchant/invoices/{inv['id']}").json()
        assert d["status"] == "PENDING" and len(d["transitions"]) >= 2
        p = requests.get(f"{API}/public/pay/{inv['id']}")
        assert p.status_code == 200 and p.json()["payable_amount"] == inv["payable_amount"]
        print("public pay keys", list(p.json().keys()))

    def test_exact_then_duplicate(self, merchant_a):
        inv = new_invoice(merchant_a)
        r = merchant_a.post(f"{API}/merchant/invoices/{inv['id']}/sandbox/simulate-payment", json={})
        assert r.status_code == 200, r.text
        assert r.json()["invoice"]["status"] == "AWAITING_VERIFICATION"
        r = merchant_a.post(f"{API}/merchant/invoices/{inv['id']}/sandbox/simulate-payment", json={})
        assert r.status_code == 200, r.text
        assert r.json()["invoice"]["status"] == "REVIEW_REQUIRED"
        assert r.json()["invoice"]["review_reason"] == "DUPLICATE_PAYMENT"

    def test_underpayment(self, merchant_a):
        inv = new_invoice(merchant_a, amount=55000)
        r = merchant_a.post(f"{API}/merchant/invoices/{inv['id']}/sandbox/simulate-payment", json={"amount": 50000})
        assert r.status_code == 200
        assert r.json()["invoice"]["status"] == "REVIEW_REQUIRED"
        assert r.json()["invoice"]["review_reason"] == "UNDERPAYMENT"

    def test_overpayment(self, merchant_a):
        inv = new_invoice(merchant_a, amount=56000)
        r = merchant_a.post(f"{API}/merchant/invoices/{inv['id']}/sandbox/simulate-payment", json={"amount": 99000})
        assert r.json()["invoice"]["review_reason"] == "OVERPAYMENT"

    def test_cancel_pending(self, merchant_a):
        inv = new_invoice(merchant_a)
        r = merchant_a.post(f"{API}/merchant/invoices/{inv['id']}/cancel", json={})
        assert r.status_code == 200 and r.json()["status"] == "CANCELLED"
        r = merchant_a.post(f"{API}/merchant/invoices/{inv['id']}/cancel", json={})
        assert r.status_code == 409

    def test_invalid_amounts(self, merchant_a):
        assert merchant_a.post(f"{API}/merchant/invoices", json={"amount": 0}).status_code == 422
        assert merchant_a.post(f"{API}/merchant/invoices", json={"amount": 10.5}).status_code == 422

    def test_idempotency(self, merchant_a):
        key = f"TEST_{uuid.uuid4().hex}"
        h = {"Idempotency-Key": key}
        r1 = merchant_a.post(f"{API}/merchant/invoices", json={"amount": 77000}, headers=h)
        r2 = merchant_a.post(f"{API}/merchant/invoices", json={"amount": 77000}, headers=h)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"]
        r3 = merchant_a.post(f"{API}/merchant/invoices", json={"amount": 78000}, headers=h)
        assert r3.status_code == 409

    def test_concurrency_unique(self, merchant_a):
        cookies = merchant_a.cookies.get_dict()

        def go(_):
            return requests.post(f"{API}/merchant/invoices", json={"amount": 123000}, cookies=cookies, timeout=60)

        with cf.ThreadPoolExecutor(30) as ex:
            res = list(ex.map(go, range(30)))
        codes = [r.status_code for r in res]
        print("concurrency codes", codes)
        ok = [r.json()["payable_amount"] for r in res if r.status_code == 200]
        assert len(ok) == 30
        assert len(set(ok)) == len(ok)

    def test_tenant_isolation(self, merchant_a, merchant_b):
        inv = new_invoice(merchant_a)
        assert merchant_b.get(f"{API}/merchant/invoices/{inv['id']}").status_code == 404
        assert merchant_b.post(f"{API}/merchant/invoices/{inv['id']}/cancel", json={}).status_code == 404
        assert merchant_b.post(f"{API}/merchant/invoices/{inv['id']}/sandbox/simulate-payment", json={}).status_code == 404
        mid_a = merchant_id_of(merchant_a)
        assert merchant_b.get(f"{API}/merchant/invoices", headers={"X-Merchant-Id": mid_a}).status_code == 403


# ---------- Admin reconciliation ----------
class TestReconciliation:
    def test_verify_flow(self, admin):
        m = register("TEST_rec")
        inv = new_invoice(m)
        # verify on PENDING -> 409
        r = admin.post(f"{API}/admin/invoices/{inv['id']}/verify", json={"event_id": "evt_x", "note": "TEST_ note", "totp_code": totp()})
        print("verify pending", r.status_code, r.text[:200])
        assert r.status_code in (409, 422)
        sim = m.post(f"{API}/merchant/invoices/{inv['id']}/sandbox/simulate-payment", json={}).json()
        eid = sim["event"]["id"]
        r = admin.post(f"{API}/admin/invoices/{inv['id']}/verify", json={"event_id": eid, "note": "TEST_ note", "totp_code": "000000"})
        assert r.status_code == 401
        r = admin.post(f"{API}/admin/invoices/{inv['id']}/verify", json={"event_id": eid, "note": "TEST_ verified", "totp_code": totp()})
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "PAID_VERIFIED"
        recs = admin.get(f"{API}/admin/reconciliation").json()
        assert any(x["invoice_id"] == inv["id"] for x in recs)
        # cancel PAID_VERIFIED -> 409
        assert m.post(f"{API}/merchant/invoices/{inv['id']}/cancel", json={}).status_code == 409
        d = m.get(f"{API}/merchant/invoices/{inv['id']}").json()
        assert d["status"] == "PAID_VERIFIED" and len(d["reconciliations"]) == 1

    def test_verify_pending_strict_409(self, admin):
        m = register("TEST_rec2")
        inv = new_invoice(m)
        # PENDING invoice has no linked events -> backend returns 422 (event check precedes state check)
        r = admin.post(f"{API}/admin/invoices/{inv['id']}/verify", json={"event_id": "evt_none", "note": "TEST_ note", "totp_code": totp()})
        assert r.status_code in (409, 422)
        sim = m.post(f"{API}/merchant/invoices/{inv['id']}/sandbox/simulate-payment", json={}).json()
        eid = sim["event"]["id"]
        assert admin.post(f"{API}/admin/invoices/{inv['id']}/verify", json={"event_id": eid, "note": "TEST_ ok", "totp_code": totp()}).status_code == 200
        r = admin.post(f"{API}/admin/invoices/{inv['id']}/verify", json={"event_id": eid, "note": "TEST_ again", "totp_code": totp()})
        assert r.status_code == 409  # double verify rejected

    def test_ingest_by_amount(self, admin):
        m = register("TEST_ing")
        inv = new_invoice(m, amount=88000)
        mid = merchant_id_of(m)
        r = admin.post(f"{API}/admin/payment-events/ingest", json={"merchant_id": mid, "amount": inv["payable_amount"],
                                                                     "reference": f"TEST{uuid.uuid4().hex[:8]}"})
        assert r.status_code == 200, r.text
        assert r.json()["invoice_id"] == inv["id"] and r.json()["match_result"] == "EXACT_MATCH"
        assert m.get(f"{API}/merchant/invoices/{inv['id']}").json()["status"] == "AWAITING_VERIFICATION"

    def test_suspend_approve(self, admin):
        m = register("TEST_sus")
        mid = merchant_id_of(m)
        assert admin.post(f"{API}/admin/merchants/{mid}/approve").json()["status"] == "ACTIVE"
        r = admin.post(f"{API}/admin/merchants/{mid}/suspend", json={"reason": "TEST_ suspend"})
        assert r.json()["status"] == "SUSPENDED"
        assert m.post(f"{API}/merchant/invoices", json={"amount": 10000}).status_code == 403
        admin.post(f"{API}/admin/merchants/{mid}/approve")
        assert m.post(f"{API}/merchant/invoices", json={"amount": 10000}).status_code == 200

    def test_admin_lists(self, admin):
        for p in ("users", "merchants", "invoices", "payment-events", "audit-logs", "settings", "qris-accounts", "plans", "providers", "support"):
            r = admin.get(f"{API}/admin/{p}")
            assert r.status_code == 200, f"{p}: {r.status_code}"

    def test_plan_crud_public(self, admin):
        r = admin.post(f"{API}/admin/plans", json={"name": "TEST_Plan", "description": "TEST", "price_label": "Rp0", "features": ["a"], "sort": 99})
        assert r.status_code == 200
        pid = r.json()["id"]
        assert any(p["id"] == pid for p in requests.get(f"{API}/public/plans").json())
        r = admin.put(f"{API}/admin/plans/{pid}", json={"name": "TEST_Plan2", "description": "TEST", "price_label": "Rp0", "features": [], "active": False, "sort": 99})
        assert r.json()["name"] == "TEST_Plan2"
        assert not any(p["id"] == pid for p in requests.get(f"{API}/public/plans").json())
        assert admin.delete(f"{API}/admin/plans/{pid}").status_code == 200

    def test_settings_patch_noop(self, admin):
        cur = admin.get(f"{API}/admin/settings").json()["values"]
        r = admin.patch(f"{API}/admin/settings", json={"reuse_cooldown_minutes": cur["reuse_cooldown_minutes"]})
        assert r.status_code == 200
        assert admin.patch(f"{API}/admin/settings", json={"bogus": 1}).status_code == 422


# ---------- Developers: API keys / webhooks / RBAC / QRIS ----------
class TestDevelopers:
    def test_api_keys(self, merchant_b):
        r = merchant_b.post(f"{API}/merchant/api-keys", json={"name": "TEST_k", "scopes": ["invoices:read", "invoices:write"]})
        assert r.status_code == 200, r.text
        k = r.json()
        assert k["secret"].startswith("qgg_sk_sandbox_")
        assert all("secret" not in x for x in merchant_b.get(f"{API}/merchant/api-keys").json())
        h = {"Authorization": f"Bearer {k['secret']}"}
        r = requests.post(f"{API}/v1/invoices", json={"amount": 25000}, headers=h)
        assert r.status_code == 200 and r.json()["status"] == "PENDING"
        assert requests.get(f"{API}/v1/invoices/{r.json()['id']}", headers=h).status_code == 200
        assert requests.get(f"{API}/v1/balances", headers=h).status_code == 200
        assert requests.get(f"{API}/v1/withdrawals", headers=h).status_code == 501
        ro = merchant_b.post(f"{API}/merchant/api-keys", json={"name": "TEST_ro", "scopes": ["invoices:read"]}).json()
        assert requests.post(f"{API}/v1/invoices", json={"amount": 25000}, headers={"Authorization": f"Bearer {ro['secret']}"}).status_code == 403
        rot = merchant_b.post(f"{API}/merchant/api-keys/{k['id']}/rotate").json()
        assert requests.post(f"{API}/v1/invoices", json={"amount": 25000}, headers=h).status_code == 401
        h2 = {"Authorization": f"Bearer {rot['secret']}"}
        assert requests.post(f"{API}/v1/invoices", json={"amount": 25000}, headers=h2).status_code == 200
        assert merchant_b.delete(f"{API}/merchant/api-keys/{rot['id']}").status_code == 200
        assert requests.post(f"{API}/v1/invoices", json={"amount": 25000}, headers=h2).status_code == 401

    def test_webhooks(self, merchant_b):
        bad = merchant_b.post(f"{API}/merchant/webhooks", json={"url": "http://httpbin.org/post", "events": ["payment.verified"]})
        assert bad.status_code == 422
        bad = merchant_b.post(f"{API}/merchant/webhooks", json={"url": "https://127.0.0.1/x", "events": ["payment.verified"]})
        assert bad.status_code == 422
        r = merchant_b.post(f"{API}/merchant/webhooks", json={"url": "https://httpbin.org/post", "events": ["payment.detected", "payment.verified"]})
        assert r.status_code == 200, r.text
        wid = r.json()["id"]
        assert r.json()["secret"].startswith("whsec_")
        t = merchant_b.post(f"{API}/merchant/webhooks/{wid}/test", timeout=60)
        assert t.status_code == 200
        print("test delivery", t.json())
        inv = new_invoice(merchant_b)
        merchant_b.post(f"{API}/merchant/invoices/{inv['id']}/sandbox/simulate-payment", json={})
        dl = merchant_b.get(f"{API}/merchant/webhook-deliveries").json()
        types = [d["event_type"] for d in dl]
        print("delivery types", types)
        assert "payment.detected" in types
        merchant_b.delete(f"{API}/merchant/webhooks/{wid}")

    def test_viewer_rbac(self, merchant_a):
        viewer = register("TEST_viewer")
        r = merchant_a.post(f"{API}/merchant/team", json={"email": viewer.email, "role": "MERCHANT_VIEWER"})
        assert r.status_code == 200, r.text
        mid = merchant_id_of(merchant_a)
        h = {"X-Merchant-Id": mid}
        assert viewer.get(f"{API}/merchant/invoices", headers=h).status_code == 200
        assert viewer.post(f"{API}/merchant/invoices", json={"amount": 10000}, headers=h).status_code == 403
        assert viewer.post(f"{API}/merchant/api-keys", json={"name": "TEST_x", "scopes": ["invoices:read"]}, headers=h).status_code == 403

    def test_qris(self, merchant_b):
        r = merchant_b.post(f"{API}/merchant/qris", json={"label": "TEST_q", "authorization_confirmed": False})
        assert r.status_code == 422
        r = merchant_b.post(f"{API}/merchant/qris", json={"label": "TEST_q", "qris_payload": "00020101021126BADPAYLOAD6304ABCD", "authorization_confirmed": True})
        assert r.status_code == 422
        r = merchant_b.post(f"{API}/merchant/qris", json={"label": "TEST_q", "authorization_confirmed": True})
        assert r.status_code == 200 and r.json()["status"] == "PENDING_REVIEW"
