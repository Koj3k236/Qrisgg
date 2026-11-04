# Auth Testing Playbook (Qrisgg)

Credentials: read /app/memory/test_credentials.md (gitignored; never commit credentials).

1. MongoDB: SUPER_ADMIN password_hash starts with `$argon2id$`. Indexes: users.email unique, login_attempts.identifier unique, auth_tokens.expires_at TTL, sessions.expires_at TTL.
2. API: POST /api/auth/login -> {mfa_required, mfa_token} for admin; POST /api/auth/2fa/verify {mfa_token, code} (code from pyotp with the secret in test_credentials.md); GET /api/auth/me.
3. Cookies: access_token + refresh_token are HttpOnly, Secure, SameSite=None.
4. Mutating requests with cookies from a foreign Origin header are rejected (403 CSRF).
5. Lockout: 5 fails per IP+email, 10 fails per account -> 429 for 15 minutes.
