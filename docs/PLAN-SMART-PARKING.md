# PLAN — Smart Parking System (Berbasis Area/Zone + Computer Vision)

> Dokumen acuan utama (single source of truth) untuk pengembangan project **Smart Parking System**.
> Bahasa: campuran Bahasa Indonesia + istilah teknis Inggris.

> **STACK AKTUAL (penting):** Implementasi memakai **Node.js + TypeScript (Express + Prisma + PostgreSQL/PostGIS)**
> di `backend/`, frontend **React + Vite** di `frontend/`, dan pipeline CV **Python + FastAPI + YOLOv8**
> di `ai-service/`. Ikuti kode nyata sebagai acuan, bukan rekomendasi historis FastAPI/Streamlit.

---

## 1. Ringkasan & Latar Belakang

Sistem **Smart Street Parking** membantu pengelola parkir pinggir jalan mengelola operasional harian,
bukan sekadar memetakan kendaraan ke slot fisik. Konsep utamanya adalah **PARKING AREA/ZONE**
dengan **kapasitas** yang ditentukan admin berdasarkan kondisi lapangan.

### 1.1 Permasalahan
1. Pengelola kesulitan memantau kapasitas dan okupansi area parkir secara real-time.
2. Transaksi masuk/keluar, pembayaran cash & QRIS, dan pendapatan belum terintegrasi.
3. Belum ada mekanisme rekonsiliasi antara data transaksi dengan kondisi lapangan.
4. Deteksi dugaan illegal parking masih manual (foto/CCTV) tanpa bantuan AI.

### 1.2 Tujuan
1. Mengelola transaksi kendaraan, pembayaran cash/QRIS, kapasitas area, dan pendapatan.
2. Menghitung pajak/pengelola (MOU) dan setoran jukir secara configurable.
3. Merekonfigurasi data transaksi vs hasil Computer Vision untuk mendeteksi ketidaksesuaian.
4. Membantu deteksi illegal parking sebagai **early warning** (bukan vonis), tetap ada verifikasi admin/jukir.

---

## 2. Konsep Utama: Area/Zone, Bukan Slot Fisik

Sistem **tidak** memetakan kendaraan ke slot fisik satu per satu (A01, A02, dst).

Contoh:
- Area A kapasitas 50 motor.
- Jika ada 35 transaksi aktif → tersedia = 50 - 35 = 15.

Kapasitas ditentukan admin. Computer Vision membantu memperkirakan occupancy lapangan.

---

## 3. Arsitektur Sistem

```
                        +-----------------------------+
                        |   Frontend (React + Vite)   |
                        |   - Dashboard admin         |
                        |   - Area, Transaksi, Jukir  |
                        |   - MOU, Rekonsiliasi, CV   |
                        |   - Lapor pelanggaran       |
                        +--------------+--------------+
                                       | HTTP (REST)
                                       v
+-----------------------------+   +-----------------------------+
|      Backend (Node+TS)      |   |   AI Service (FastAPI)      |
|   Express + Prisma          |<->|   YOLOv8 (models/best.pt)   |
|   - auth, CRUD, bisnis      |   |   POST /detect (foto/video) |
|   - kapasitas, MOU, jukir   |   +--------------+--------------+
|   - rekonsiliasi            |                  | deteksi (3 class)
+--------------+--------------+                  v
               |                        (space-empty, space-occupied,
               v                         illegal-parking)
        +-------------+
        |  PostgreSQL |  (PostGIS opsional; tidak dipakai untuk polygon slot)
        +-------------+
```

### 3.1 Alur Data End-to-End
1. Jukir/pengguna mencatat kendaraan masuk → transaksi aktif (`PARK-XXXXX`).
2. Saat keluar → checkout → hitung tarif → bayar (CASH/QRIS).
3. Admin/jukir unggah foto area → AI mendeteksi occupancy → simpan `CvDetection`.
4. Sistem membandingkan transaksi aktif vs CV detected → selisih = early warning.
5. Laporan illegal parking → AI deteksi → verifikasi admin (PENDING/VALID/REJECTED).

---

## 4. Skema Database (ERD)

```
user (role: admin/user)
  |
  | 1..N
  v
parking_area ----< jukir
   |     |
   |     | 1..N
   |     v
   |   transaction (PARK-XXXXX)
   |     |
   |     +---- payment method (CASH / QRIS)
   |
   | 1..N
   v
cv_detection (hasil CV per area)

violation ----< area (laporan illegal parking)
mou_rule (pajak/pengelola, configurable)
```

### 4.1 Daftar Tabel

