# Auth Testing Playbook (Qrisgg)

1. MongoDB: `db.users.findOne({platform_role:"SUPER_ADMIN"})` — password_hash starts with `$argon2id$`. Indexes: users.email unique, login_attempts.identifier unique, auth_tokens.expires_at TTL, sessions.expires_at TTL.
2. API:
```
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)
curl -c c.txt -X POST $API/api/auth/login -H "Content-Type: application/json" -d '{"email":"jenniferwidra@hotmail.com","password":"Qrisgg#Admin2026"}'   # -> mfa_required + mfa_token
CODE=$(python3 -c "import pyotp;print(pyotp.TOTP('ZLCVUO7WSTA7METK5GDAEVQKR5BVFAPY').now())")
curl -c c.txt -X POST $API/api/auth/2fa/verify -H "Content-Type: application/json" -d "{\"mfa_token\":\"<token>\",\"code\":\"$CODE\"}"
curl -b c.txt $API/api/auth/me
```
3. Cookies: access_token + refresh_token are HttpOnly, Secure, SameSite=None.
4. Mutating requests with cookies from a foreign Origin header are rejected (403 CSRF).
