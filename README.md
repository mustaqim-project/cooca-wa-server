# 📱 COOCA WhatsApp Gateway Microservice (Baileys WebSocket)

Microservice WhatsApp Gateway mandiri (standalone) berbasis **Node.js 20 Express** dan **[@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys)**. 

Gateway ini menggunakan koneksi **Direct WebSocket murni** langsung ke server WhatsApp — **TANPA** browser Chromium/Puppeteer, sehingga sangat hemat memori (hanya ~60 MB – 120 MB RAM per sesi aktif) dan dapat berjalan 24/7 di VPS spesifikasi rendah, GitHub Codespaces, maupun Render.com.

---

## 📑 Daftar Isi
1. [Fitur Utama](#-fitur-utama)
2. [Arsitektur Sistem](#-arsitektur-sistem)
3. [Panduan Setup — Pilih Salah Satu](#-panduan-setup)
   - [Opsi 1: GitHub Codespaces (Cloud Browser)](#opsi-1-github-codespaces-paling-mudah--gratis)
   - [Opsi 2: VPS Linux Ubuntu / Debian (DigitalOcean, Linode, Azure, GCP)](#opsi-2-vps-linux-ubuntudebian-digitalocean-azure-gcp-aws)
   - [Opsi 3: Render.com (Cloud Web Service)](#opsi-3-rendercom-cloud-web-service)
   - [Opsi 4: Localhost / Development (Windows Laragon / Mac)](#opsi-4-localhost--development-windows--mac)
4. [Konfigurasi Environment (.env)](#-konfigurasi-environment-variables-env)
5. [Menghubungkan ke Backend Laravel COOCA (Hostinger)](#-menghubungkan-ke-backend-laravel-cooca-hostinger)
6. [Dokumentasi API Endpoint](#-dokumentasi-api-endpoint)
7. [Troubleshooting & Maintenance](#-troubleshooting--maintenance)

---

## 🚀 Fitur Utama

- **Ultra Ringan & Hemat Biaya**: Berjalan stabil di server dengan RAM 512 MB – 1 GB.
- **Multi-Tenant / Multi-Session**: Setiap bisnis/outlet memiliki nomor WhatsApp dan sesi independen (`biz_xxxxxxxx`).
- **Sesi Admin Khusus**: Tersedia session `admin_platform` untuk pesan sistem / OTP / billing.
- **Keamanan Berlapis (Token-Protected)**: Setiap request diverifikasi dengan `WA_WORKER_TOKEN`.
- **Auto Reconnect & Keep-Alive**: Otomatis menyambung ulang jika internet terputus sesaat.
- **Dukungan Media Lengkap**: Mengirim teks, gambar, invoice PDF, tombol interaktif, dan vCard kontak.
- **Incoming Webhook**: Meneruskan pesan masuk dari pelanggan langsung ke API Laravel secara real-time.

---

## 🏛️ Arsitektur Sistem

```text
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND LARAVEL (HOSTINGER)                 │
│   Domain: https://app.cooca.id                                  │
│   Database: MySQL                                               │
│   Tugas: POS, Kasir, CRM, Invoice, Blast Scheduler              │
└────────────────────────────────┬────────────────────────────────┘
                                 │
              1. Outbound API Call (Bearer Token Auth)
              2. Inbound Webhook (/api/wa/webhook)
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│               COOCA WHATSAPP GATEWAY (MICROSERVICE)             │
│   Host: GitHub Codespaces / VPS Linux / Render.com              │
│   Runtime: Node.js 20 + Express + Baileys WebSocket             │
│   Port: 3000 (HTTPS via Reverse Proxy / Codespaces Forward)     │
└────────────────────────────────┬────────────────────────────────┘
                                 │
              Koneksi WebSocket Terenkripsi End-to-End
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SERVERS WHATSAPP (META)                      │
│   Customer & Admin WhatsApp Numbers                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Panduan Setup

Pilih salah satu metode deployment di bawah sesuai kebutuhan Anda:

---

### Opsi 1: GitHub Codespaces (Paling Mudah & Gratis)

GitHub Codespaces menyediakan virtual machine gratis (2 vCPU, 4 GB RAM, 32 GB Storage) yang dapat diakses langsung dari browser.

1. Buka repository Anda di GitHub:
   👉 **`https://github.com/USERNAME-ANDA/cooca-wa-server`**
2. Klik tombol hijau **`<> Code`** $\rightarrow$ Pilih tab **`Codespaces`** $\rightarrow$ Klik **`Create codespace on main`**.
3. Tunggu proses loading VS Code di browser selesai. Dependensi akan terinstal secara otomatis.
4. Di terminal Codespaces, buat file `.env`:
   ```bash
   cp .env.example .env
   ```
5. Edit file `.env` dan atur token rahasia Anda:
   ```env
   PORT=3000
   WA_WORKER_TOKEN=cooca_secret_worker_token_2026
   LARAVEL_API_URL=https://app.cooca.id
   ```
6. Jalankan server:
   ```bash
   npm start
   ```
7. **Aktifkan Akses Publik Port 3000:**
   - Pada panel bawah, klik tab **`Ports`**.
   - Cari baris port **`3000`**.
   - Klik kanan pada kolom **Port Visibility** $\rightarrow$ Pilih **`Port Visibility`** $\rightarrow$ Ubah ke **`Public`**.
   - Salin URL HTTPS yang ada di kolom **Forwarded Address**, contoh:
     👉 `https://username-fuzzy-app-3000.app.github.dev`
8. Masukkan URL tersebut ke `.env` Laravel Hostinger Anda sebagai `WA_SERVER_URL`.

---

### Opsi 2: VPS Linux Ubuntu/Debian (DigitalOcean, Azure, GCP, AWS)

Metode terbaik untuk production jangka panjang 24/7.

1. Hubungkan terminal Anda ke VPS via SSH:
   ```bash
   ssh root@IP_VPS_ANDA
   ```
2. Clone repository ini ke VPS:
   ```bash
   git clone https://github.com/USERNAME-ANDA/cooca-wa-server.git ~/cooca-wa
   cd ~/cooca-wa
   ```
3. Jalankan script instalasi otomatis 1-klik:
   ```bash
   chmod +x setup-vps.sh
   ./setup-vps.sh
   ```
   *Script ini otomatis menginstal Node.js 20, PM2, swap memory 2 GB (anti crash), konfigurasi systemd auto-restart, dan menjalankan server di background.*
4. Edit konfigurasi `.env`:
   ```bash
   nano .env
   ```
   Isi dengan token dan URL Laravel Anda:
   ```env
   PORT=3000
   WA_WORKER_TOKEN=cooca_secret_worker_token_2026
   LARAVEL_API_URL=https://app.cooca.id
   ```
   Simpan dengan `Ctrl + O`, `Enter`, lalu `Ctrl + X`.
5. Restart service via PM2:
   ```bash
   pm2 restart cooca-wa-server
   ```
6. Buka port 3000 di firewall VPS:
   ```bash
   sudo ufw allow 3000/tcp
   ```
7. URL WhatsApp Server Anda adalah:
   👉 `http://IP_VPS_ANDA:3000`

---

### Opsi 3: Render.com (Cloud Web Service)

1. Buka dashboard [Render.com](https://dashboard.render.com/) $\rightarrow$ Klik **New +** $\rightarrow$ **Web Service**.
2. Hubungkan repository GitHub `cooca-wa-server`.
3. Konfigurasi:
   - **Name:** `cooca-wa-server`
   - **Region:** `Oregon (US West)` *(Paket Free)* atau `Singapore` *(Paket Berbayar)*
   - **Runtime:** `Node`
   - **Build Command:** `npm install --omit=dev`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free ($0/month)`
4. Pada tab **Environment Variables**, tambahkan:
   - `NODE_ENV` = `production`
   - `WA_WORKER_TOKEN` = `cooca_secret_worker_token_2026`
   - `LARAVEL_API_URL` = `https://app.cooca.id`
5. Pada **Advanced** $\rightarrow$ Isi **Health Check Path:** `/health`.
6. Klik **Create Web Service**. URL Anda akan menjadi:
   👉 `https://cooca-wa-server.onrender.com`
7. *(Tips Free Tier)*: Pasang ping cron gratis di [cron-job.org](https://cron-job.org/) ke `https://cooca-wa-server.onrender.com/health` setiap 10 menit agar server tidak sleep.

---

### Opsi 4: Localhost / Development (Windows / Mac)

1. Pastikan Anda telah menginstal **Node.js 18+** di komputer Anda.
2. Masuk ke folder `wa-server`:
   ```bash
   cd wa-server
   npm install
   ```
3. Salin file contoh environment:
   ```bash
   cp .env.example .env
   ```
4. Jalankan server:
   - **Windows:** Cukup double-click file `start-wa.bat` di root project, ATAU ketik:
     ```bash
     npm start
     ```
5. Server akan aktif di `http://127.0.0.1:3000`.

---

## ⚙️ Konfigurasi Environment Variables (`.env`)

File `.env` di dalam folder `wa-server` mendukung opsi berikut:

| Variabel | Default | Keterangan |
| :--- | :--- | :--- |
| `PORT` / `WA_SERVER_PORT` | `3000` | Port tempat HTTP API Express mendengarkan request. |
| `WA_WORKER_TOKEN` | `secret-worker-token` | Token autentikasi wajib. Harus sama persis dengan `WA_WORKER_TOKEN` di `.env` Laravel. |
| `LARAVEL_API_URL` | `http://127.0.0.1:8000` | URL root web Laravel COOCA tempat webhook dikirimkan. |
| `AUTH_DIR` | `.baileys_auth` | Direktori tempat token sesi WhatsApp disimpan di disk server. |

---

## 🔗 Menghubungkan ke Backend Laravel COOCA (Hostinger)

Buka file `.env` pada project Laravel COOCA Anda di Hostinger:

```env
# URL WhatsApp Server (pilih sesuai opsi deploy Anda):
# Jika Codespaces : https://username-app-3000.app.github.dev
# Jika VPS Linux  : http://IP_VPS_ANDA:3000
# Jika Render     : https://cooca-wa-server.onrender.com
# Jika Local dev  : http://127.0.0.1:3000
WA_SERVER_URL=https://cooca-wa-server.onrender.com

# Wajib sama persis dengan WA_WORKER_TOKEN di server WA:
WA_WORKER_TOKEN=cooca_secret_worker_token_2026
```

Lalu jalankan perintah clear config di terminal Laravel:
```bash
php artisan config:clear
```

Sekarang buka menu **WhatsApp Gateway** di web dashboard COOCA Anda, klik **Hubungkan WhatsApp**, dan scan QR Code yang muncul di layar!

---

## 📡 Dokumentasi API Endpoint

Semua request (kecuali `/health` dan `/`) wajib menyertakan header:
`Authorization: Bearer <WA_WORKER_TOKEN>` atau `x-worker-token: <WA_WORKER_TOKEN>`.

### 1. Health Check
- **Endpoint:** `GET /health`
- **Response:**
  ```json
  {
    "status": "ok",
    "uptime": 3600,
    "timestamp": "2026-09-09T06:00:00.000Z",
    "activeSessions": 1
  }
  ```

### 2. Mulai Sesi / Generate QR Code
- **Endpoint:** `POST /api/sessions/start`
- **Body:**
  ```json
  {
    "sessionId": "biz_12345678",
    "webhookUrl": "https://app.cooca.id/api/wa/webhook"
  }
  ```

### 3. Ambil QR Code (Base64)
- **Endpoint:** `GET /api/sessions/:sessionId/qr`
- **Response:**
  ```json
  {
    "success": true,
    "status": "scan_qr",
    "qrDataUrl": "data:image/png;base64,iVBORw0KGgo..."
  }
  ```

### 4. Cek Status Koneksi Sesi
- **Endpoint:** `GET /api/sessions/:sessionId/status`
- **Response:**
  ```json
  {
    "success": true,
    "sessionId": "biz_12345678",
    "status": "connected",
    "user": { "id": "6281234567890:1@s.whatsapp.net", "name": "COOCA Store" }
  }
  ```

### 5. Kirim Pesan WhatsApp
- **Endpoint:** `POST /send-message` (atau `POST /send`)
- **Body (Teks Biasa):**
  ```json
  {
    "session": "biz_12345678",
    "target": "6281234567890",
    "message": "Halo! Struk transaksi belanja Anda di COOCA Store berhasil dicatat."
  }
  ```
- **Body (Dengan Gambar / Dokumen PDF):**
  ```json
  {
    "session": "biz_12345678",
    "target": "6281234567890",
    "message": "Faktur Penjualan #INV-001",
    "mediaUrl": "https://app.cooca.id/storage/invoices/INV-001.pdf",
    "filename": "Faktur-INV-001.pdf"
  }
  ```

### 6. Putuskan Sesi (Logout)
- **Endpoint:** `POST /api/sessions/:sessionId/disconnect` (atau `DELETE /api/sessions/:sessionId`)

---

## 🔍 Troubleshooting & Maintenance

### Cara Melihat Log Live & Pesan Masuk (VPS / PM2):
```bash
pm2 logs cooca-wa-server
```

### Cara Cek Status Service:
```bash
pm2 status
```

### Cara Restart Gateway:
```bash
pm2 restart cooca-wa-server
```

### Cara Reset Sesi yang Error / Scan Ulang dari Awal:
Jika sesi WhatsApp Anda mengalami konflik atau nomor handphone diganti:
1. Hapus folder auth sesi yang bermasalah di VPS:
   ```bash
   rm -rf .baileys_auth/session_biz_xxxxxxxx
   ```
2. Buka dashboard COOCA web, klik **Putuskan Sesi** lalu klik **Hubungkan Kembali** untuk memunculkan QR Code baru.

---

## 📄 Lisensi
Hak Cipta © 2026 **COOCA UMKM Core Engine**. Dikembangkan untuk integrasi SaaS POS, CRM, dan Notifikasi Otomatis.
