# Qrisgg — QRIS Payment Gateway & Merchant Payment Infrastructure

> **Status: SANDBOX.** Pembayaran QRIS Bank Mandiri (Livin' Usaha) **disimulasikan**. Belum ada koneksi ke API resmi Mandiri. Jangan klaim "live" sebelum integrasi resmi selesai (lihat bagian 10).

Platform payment gateway QRIS untuk UMKM, retail, dan toko online: website marketing, autentikasi aman, dashboard merchant, panel admin, invoice engine dengan nominal unik, state machine pembayaran, ledger double-entry, hold 6 jam & penarikan dana (sandbox), Developer API REST + webhook, serta paket deployment Docker untuk VPS Ubuntu 24.04.

Dokumen detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) · [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) · [`memory/PRD.md`](memory/PRD.md)

---

## 1. Stack

| Lapisan | Teknologi |
|---|---|
| Frontend | React 19 (CRA + craco), React Router, Tailwind, shadcn/ui, TanStack Query |
| Backend | FastAPI (modular monolith), Python 3.11, OpenAPI di `/api/docs` |
| Database | MongoDB (transaksi multi-dokumen aktif bila replica set — di VPS `rs0`) |
| Worker | Loop in-process di `server.py` (expiry invoice, pelepasan nominal unik, retry webhook, rilis hold, retry penarikan) |
| Email | Emergent managed Resend (hanya berfungsi di hosting Emergent; ganti adapter untuk self-host) |
| Infra | Docker, Docker Compose, Nginx, Cloudflare (Full strict) |

> Prompt awal meminta Next.js/NestJS/PostgreSQL. Pemilik **menyetujui** React + FastAPI + MongoDB dengan arsitektur modular, state machine, dan ledger tetap dipertahankan. **Jangan migrasi stack.**

## 2. Struktur repository

```
backend/
  server.py            entrypoint FastAPI, middleware (request-id, CSRF origin), seed admin, worker loop
  core/                config, db (indeks), security (Argon2id/JWT/Fernet), deps (RBAC), audit, email, mfa, settings_store
  modules/
    auth.py            register, login, 2FA TOTP, sesi, verifikasi email, reset password
    merchant.py        overview, profil, tim (RBAC), QRIS statis, event, audit, support
    invoices.py        invoice merchant + simulator pembayaran sandbox
    payments.py        ENGINE: alokasi nominal unik, state machine, ingest event, rekonsiliasi, expiry
    providers.py       MandiriSandboxProvider (aktif), MandiriStaticQrisConfiguration, MandiriOfficialProviderAdapter (NONAKTIF)
    ledger.py          ledger double-entry (journal + lines, wajib seimbang)
    finance.py         saldo, settlement, hold 6 jam, rekening bank, penarikan dana (sandbox)
    webhooks.py        HMAC-SHA256, retry backoff, dead-letter, proteksi SSRF
    developers.py      API key (hash, scope, rotate/revoke), endpoint webhook, Public API /api/v1
    admin.py           panel admin (MFA wajib), rekonsiliasi dengan step-up TOTP
    public.py          health, paket harga, halaman bayar publik, form kontak
  tests/               pytest (API, ledger/finance, rotasi 2FA)
frontend/src/
  layouts/             MarketingLayout, AuthLayout, MerchantLayout, AdminLayout, AppShell
  pages/marketing/     Home, Pages (fitur, harga, tentang, developer, docs, kontak, keamanan, syarat, privasi, status)
  pages/auth/          login, register, forgot/reset password, verify email, 2FA
  pages/merchant/      Overview, Invoices, InvoiceDetail, PaymentsQris, Finance, Developers, Account
  pages/admin/         Admin, AdminFinance
  pages/Pay.jsx        halaman pembayaran publik /pay/:invoiceId
  components/marketing HeroSlider (4 foto auto-rotate), Features, dll.
infra/
  compose.yaml         mongo (replica set rs0) + backend + frontend + nginx
  nginx/qrisgg.conf    reverse proxy qrisgg.com & api.qrisgg.com
  scripts/             deploy.sh, backup.sh, restore.sh
  env.backend.example  template environment produksi
docs/                  ARCHITECTURE, DEPLOYMENT, ENVIRONMENT
memory/PRD.md          kebutuhan produk & backlog
test_reports/          laporan pengujian iterasi
```

