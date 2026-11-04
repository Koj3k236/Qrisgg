# Environment Variables

## Backend (`backend/.env` di pratinjau, `infra/.env.backend` di VPS)
| Variabel | Wajib | Keterangan |
|---|---|---|
| `MONGO_URL` | ya | URI MongoDB. Produksi: `mongodb://mongo:27017/?replicaSet=rs0` (transaksi aktif) |
| `DB_NAME` | ya | Nama database |
| `CORS_ORIGINS` | ya | Origin frontend dipisah koma; juga dipakai cek CSRF Origin |
| `APP_PUBLIC_URL` | ya | URL frontend untuk tautan email (verifikasi/reset) |
| `JWT_SECRET` | ya | 64 hex acak untuk tanda tangan JWT |
| `ENCRYPTION_KEY` | ya | Kunci Fernet (32 byte urlsafe base64) untuk secret webhook & TOTP |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | ya | SUPER_ADMIN awal, dibuat sekali saat startup (tidak pernah di-reset otomatis) |
| `ADMIN_TOTP_SECRET` | ya | Secret TOTP base32 SUPER_ADMIN awal (2FA wajib) |
| `PLATFORM_MODE` | tidak | `SANDBOX` (default). Mode LIVE belum didukung |
| `EMERGENT_EMAIL_KEY` | ya* | Kunci email terkelola Emergent (*hanya di hosting Emergent) |
| `EMAIL_FROM_NAME` | ya | Nama pengirim email: `Qrisgg` |
| `EMAIL_REPLY_TO` | tidak | Inbox balasan milik pemilik |

## Frontend (`frontend/.env`, build arg di Docker)
| Variabel | Keterangan |
|---|---|
| `REACT_APP_BACKEND_URL` | Origin backend. Pratinjau: URL preview; produksi: `https://api.qrisgg.com` |

## Pengaturan sistem (database, panel admin → Pengaturan Sistem, hanya SUPER_ADMIN)
`unique_code_min` (1), `unique_code_max` (999), `reuse_cooldown_minutes` (60), `default_expiry_seconds` (900), `min_amount` (1000), `max_amount` (100.000.000), `hold_hours` (6, belum dipakai — ledger NOT IMPLEMENTED).
