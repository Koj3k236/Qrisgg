"""Phase 8 SANDBOX finance: ledger, settlements/holds, bank accounts, withdrawals, payouts, auto-withdraw, v1 balances.
NOTE: sets hold_hours=0 (restore to 6 manually after the run)."""
import concurrent.futures as cf
import time
import uuid

import pytest
import requests

from conftest import API, register, merchant_id_of, totp


def poll(fn, timeout=40, every=2):
    end = time.time() + timeout
    last = None
    while time.time() < end:
        last = fn()
        if last:
            return last
        time.sleep(every)
    return last


def bal(m):
    r = m.get(f"{API}/merchant/balance")
    assert r.status_code == 200, r.text
    return r.json()["balances"]


def fund(admin, m, amount=200000):
    """Creates + verifies + confirms an invoice; waits for hold release. Returns (settlement, payable)."""
    assert admin.patch(f"{API}/admin/settings", json={"hold_hours": 0}).status_code == 200
    mid = merchant_id_of(m)
    assert admin.post(f"{API}/admin/merchants/{mid}/approve").json()["status"] == "ACTIVE"
    inv = m.post(f"{API}/merchant/invoices", json={"amount": amount, "description": "TEST_fund"}).json()
    sim = m.post(f"{API}/merchant/invoices/{inv['id']}/sandbox/simulate-payment", json={}).json()
    assert m.get(f"{API}/merchant/invoices/{inv['id']}").json()["status"] == "AWAITING_VERIFICATION"
    r = admin.post(f"{API}/admin/invoices/{inv['id']}/verify", json={"event_id": sim["event"]["id"], "note": "TEST_ ok", "totp_code": totp()})
    assert r.status_code == 200 and r.json()["status"] == "PAID_VERIFIED", r.text
    s = next(x for x in admin.get(f"{API}/admin/settlements").json() if x["invoice_id"] == inv["id"])
    assert s["status"] == "PENDING_CONFIRMATION" and s["amount"] == inv["payable_amount"]
    assert bal(m) == {"pending": 0, "available": 0, "payout_reserved": 0}
    r = admin.post(f"{API}/admin/settlements/{s['id']}/confirm", json={"note": "TEST_ confirm", "totp_code": totp()})
    assert r.status_code == 200 and r.json()["status"] == "CONFIRMED", r.text
    released = poll(lambda: next((x for x in admin.get(f"{API}/admin/settlements").json() if x["id"] == s["id"] and x["status"] == "RELEASED"), None))
    assert released, "settlement not RELEASED by worker"
    return s, inv["payable_amount"]


def add_bank(admin, m, number, verify=True):
    r = m.post(f"{API}/merchant/bank-accounts", json={"bank_name": "TEST_Bank", "account_holder": "TEST Holder", "account_number": number})
    assert r.status_code == 200 and r.json()["status"] == "PENDING_VERIFICATION", r.text
    b = r.json()
    if verify:
        assert admin.post(f"{API}/admin/bank-accounts/{b['id']}/verify").json()["status"] == "VERIFIED"
    return b


def wd_status(admin, wid):
    return next(x for x in admin.get(f"{API}/admin/withdrawals").json() if x["id"] == wid)


