# COOCA-ID WhatsApp Gateway Microservice (Production Ready)

Microservice WhatsApp Gateway mandiri (standalone) berbasis **Node.js Express** dan **@whiskeysockets/baileys** (WebSocket langsung, tanpa browser Chromium/Puppeteer, sangat hemat memori).

Repository ini siap di-deploy langsung ke **[Render.com](https://render.com/)**, Docker, atau VPS.

---

## 🚀 Fitur Utama

- **Ultra Ringan**: Direct WebSocket Baileys (~60 MB – 120 MB RAM per sesi).
- **Multi-Tenant / Multi-Session**: Mendukung banyak akun nomor WhatsApp per bisnis.
- **Auto Reconnect**: Otomatis menyambungkan ulang jika koneksi internet terputus.
- **RESTful API Lengkap**:
  - `GET /health` (Health check untuk Render & Uptime monitoring)
  - `POST /api/sessions/start` (Inisialisasi sesi & generate QR Code)
  - `GET /api/sessions/:sessionId/qr` (Ambil QR Code base64)
  - `GET /api/sessions/:sessionId/status` (Cek status koneksi: CONNECTED / SCAN_QR / DISCONNECTED)
  - `POST /send-message` atau `POST /send` (Kirim pesan teks, gambar, dokumen, tombol)
  - `POST /api/sessions/:sessionId/disconnect` (Putuskan sesi)
- **Render Ready**: Sudah dilengkapi `render.yaml` Blueprint dan `Dockerfile`.

---

## 🛠️ Langkah 1: Upload Repository Ini ke GitHub Anda

Jalankan perintah berikut di terminal komputer Anda (di dalam folder ini):

```bash
# 1. Pastikan Anda berada di folder wa-server
cd wa-server

# 2. Tambahkan remote repository GitHub baru Anda
git remote add origin https://github.com/USERNAME-ANDA/cooca-wa-server.git

# 3. Rename branch ke main dan push
git branch -M main
git push -u origin main
```

---

## 🌐 Langkah 2: Deploy ke Render.com

### Opsi A: Menggunakan Render Blueprint (Paling Mudah)
1. Login ke akun **[Render.com](https://dashboard.render.com/)**.
2. Klik tombol **New +** di pojok kanan atas $\rightarrow$ Pilih **Blueprint**.
3. Hubungkan akun GitHub Anda dan pilih repository `cooca-wa-server`.
4. Render akan otomatis membaca file `render.yaml` dan mengonfigurasi seluruh setting.
5. Klik **Apply**.

---

### Opsi B: Menggunakan Web Service Manual di Render
1. Login ke **[Render.com Dashboard](https://dashboard.render.com/)**.
2. Klik tombol **New +** $\rightarrow$ Pilih **Web Service**.
3. Pilih repository GitHub `cooca-wa-server`.
4. Isi formulir konfigurasi:
   - **Name:** `cooca-wa-server` (atau nama pilihan Anda)
   - **Region:** `Singapore (Southeast Asia)` (Paling cepat untuk akses dari Indonesia)
   - **Runtime:** `Node`
   - **Build Command:** `npm install --omit=dev`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free` (atau `Starter` $7/bln jika ingin menggunakan Persistent Disk)
5. Masuk ke tab **Environment Variables**, tambahkan:
   - `NODE_ENV` = `production`
   - `WA_WORKER_TOKEN` = `buat_token_rahasia_anda_disini` *(contoh: `cooca_sec_wa_2026_xyz`)*
   - `LARAVEL_API_URL` = `https://app.cooca.id` *(domain web Laravel COOCA Anda)*
6. Di bagian **Advanced Settings**:
   - **Health Check Path:** `/health`
7. Klik **Create Web Service**.

Tunggu proses build selesai (~1–2 menit). Anda akan mendapatkan URL publik HTTPS dari Render, contoh:
👉 `https://cooca-wa-server.onrender.com`

---

## 🔗 Langkah 3: Hubungkan ke Backend Laravel COOCA

Buka file `.env` pada project Laravel COOCA Anda (di Hostinger / Local / Server):

```env
# Masukkan URL HTTPS dari Render.com (tanpa garis miring di akhir)
WA_SERVER_URL=https://cooca-wa-server.onrender.com

# Token rahasia yang sama persis dengan yang Anda isi di Render.com
WA_WORKER_TOKEN=buat_token_rahasia_anda_disini
```

Lakukan clear cache di Laravel:
```bash
php artisan config:clear
```

---

## 💡 Tips Penting untuk Render.com Free Tier

1. **Mencegah Service Tertidur (Sleep Mode):**
   Render Free Tier akan "tidur" setelah 15 menit jika tidak ada request masuk.
   - **Solusi Gratis:** Daftarkan URL Health Check Anda (`https://cooca-wa-server.onrender.com/health`) ke layanan monitor gratis seperti **[cron-job.org](https://cron-job.org/)** atau **[UptimeRobot.com](https://uptimerobot.com/)** dengan interval ping setiap **10 menit**. Dengan begitu, server WA Anda akan selalu aktif 24/7!
2. **Penyimpanan Sesi (Auth State):**
   - Di Free Tier Render, file system bersifat *ephemeral* (jika server restart/redeploy, Anda mungkin perlu scan ulang QR code).
   - Jika ingin sesi WhatsApp tersimpan permanen selamanya di Render tanpa pernah perlu scan ulang meskipun ada redeploy, gunakan paket **Starter ($7/bln)** dan tambahkan **Persistent Disk (1 GB, $0.25/bln)** dengan mount path `/var/data`, lalu tambahkan env `AUTH_DIR=/var/data/baileys_auth`.
