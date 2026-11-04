import os
import uuid

import pyotp
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "jenniferwidra@hotmail.com"
ADMIN_PASSWORD = "Qrisgg#Admin2026"
TOTP_SECRET = "ZLCVUO7WSTA7METK5GDAEVQKR5BVFAPY"
PASSWORD = "TestPass12345"


def totp():
    return pyotp.TOTP(TOTP_SECRET).now()


def register(name_prefix="TEST_m"):
    s = requests.Session()
    tag = uuid.uuid4().hex[:8]
    email = f"delivered+qgg{tag}@resend.dev"
    r = s.post(f"{API}/auth/register", json={"name": f"{name_prefix}_{tag}", "email": email,
                                            "business_name": f"TEST_Biz_{tag}", "password": PASSWORD})
    assert r.status_code == 200, r.text
    with open("/tmp/qgg_created_emails.txt", "a") as f:  # tracked for id-based cleanup
        f.write(email + "\n")
    data = r.json()
    s.email = email
    s.me = data
    return s


def merchant_id_of(s):
    r = s.get(f"{API}/merchant/profile")
    assert r.status_code == 200, r.text
    return r.json()["id"]


@pytest.fixture(scope="session")
def admin():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("mfa_required") is True
    r = s.post(f"{API}/auth/2fa/verify", json={"mfa_token": d["mfa_token"], "code": totp()})
    assert r.status_code == 200, r.text
    return s


@pytest.fixture(scope="session")
def merchant_a():
    return register("TEST_A")


@pytest.fixture(scope="session")
def merchant_b():
    return register("TEST_B")
