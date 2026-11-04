# Qrisgg — Deployment Mandiri ke VPS & Ekspor GitHub

> Platform Emergent **tidak memiliki akses** ke VPS 162.243.27.9. Aplikasi ini belum pernah dideploy ke sana. Langkah di bawah dijalankan sendiri oleh pemilik.

## A. Ekspor source code via GitHub
1. Di Emergent, klik tombol **Save to GitHub** / **Push to GitHub** pada chat, hubungkan akun GitHub, pilih repo (disarankan privat) dan branch.
2. Di VPS: `sudo mkdir -p /opt/qrisgg && sudo chown $USER /opt/qrisgg && git clone git@github.com:<akun>/<repo>.git /opt/qrisgg`.
3. Jangan pernah commit `infra/.env.backend`, `backend/.env` berisi secret produksi, atau `infra/certs/*`.

## B. Persiapan VPS (Ubuntu 24.04, ~2 GB RAM)
```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git ufw
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw enable
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```
MongoDB tidak dipublikasikan ke host (hanya jaringan Docker `internal`). Jika build frontend kehabisan memori, build image di mesin lain/CI lalu `docker save | ssh vps docker load`.

## C. Cloudflare & TLS
- DNS: `A qrisgg.com → 162.243.27.9`, `A www → 162.243.27.9`, `A api → 162.243.27.9` (proxied).
- SSL/TLS mode **Full (strict)**; buat *Origin Certificate*, simpan sebagai `infra/certs/origin.pem` dan `infra/certs/origin.key` (chmod 600).
- Di `infra/nginx/qrisgg.conf` ganti `set_real_ip_from 0.0.0.0/0` dengan daftar IP Cloudflare resmi (https://www.cloudflare.com/ips/).

## D. Konfigurasi & jalankan
```bash
cd /opt/qrisgg/infra
cp env.backend.example .env.backend && nano .env.backend   # isi semua secret
chmod +x scripts/*.sh
PUBLIC_API_URL=https://api.qrisgg.com ./scripts/deploy.sh
```
Mongo berjalan sebagai replica set `rs0` satu node sehingga **transaksi multi-dokumen aktif** (cek `GET https://api.qrisgg.com/api/health` → `transactions_supported: true`).

Catatan email: modul `core/email.py` memakai Emergent managed email yang hanya berfungsi di hosting Emergent. Untuk self-host, ganti fungsi `send_email` dengan provider Anda (mis. akun Resend sendiri) — sampai itu dilakukan, email verifikasi/reset tidak akan terkirim dan statusnya tercatat `FAILED` di `email_logs`.

## E. Verifikasi sebelum menyatakan live
```bash
dig +short qrisgg.com api.qrisgg.com
curl -fsS https://api.qrisgg.com/api/health
curl -fsSI https://qrisgg.com | head -1
curl -fsS https://api.qrisgg.com/v1/invoices -H "Authorization: Bearer invalid"   # harus 401
```

## F. Backup, restore, rollback
- Backup: `./scripts/backup.sh` (cron harian: `0 2 * * * cd /opt/qrisgg/infra && ./scripts/backup.sh`).
- Uji restore (aman, ke DB `_restore_test`): `./scripts/restore.sh backups/<file>`.
- Rollback kode: `git -C /opt/qrisgg checkout $(cat .last_deploy_ok) && ./scripts/deploy.sh`. Data tidak dihapus (volume dipertahankan).

## G. Monitoring
- Healthcheck Docker untuk backend & frontend; `docker compose ps` / `docker compose logs -f backend`.
- Uptime eksternal (mis. UptimeRobot) ke `https://api.qrisgg.com/api/health`.
- Admin panel menampilkan webhook dead-letter, event tidak cocok, antrian review.
