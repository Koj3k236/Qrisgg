# Qrisgg — PRD

## Original problem statement
MASTER DEVELOPMENT PROMPT FINAL — QRISGG — QRIS Payment Gateway & Merchant Payment Infrastructure (qrisgg.com / api.qrisgg.com, VPS 162.243.27.9 Ubuntu 24.04, /opt/qrisgg, Bahasa Indonesia, QRIS provider phase 1: Bank Mandiri — Livin' Usaha, sandbox-first). Full prompt: premium marketing site (hero with real Indonesian customer scanning QRIS, features, how it works, QRIS & dashboard showcase, developer, pricing, about with given Visi/Misi text, security, CTA, footer), separate /login /register /forgot-password /reset-password /verify-email /2fa, merchant dashboard /dashboard/*, admin panel /admin/*, /pay/:invoiceId, invoice engine with unique amounts, payment state machine (CREATED…REFUNDED), Android listener, double-entry ledger, 6h hold & withdrawals, developer REST API /v1, webhooks HMAC, Telegram/WhatsApp, security, Docker deployment, phases 1–12, acceptance criteria, honest reporting.

User choices (turn 2): React + FastAPI + MongoDB (keep modular architecture, state machine, ledger design; use Mongo transactions where supported); v1 = premium public website + login + merchant & admin dashboards + end-to-end sandbox invoice; Emergent managed Resend email; AI/real photorealistic hero; only Mandiri; no fake ledger/withdrawal/settlement (mark NOT IMPLEMENTED); no VPS deploy claims; Dockerfile + Compose; GitHub export guide; test reports. User uploaded 4 QRISGG photos and asked them to be an auto-rotating slider (not combined).

## Architecture
See /app/docs/ARCHITECTURE.md (ERD, state machine, threat model), /app/docs/DEPLOYMENT.md, /app/docs/ENVIRONMENT.md. FastAPI modular monolith (core/, modules/), MongoDB with unique partial indexes, in-process worker (expiry, allocation release, webhook retries). React Router with separate layouts.

## User personas
UMKM/retail merchant owners, merchant staff (admin/developer/viewer), developers integrating API, Qrisgg platform admins.

## Core requirements (static)
Sandbox-only payments; PAYMENT_DETECTED never auto → PAID_VERIFIED; verification only via admin reconciliation with MFA step-up; integer rupiah; tenant isolation; RBAC in backend; no invented fees/partnerships/licenses.

## Implemented (2026-11-04)
- Phase 1 docs; foundation; premium landing (4-photo auto slider, DEMO labels) + about/features/pricing/developers/docs/contact/security/terms/privacy/status
- Auth: Argon2id, JWT httpOnly cookies + server sessions (revocable), email verify & reset (Emergent Resend), TOTP 2FA (mandatory for admins), lockout per IP+email and per account, CSRF origin check
- Merchant: overview (real data), invoices (create/list/detail/cancel, Idempotency-Key), sandbox simulator, payment events, QRIS static config (EMV/CRC validation, admin approval), API keys (hashed, scoped, rotate/revoke), webhooks (HMAC, retry/backoff, dead-letter, SSRF guard, test), team RBAC, settings/sessions, support
- Admin: overview, merchants approve/suspend, users, invoices + reconciliation verify/fail (TOTP step-up), payment events + amount-matching ingest, reconciliation records, QRIS review, providers, plans CRUD, audit logs, system settings, support
- Public API /api/v1/invoices (+ webhook-deliveries); others 501
- Infra: Dockerfiles, compose (Mongo replica set → transactions), nginx, backup/restore/deploy scripts
- Testing iteration_1: backend 29/30 → lockout bug fixed & verified; frontend flows 100% after CSRF host fix

## 2026-11-04 (lanjutan)
- Phase 8 ledger/settlement/hold/withdrawal sandbox done; MFA rotation & withdrawal retry fixes (needs e2e retest)
- README.md rewritten: full flows, endpoints, status per phase, handoff notes (for agent switch + GitHub save). test_credentials.md is gitignored and not in git history.

## Backlog
- P0: Phase 8 ledger double-entry, settlement tracking, 6h hold, withdrawal simulator
- P1: Payment links; Android NotificationListener app (Kotlin); Redis/queue worker for production; replace Emergent email for self-host
- P2: Telegram/WhatsApp notifications; risk module; official Mandiri adapter (blocked on docs/credentials/authorization)

## Next tasks
Ledger + settlement sandbox design review with owner; deploy to VPS by owner using docs/DEPLOYMENT.md.
