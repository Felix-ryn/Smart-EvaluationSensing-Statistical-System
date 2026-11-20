# Smart Parking System — Berbasis Area/Zone + Computer Vision

Sistem manajemen parkir pinggir jalan (smart street parking) untuk membantu pengelola parkir
mengelola transaksi, pembayaran cash/QRIS, kapasitas area, pendapatan, pajak/MOU, setoran jukir,
rekonsiliasi, serta monitoring kondisi parkir menggunakan Computer Vision (YOLOv8).

## Konsep Utama

Parkir berbasis **Area/Zone** dengan **kapasitas** (bukan mapping slot fisik per kendaraan).

Contoh: Area A kapasitas 50 motor, jika 35 transaksi aktif → tersedia 15.

Computer Vision membantu memperkirakan occupancy lapangan dan mendeteksi dugaan illegal parking
sebagai **early warning** (bukan vonis), tetap ada verifikasi admin/jukir.

## Arsitektur

```
frontend (React + Vite)  ──HTTP──▶  backend (Node.js + TS + Express + Prisma)  ──▶  PostgreSQL
                                          │
                                          └──▶ ai-service (FastAPI + YOLOv8, models/best.pt)
```

## Fitur

- Transaksi masuk/keluar + Transaction ID (`PARK-XXXXX`)
- Pembayaran Cash & QRIS (QRIS disimulasikan, QR → Transaction ID)
- Kapasitas area (available = capacity - transaksi aktif)
- Revenue (per area, per periode, cash vs QRIS)
- Pajak/MOU (configurable)
- Setoran jukir
- Rekonsiliasi (transaksi vs CV)
- Deteksi occupancy + illegal parking (3 class: space-empty, space-occupied, illegal-parking)
- Laporan pelanggaran + verifikasi (PENDING/VALID/REJECTED)
- Dashboard analytics

---

# Panduan Menjalankan Project (dari clone sampai jalan)

## Prasyarat (Prerequisites)

Pastikan sudah terinstall di mesin:

| Tool | Versi minimal | Cek instalasi |
|------|---------------|---------------|
| Node.js | 20.x | `node --version` |
| npm | 10.x | `npm --version` |
| Docker Desktop | terbaru (dengan Compose v2) | `docker --version` |
| Git | terbaru | `git --version` |

> **Penting:** pastikan Docker Desktop sedang **berjalan** (status "Running") sebelum langkah Docker.

---

## 1. Clone Repository

Buka PowerShell dan jalankan:

```powershell
git clone <url-repository-anda>
cd Smart-EvaluationSensing-Statistical-System
```

> Ganti `<url-repository-anda>` dengan URL repository Git Anda (mis. dari GitHub/GitLab).

---

## 2. Setup Environment Variables

Proyek membutuhkan dua file `.env`. Keduanya **tidak ikut ter-commit** (ada di `.gitignore`), jadi harus dibuat manual.

### 2.1 Backend `.env`

```powershell
Copy-Item backend\.env.example backend\.env
```

Lalu edit `backend\.env` (pakai editor apa pun) pastikan isinya:

```ini
DATABASE_URL="postgresql://sess:sess@localhost:5434/sess?schema=public"
JWT_SECRET="change-me-in-production"
PORT=4000
AI_SERVICE_URL="http://localhost:8000"
XENDIT_SECRET_KEY=""
XENDIT_CALLBACK_TOKEN=""
XENDIT_BASE_URL="https://api.xendit.co"
XENDIT_QRIS_CALLBACK_URL="https://your-public-domain.com/api/payments/webhooks/xendit/qris"
```

> `DATABASE_URL` harus menunjuk ke `localhost:5434` (port yang di-expose oleh container PostgreSQL).

### 2.2 Root `.env` (untuk AI service / Roboflow)

Buat file `.env` di root project (jika belum ada):

```powershell
New-Item -ItemType File -Path .env -Force
```

Isi dengan (opsional, hanya untuk fitur deteksi plat nomor via Roboflow):

```ini
ROBOFLOW_API_KEY=""
ROBOFLOW_MODEL_ID=""
```

> Jika kosong, aplikasi tetap bisa jalan; hanya fitur Roboflow yang nonaktif.

---

## 3. Jalankan Database + AI Service (Docker)

Dari root project, jalankan:

```powershell
docker compose up -d db ai
```