## 3. Peran pengguna

| Peran | Akses |
|---|---|
| SUPER_ADMIN / ADMIN platform | `/admin/*` — **2FA wajib**. Approve merchant, rekonsiliasi, review QRIS, settlement, penarikan, audit, pengaturan sistem |
| Merchant OWNER | `/dashboard/*` penuh, kelola tim |
| Merchant ADMIN / DEVELOPER / VIEWER | Dibatasi RBAC di backend (`require_perm`) |
| Pembeli (publik) | `/pay/:invoiceId` tanpa login |

## 4. Alur utama (end-to-end)

### 4.1 Onboarding merchant
1. Merchant daftar di `/register` → email verifikasi dikirim → klik tautan `/verify-email`.
2. Login `/login` (opsional aktifkan 2FA di Akun → Keamanan).
3. Admin meng-**approve** merchant di `/admin` (Merchants).
4. Merchant mendaftarkan **QRIS statis Mandiri** (payload divalidasi EMVCo TLV + CRC16) → admin **approve** QRIS.

### 4.2 Alur invoice & pembayaran
```
Merchant/API buat invoice (amount)
  → engine alokasikan kode unik → payable_amount = amount + kode (unik per akun QRIS)
  → status CREATED → PENDING, tampil di /pay/:invoiceId (QR + nominal persis)
  → pembeli bayar → event pembayaran masuk (sandbox: tombol simulator / admin ingest)
  → pencocokan nominal: EXACT_MATCH | UNDERPAYMENT | OVERPAYMENT | AMBIGUOUS | LATE | DUPLICATE | NO_ACTIVE_INVOICE
  → PAYMENT_DETECTED → AWAITING_VERIFICATION
  → ADMIN rekonsiliasi + kode TOTP step-up → PAID_VERIFIED  (satu-satunya jalan ke PAID_VERIFIED)
  → ledger journal dibuat + saldo masuk HOLD 6 jam → webhook `invoice.paid` dikirim
```
State machine lengkap:
```
CREATED → PENDING → PAYMENT_DETECTED → AWAITING_VERIFICATION → PAID_VERIFIED → (REFUNDED)
             ├→ EXPIRED ──→ REVIEW_REQUIRED → PAID_VERIFIED | FAILED | CANCELLED
             └→ CANCELLED                     AWAITING_VERIFICATION → FAILED
```
- Transisi di luar tabel `payments.py::TRANSITIONS` ditolak HTTP 409; update bersyarat mencegah race.
- Simulator / Android / ingest **tidak bisa** langsung PAID_VERIFIED.
- Nominal unik dilepas setelah cooldown (default 60 menit) agar pembayaran terlambat tetap bisa dicocokkan.

### 4.3 Ledger, hold, settlement & penarikan (sandbox)
1. PAID_VERIFIED → journal double-entry (DEBIT/CREDIT seimbang) → saldo **pending/hold**.
2. Setelah `hold_hours` (default 6, diatur admin) worker memindahkan ke saldo **tersedia**.
3. Merchant tambah **rekening bank** → admin verifikasi rekening.
4. Merchant ajukan **penarikan** (atau aktifkan auto-withdraw) → saldo dikunci via journal.
5. Admin approve/reject/proses → status penarikan diperbarui; gagal = retry terjadwal (`next_attempt_at`), journal pembalik bila ditolak.
6. **Aturan:** saldo TIDAK PERNAH diubah langsung di database — selalu lewat `ledger_journals` + `ledger_lines`.