# Settlement + hold + ledger + withdrawals main flow (sequential, shared merchant)
class TestLedgerFlow:
    state = {}

    def test_settlement_flow(self, admin):
        m = register("TEST_fin")
        self.state["m"] = m
        s, amt = fund(admin, m)
        self.state["amt"] = amt
        assert bal(m) == {"pending": 0, "available": amt, "payout_reserved": 0}
        # double confirm -> 409 ; wrong TOTP -> 401
        assert admin.post(f"{API}/admin/settlements/{s['id']}/confirm", json={"note": "TEST_ again", "totp_code": totp()}).status_code == 409
        assert admin.post(f"{API}/admin/settlements/{s['id']}/confirm", json={"note": "TEST_ bad", "totp_code": "000000"}).status_code == 401
        assert bal(m)["available"] == amt  # no double credit

    def test_merchant_settlements_list(self):
        m = self.state["m"]
        rows = m.get(f"{API}/merchant/settlements").json()
        assert len(rows) == 1 and rows[0]["status"] == "RELEASED"

    def test_bank_and_withdraw_validation(self, admin):
        m = self.state["m"]
        unver = add_bank(admin, m, "9876543210", verify=False)
        r = m.post(f"{API}/merchant/withdrawals", json={"amount": 20000, "bank_account_id": unver["id"]})
        assert r.status_code == 422, r.text
        assert m.post(f"{API}/merchant/bank-accounts", json={"bank_name": "TEST_B", "account_holder": "TEST H", "account_number": "12ab34"}).status_code == 422
        good = add_bank(admin, m, "1234567890")
        assert good["account_number_masked"].endswith("7890")
        self.state["bank"] = good
        assert m.post(f"{API}/merchant/withdrawals", json={"amount": self.state["amt"] + 1, "bank_account_id": good["id"]}).status_code == 422
        assert m.post(f"{API}/merchant/withdrawals", json={"amount": 5000, "bank_account_id": good["id"]}).status_code == 422
        # auto-withdraw with unverified account -> 422
        assert m.put(f"{API}/merchant/withdrawals/auto", json={"enabled": True, "bank_account_id": unver["id"], "min_amount": 10000}).status_code == 422

    def test_withdraw_idempotent_and_complete(self, admin):
        m, bank, amt = self.state["m"], self.state["bank"], self.state["amt"]
        h = {"Idempotency-Key": f"TEST_{uuid.uuid4().hex}"}
        r1 = m.post(f"{API}/merchant/withdrawals", json={"amount": 20000, "bank_account_id": bank["id"]}, headers=h)
        r2 = m.post(f"{API}/merchant/withdrawals", json={"amount": 20000, "bank_account_id": bank["id"]}, headers=h)
        assert r1.status_code == 200 and r2.status_code == 200, r1.text
        assert r1.json()["id"] == r2.json()["id"] and r1.json()["status"] == "REQUESTED"
        assert bal(m) == {"pending": 0, "available": amt - 20000, "payout_reserved": 20000}
        wid = r1.json()["id"]
        assert admin.post(f"{API}/admin/withdrawals/{wid}/approve", json={"note": "TEST_ ok", "totp_code": "000000"}).status_code == 401
        r = admin.post(f"{API}/admin/withdrawals/{wid}/approve", json={"note": "TEST_ ok", "totp_code": totp()})
        assert r.status_code == 200 and r.json()["status"] == "APPROVED", r.text
        assert poll(lambda: wd_status(admin, wid)["status"] == "COMPLETED"), wd_status(admin, wid)
        assert bal(m) == {"pending": 0, "available": amt - 20000, "payout_reserved": 0}
        assert admin.post(f"{API}/admin/withdrawals/{wid}/approve", json={"note": "TEST_ x", "totp_code": totp()}).status_code == 409
        self.state["amt"] = amt - 20000

    def test_reject_returns_funds(self, admin):
        m, bank, amt = self.state["m"], self.state["bank"], self.state["amt"]
        w = m.post(f"{API}/merchant/withdrawals", json={"amount": 10000, "bank_account_id": bank["id"]}).json()
        assert bal(m)["available"] == amt - 10000
        r = admin.post(f"{API}/admin/withdrawals/{w['id']}/reject", json={"note": "TEST_ reject", "totp_code": totp()})
        assert r.status_code == 200 and r.json()["status"] == "REJECTED", r.text
        assert bal(m) == {"pending": 0, "available": amt, "payout_reserved": 0}

    def test_concurrent_no_overdraw(self):
        m, bank, amt = self.state["m"], self.state["bank"], self.state["amt"]
        each = amt // 2 + 1
        cookies = m.cookies.get_dict()

        def go(_):
            return requests.post(f"{API}/merchant/withdrawals", json={"amount": each, "bank_account_id": bank["id"]}, cookies=cookies, timeout=60)
        with cf.ThreadPoolExecutor(6) as ex:
            res = list(ex.map(go, range(6)))
        codes = [r.status_code for r in res]
        print("concurrent codes", codes)
        assert codes.count(200) == 1, codes
        b = bal(m)
        assert b["available"] == amt - each and b["payout_reserved"] == each and b["available"] >= 0

    def test_viewer_cannot_withdraw(self):
        m, bank = self.state["m"], self.state["bank"]
        viewer = register("TEST_fview")
        assert m.post(f"{API}/merchant/team", json={"email": viewer.email, "role": "MERCHANT_VIEWER"}).status_code == 200
        h = {"X-Merchant-Id": merchant_id_of(m)}
        assert viewer.get(f"{API}/merchant/balance", headers=h).status_code == 200
        assert viewer.post(f"{API}/merchant/bank-accounts", json={"bank_name": "TEST_B", "account_holder": "TEST H", "account_number": "1111112222"}, headers=h).status_code == 403
        assert viewer.post(f"{API}/merchant/withdrawals", json={"amount": 10000, "bank_account_id": bank["id"]}, headers=h).status_code == 403

    def test_v1_balances_settlements(self):
        m = self.state["m"]
        k = m.post(f"{API}/merchant/api-keys", json={"name": "TEST_fk", "scopes": ["invoices:read"]}).json()
        h = {"Authorization": f"Bearer {k['secret']}"}
        r = requests.get(f"{API}/v1/balances", headers=h)
        assert r.status_code == 200 and r.json()["data"] == bal(m)
        r = requests.get(f"{API}/v1/settlements", headers=h)
        assert r.status_code == 200 and len(r.json()["data"]) == 1
        assert requests.get(f"{API}/v1/withdrawals", headers=h).status_code == 501
        assert requests.get(f"{API}/v1/balances").status_code == 401

    def test_auto_withdraw(self, admin):
        m, bank = self.state["m"], self.state["bank"]
        r = m.put(f"{API}/merchant/withdrawals/auto", json={"enabled": True, "bank_account_id": bank["id"], "min_amount": 10000})
        assert r.status_code == 200, r.text
        avail = bal(m)["available"]
        assert avail >= 10000
        sched = poll(lambda: [w for w in m.get(f"{API}/merchant/withdrawals").json()["items"] if w["source"] == "SCHEDULED"], timeout=30)
        assert sched and sched[0]["amount"] == avail and sched[0]["status"] == "REQUESTED", sched
        assert bal(m)["available"] == 0
        m.put(f"{API}/merchant/withdrawals/auto", json={"enabled": False})

    def test_ledger_invariants(self, admin):
        inv = admin.get(f"{API}/admin/ledger").json()["invariants"]
        print(inv)
        assert inv["ok"] is True and inv["total_debit"] == inv["total_credit"]
        assert inv["negative_merchant_accounts"] == [] and inv["double_credits"] == []


# Payout failure with retries (account ending 0000) - slow (~2 min)
class TestPayoutFailure:
    def test_retry_then_failed(self, admin):
        m = register("TEST_fail")
        _, amt = fund(admin, m)
        bank = add_bank(admin, m, "5555550000")
        w = m.post(f"{API}/merchant/withdrawals", json={"amount": 15000, "bank_account_id": bank["id"]}).json()
        assert admin.post(f"{API}/admin/withdrawals/{w['id']}/approve", json={"note": "TEST_ ok", "totp_code": totp()}).status_code == 200
        seen = set()

        def check():
            st = wd_status(admin, w["id"])
            seen.add(st["status"])
            return st if st["status"] == "FAILED" else None
        final = poll(check, timeout=200, every=5)
        print("statuses seen", seen, final and final.get("attempts"))
        assert final and final["attempts"] == 3
        assert "RETRY_PENDING" in seen
        assert bal(m) == {"pending": 0, "available": amt, "payout_reserved": 0}