Tunggu sampai container sehat:

```powershell
docker compose ps
```

Pastikan `sess_db` berstatus **"Up (healthy)"** dan `sess_ai` **"Up"**.

> **Catatan:** model YOLOv8 (`models/best.pt`) sudah ter-commit di repository, jadi AI service bisa langsung jalan tanpa setup tambahan.

> **Jika database belum pernah di-migrate**, Anda mungkin perlu menunggu beberapa detik sampai PostgreSQL siap menerima koneksi.

---

## 4. Setup & Jalankan Backend

Buka **terminal baru**, lalu:

```powershell
cd backend
npm install
```

Terapkan migrasi schema database:

```powershell
npx prisma migrate dev
```

Generate Prisma Client (otomatis juga dipanggil oleh `migrate dev`, tapi aman untuk dijalankan ulang):

```powershell
npx prisma generate
```

Jalankan seeder (mengisi data master + sample transaksi):

```powershell
npm run db:seed
```

> **Seeder bersifat deterministik & idempoten** — dijalankan di mesin mana pun menghasilkan data yang **identik**, dan aman dijalankan berulang kali (data lama dihapus lalu diisi ulang).

Terakhir, jalankan backend:

```powershell
npm run dev
```

Backend berjalan di **http://localhost:4000**.

---

## 5. Setup & Jalankan Frontend

Buka **terminal baru lagi**, lalu:

```powershell
cd frontend
npm install
npm run dev
```

Frontend berjalan di **http://localhost:5173**.

> Vite sudah di-set untuk proxy `/api` dan `/uploads` ke `http://localhost:4000`, jadi tidak perlu konfigurasi tambahan.

---

## 6. Buka Aplikasi

Akses di browser: **http://localhost:5173**

Login dengan salah satu akun berikut (semua password: **`password123`**):

| Peran | Email | Password |
|-------|-------|----------|
| Admin | `admin@sess.local` | `password123` |
| Admin (extra) | `admin@pet.local` | `password123` |
| Customer | `user@sess.local` | `password123` |
| Jukir | `jukir.budi@sess.local` | `password123` |
| Jukir | `jukir.siti@sess.local` | `password123` |
| Jukir | `jukir.agus@sess.local` | `password123` |
| Jukir (lainnya) | `jukir.<nama>@sess.local` | `password123` |

> Ada 33 akun jukir dengan pola `jukir.<nama>@sess.local`, mis. `jukir.dewi`, `jukir.hendra`, dst.

---

## Struktur

- `backend/` — Express + Prisma + TypeScript (port 4000)
- `frontend/` — React + Vite (port 5173)
- `ai-service/` — FastAPI + YOLOv8 (POST /detect, port 8000)
- `models/best.pt` — model YOLOv8n
- `backend/prisma/seed.ts` — seeder deterministik (data master + sample)
- `backend/prisma/schema.prisma` — skema database
- `docs/` — dokumen acuan

---

## Perintah Ringkas (Cheatsheet)

```powershell
# Infrastruktur
docker compose up -d db ai

# Backend (terminal 1)
cd backend
npm install
npx prisma migrate dev
npm run db:seed
npm run dev

# Frontend (terminal 2)
cd frontend
npm install
npm run dev
```

---

## Troubleshooting

**Port database bentrok / tidak bisa konek?**
- Pastikan tidak ada PostgreSQL lokal lain yang memakai port `5434`.
- Cek container: `docker compose ps`.
- Lihat log DB: `docker compose logs -f db`.

**Seeder gagal karena tabel belum ada?**
- Pastikan sudah menjalankan `npx prisma migrate dev` sebelum `npm run db:seed`.

**Login gagal?**
- Pastikan sudah menjalankan `npm run db:seed` (hash password deterministik dibuat di seeder).
- Semua akun memakai password `password123`.

**AI service tidak jalan?**
- Pastikan `models/best.pt` ada di root `models/`.
- Cek log: `docker compose logs -f ai`.

**Ingin reset total database (hapus semua data)?**
```powershell
docker compose down -v
docker compose up -d db ai
cd backend
npx prisma migrate dev
npm run db:seed
```

> **Peringatan:** `docker compose down -v` menghapus volume database (semua data hilang). Lakukan hanya jika yakin, dan lakukan backup `pg_dump` terlebih dahulu bila diperlukan.