> Penarikan dana **tidak** mentransfer uang sungguhan (sandbox).

### 4.4 Developer API & webhook
1. Merchant buat **API key** di Dashboard → Developers (ditampilkan sekali, disimpan sebagai hash, punya scope, bisa rotate/revoke).
2. Daftarkan **endpoint webhook** (https saja, IP privat ditolak) → dapat secret HMAC.
3. Panggil API dengan `Authorization: Bearer <api_key>`, gunakan header `Idempotency-Key` saat membuat invoice.
4. Setiap webhook ditandatangani HMAC-SHA256; gagal → retry backoff → dead-letter setelah batas percobaan.

## 5. Ringkasan endpoint (prefix `/api`)

| Grup | Endpoint |
|---|---|
| Auth `/api/auth` | `POST register, login, logout, refresh, verify-email, resend-verification, forgot-password, reset-password, change-password, 2fa/setup, 2fa/enable, 2fa/verify, 2fa/disable` · `GET me, sessions` · `DELETE sessions/{sid}` |
| Merchant `/api/merchant` | `overview, profile, team, qris, payment-events, audit-logs, support, sessions` · invoices `GET/POST /invoices`, `GET /invoices/{id}`, `POST /invoices/{id}/cancel`, `POST /invoices/{id}/sandbox/simulate-payment` · finance `balance, settlements, bank-accounts, withdrawals, PUT withdrawals/auto` · developers `api-keys (+rotate), webhooks (+test, rotate-secret), webhook-deliveries` |
| Admin `/api/admin` | `overview, merchants (+approve/suspend), users, invoices (+verify/fail/review), payment-events (+ingest), reconciliation, qris-accounts/{id}/{action}, providers, plans, audit-logs, settings, support, ledger, settlements/{id}/{action}, withdrawals/{id}/{action}, bank-accounts/{id}/{action}` |
| Public API `/api/v1` (API key) | `POST/GET /invoices`, `GET /invoices/{id}`, `GET /webhook-deliveries`, `GET /balances`, `GET /settlements` · lainnya → 501 |
| Publik `/api` | `GET /health`, `GET /public/plans`, `GET /public/pay/{invoice_id}`, `POST /public/contact` |

Dokumentasi interaktif: `GET /api/docs` (Swagger).

## 6. Keamanan
Argon2id · JWT di cookie HttpOnly + sesi server (bisa dicabut) · TOTP 2FA (wajib untuk admin, step-up untuk verifikasi) · lockout per IP+email & per akun · cek Origin (CSRF) · RBAC di backend · isolasi tenant (`merchant_id`) · API key di-hash SHA-256 · secret webhook & TOTP dienkripsi Fernet · proteksi SSRF webhook · Idempotency-Key · dedupe event · audit log.

## 7. Menjalankan secara lokal (tanpa Docker)
```bash
# Backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../infra/env.backend.example .env   # isi MONGO_URL, DB_NAME, JWT_SECRET, ENCRYPTION_KEY, ADMIN_*, CORS_ORIGINS, APP_PUBLIC_URL
uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Frontend
cd frontend && yarn install
echo "REACT_APP_BACKEND_URL=http://localhost:8001" > .env
yarn start
```
Tes backend: `cd backend && pytest tests -q`.

Admin awal dibuat otomatis saat startup dari `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_TOTP_SECRET` (lihat `docs/ENVIRONMENT.md`). **Kredensial tidak ditulis di README ini.**

## 8. Deployment ke VPS (Ubuntu 24.04)
Ringkas — detail di [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md):
```bash
git clone <repo> /opt/qrisgg && cd /opt/qrisgg/infra
cp env.backend.example .env.backend && nano .env.backend   # isi semua secret
# simpan Cloudflare Origin Certificate di infra/certs/origin.pem & origin.key
chmod +x scripts/*.sh
PUBLIC_API_URL=https://api.qrisgg.com ./scripts/deploy.sh
curl -fsS https://api.qrisgg.com/api/health
```
DNS: `qrisgg.com`, `www`, `api` → IP VPS (Cloudflare proxied, SSL Full strict). Backup harian: `scripts/backup.sh`.