| Tabel            | Deskripsi                                                        |
|------------------|------------------------------------------------------------------|
| `User`           | Akun + role (`ADMIN`, `USER`).                                   |
| `ParkingArea`    | Area parkir + kapasitas + jenis kendaraan + lokasi.              |
| `Jukir`          | Petugas parkir + area kerja + status.                            |
| `Transaction`    | Transaksi masuk/keluar + tarif + metode bayar + kode `PARK-XXXXX`. |
| `CvDetection`    | Hasil deteksi CV per area (empty/occupied/illegal count).        |
| `Violation`      | Laporan illegal parking + bukti foto + source + status verifikasi. |
| `MouRule`        | Aturan pajak/pengelola (%) + periode berlaku.                    |

---

## 5. Fitur Bisnis (Fokus Pak Edi)

- **Transaksi**: masuk, keluar, Transaction ID (`PARK-00125`), status (ACTIVE/COMPLETED).
- **Pembayaran**: CASH & QRIS. QR → Transaction ID → data transaksi. QRIS disimulasikan.
- **Kapasitas Area**: `available = capacity - transaksi aktif`.
- **Revenue**: total, per area, per periode, cash vs QRIS.
- **Pajak/MOU**: `taxPercent` configurable.
- **Setoran Jukir**: `kewajiban = taxPercent% x revenue`; `setoran dari cash = kewajiban - QRIS tercatat`.
- **Rekonsiliasi**: bandingkan transaksi vs CV vs setoran → tampilkan selisih.

---

## 6. Computer Vision (Fokus Bu Reno)

- Model: **YOLOv8n**, 3 class: `0 = space-empty`, `1 = space-occupied`, `2 = illegal-parking`.
- Model terbaik: `models/best.pt` (~5.92 MB).
- Hasil validasi: mAP50 = 0.874 (empty 0.991, occupied 0.988, illegal 0.642).

**Alur illegal parking:** Foto/CCTV → YOLO → deteksi illegal-parking → alert → verifikasi admin/jukir
→ status PENDING/VALID/REJECTED.

> AI hanya **deteksi/early warning/assistance**, bukan vonis. Admin/jukir tetap verifikasi.

---

## 7. Rencana API Endpoint

| Method | Endpoint                              | Deskripsi                                  |
|--------|---------------------------------------|--------------------------------------------|
| POST   | `/api/auth/login` / `/register`       | Auth JWT                                   |
| GET    | `/api/areas` / POST / PATCH `/:id`    | List/buat/ubah area + kapasitas            |
| POST   | `/api/transactions`                   | Kendaraan masuk (buat transaksi)           |
| GET    | `/api/transactions/:code`             | Cari via Transaction ID (QR)               |
| POST   | `/api/transactions/:id/checkout`      | Kendaraan keluar + hitung tarif            |
| POST   | `/api/transactions/:id/pay`           | Bayar (CASH / QRIS)                        |
| GET/POST/PATCH | `/api/jukir`                   | Kelola jukir                               |
| GET/POST/PATCH | `/api/mou`                     | Kelola aturan MOU/pajak                    |
| GET    | `/api/reports/summary`                | Ringkasan revenue                         |
| GET    | `/api/reports/revenue`                | Revenue harian cash vs QRIS               |
| GET    | `/api/reports/jukir-settlement`       | Perhitungan setoran jukir                 |
| GET    | `/api/reports/reconciliation`         | Transaksi vs CV (selisih)                 |
| POST   | `/api/detections/scan`                | Scan area (foto/video) → CvDetection      |
| POST   | `/api/violations`                     | Lapor pelanggaran + deteksi               |
| PATCH  | `/api/violations/:id/status`          | Verifikasi admin (VALID/REJECTED)         |

---

## 8. Struktur Repo

```
smart-parking/
  backend/            # Express + Prisma + TS
    prisma/           # schema, migration, seed
    src/
      routes/         # auth, areas, transactions, jukir, mou, reports, detections, violations
      lib/            # fee, business (kapasitas/setoran/rekonsiliasi), ai
  frontend/           # React + Vite
    src/pages/admin/  # Dashboard, Areas, Transactions, Jukir, Mou, Reconciliation, Reports, Violations, AreaScan
  ai-service/         # FastAPI + YOLOv8 (POST /detect)
  models/best.pt      # model YOLOv8n
  docs/PLAN-SMART-PARKING.md
  docker-compose.yml  # db (postgis) + ai service
```

---

## 9. Next Steps

1. Migration DB (schema area/zone).
2. Seed data area + jukir + MOU + transaksi.
3. Implementasi endpoint bisnis (transaksi, setoran, rekonsiliasi).
4. Integrasi CV scan area + rekonsiliasi.
5. Dashboard analytics + laporan pelanggaran.
6. Testing end-to-end.

---

*Dokumen ini dapat diperbarui seiring perkembangan project.*