> Email: `core/email.py` memakai Emergent managed email yang **hanya bekerja di hosting Emergent**. Untuk VPS, ganti `send_email` dengan akun Resend/SMTP sendiri.

## 9. Status fitur

| Fase | Fitur | Status |
|---|---|---|
| 1–3 | Arsitektur, fondasi, website marketing (slider 4 foto, label DEMO dihapus) | ✅ Selesai |
| 4 | Auth (Argon2id, JWT, 2FA TOTP, verifikasi email, reset password) | ✅ Selesai — perbaikan rotasi/verifikasi 2FA perlu uji e2e ulang |
| 5–7 | Dashboard merchant & admin, Mandiri QRIS sandbox, event & rekonsiliasi | ✅ Selesai (sandbox) |
| 8 | Ledger double-entry, settlement, hold 6 jam, penarikan dana | ✅ Selesai (sandbox) — retry penarikan perlu uji e2e ulang |
| 9 | Developer platform: API key, /v1/invoices, webhook, balances | 🟡 Sebagian — rate limit per key, payment links, kebijakan retry/DLQ di UI belum lengkap |
| 10 | Aplikasi Android listener notifikasi Mandiri (Kotlin) | ⛔ Belum dimulai |
| 11.2 | Aktivasi fitur "Segera Hadir" (mis. Payment Links di `components/marketing/Features.jsx`) | 🟡 Sedang dikerjakan |
| 12 | Email produksi (verifikasi, reset, peringatan keamanan) | 🟡 Adapter perlu dirampungkan |
| 13 | Security hardening (rate limit global, review isolasi tenant, injeksi NoSQL, rotasi password admin setelah handoff). `memory/test_credentials.md` sudah di-`.gitignore` dan tidak ada di riwayat git | 🟡 Sebagian |
| 14–15 | Paket deployment & handoff GitHub | 🟡 Artefak siap, belum pernah dideploy ke VPS |
| 16 | Integrasi resmi Mandiri | ⛔ Terblokir (butuh dokumentasi, kredensial, otorisasi bank) |

## 10. Yang masih SIMULASI (MOCKED)
- **Pembayaran QRIS Mandiri** — QR sandbox bukan EMV live; event pembayaran berasal dari simulator / ingest admin.
- **Penarikan dana & settlement** — tidak ada transfer uang sungguhan.
- **Email** — hanya terkirim di hosting Emergent.
- Adapter resmi Mandiri (`MandiriOfficialProviderAdapter`) nonaktif; tidak ada endpoint bank yang dikarang.

## 11. Catatan untuk developer / agent berikutnya
- Respons ke pemilik dalam **Bahasa Indonesia**.
- Jangan ubah `MONGO_URL`, `DB_NAME`, `REACT_APP_BACKEND_URL` di lingkungan pratinjau.
- Semua route backend wajib berprefix `/api`.
- Uang = integer rupiah, tanpa float.
- Saldo hanya lewat ledger journal; journal harus seimbang.
- PAID_VERIFIED hanya via rekonsiliasi admin + TOTP.
- Hanya Bank Mandiri pada fase 1; jangan tambah provider lain tanpa persetujuan.
- Kredensial uji ada di `memory/test_credentials.md` (lokal, di-`.gitignore`, tidak ikut ke GitHub) — **jangan** salin ke README atau repo publik; disarankan repo GitHub **privat** dan rotasi password admin setelah handoff.
- Prioritas berikut: (1) uji e2e 2FA & retry penarikan, (2) Fase 11.2 "Segera Hadir", (3) Fase 12 email, (4) Fase 9 & 13, (5) Fase 10 Android.
