# PLAN — Smart Parking System (Deteksi Pelanggaran Marka Berbasis Computer Vision)

> Dokumen acuan utama (single source of truth) untuk pengembangan project **Smart Parking**.
> Bahasa: campuran Bahasa Indonesia + istilah teknis Inggris.

---

## 1. Ringkasan & Latar Belakang

### 1.1 Permasalahan
1. **Pengelolaan parkir kurang efisien**
   Pengelola masih mengandalkan pengawasan manual untuk memantau kondisi slot dan kepatuhan kendaraan di area parkir.

2. **Pelanggaran marka**
   Kendaraan dapat parkir melewati marka, menggunakan lebih dari satu slot, atau tidak sesuai dengan posisi parkir yang ditentukan.

3. **Minimnya data parkir**
   Informasi seperti penggunaan slot, durasi parkir, pelanggaran, dan denda belum terintegrasi sehingga sulit digunakan untuk evaluasi dan pengambilan keputusan.

### 1.2 Tujuan
1. **Meningkatkan Efisiensi Pengelolaan Parkir**
   Mengembangkan sistem yang membantu pengelola memantau kondisi dan penggunaan slot parkir melalui pemetaan area parkir dan pencatatan transaksi secara terstruktur.

2. **Mendeteksi dan Menangani Pelanggaran Parkir**
   Memanfaatkan Computer Vision untuk mendeteksi kendaraan dan memverifikasi pelanggaran marka berdasarkan foto yang diunggah melalui perangkat mobile, kemudian menyimpan bukti, mencatat jenis pelanggaran, dan menentukan denda sesuai aturan yang berlaku.

3. **Menghasilkan Analisis Parkir Berbasis Data**
   Mengolah data transaksi dan hasil deteksi menjadi informasi seperti tingkat okupansi, tingkat kepatuhan, jenis dan lokasi pelanggaran, durasi parkir, serta pendapatan dan denda untuk mendukung evaluasi dan pengambilan keputusan pengelola.

### 1.3 Lingkup Saat Ini (Prototype/Demo)
- Fokus utama: **proof-of-concept** end-to-end, bukan produksi penuh.
- Roadmap tetap disusun hingga tahap produksi agar pengembangan bertahap dan terukur.

---

## 2. Arsitektur Sistem

```
                       +-----------------------------+
                       |   Mobile App (upload foto)  |
                       |   (React Native / Web)      |
                       +--------------+--------------+
                                      |  HTTP multipart (foto + metadata slot)
                                      v
+-----------------------------+   +-----------------------------+
|      Backend API            |   |   Computer Vision Pipeline   |
|   (FastAPI + SQLAlchemy)    |<->|   (YOLOv8/v11 + OpenCV)      |
|                             |   |   - object detection         |
|  - auth                     |   |   - slot mapping             |
|  - CRUD area/slot           |   |   - violation rule engine    |
|  - transaction              |   +--------------+--------------+
|  - violation & fine         |                  | hasil deteksi
|  - analytics                |                  v
+--------------+--------------+         +-------------------+
               |                         |  Database         |
               v                         |  (PostgreSQL +    |
        +-------------+                  |   PostGIS)        |
        |  Web Dashboard (React + Vite)  +-------------------+
        |  - peta slot                   |
        |  - okupansi                    |
        |  - pelanggaran & denda         |
        |  - laporan analitik            |
        +--------------------------------+
```

### 2.1 Alur Data End-to-End
1. Petugas/pengguna memfoto kendaraan di slot parkir melalui **mobile app**.
2. Foto + metadata (ID slot / ID area, timestamp) dikirim ke **backend (FastAPI)**.
3. Backend meneruskan foto ke **CV pipeline**:
   - `object detection` (kendaraan, slot, marka, zona terlarang).
   - `rule engine` mengevaluasi jenis pelanggaran dari bounding box/polygon.
4. Hasil deteksi + keputusan pelanggaran disimpan ke **database**.
5. Dashboard **web** membaca data untuk menampilkan okupansi, pelanggaran, dan analitik.

---

## 3. Stack Teknologi (Rekomendasi)

| Komponen              | Rekomendasi                                   | Keterangan                                      |
|-----------------------|-----------------------------------------------|-------------------------------------------------|
| Bahasa backend        | Python 3.11                                   | Ekosistem ML/CV paling matang                   |
| Framework API         | FastAPI                                       | Async, auto-docs (Swagger), ringan              |
| Computer Vision       | YOLOv8 / YOLOv11 (Ultralytics) + OpenCV       | Deteksi objek real-time & akurat                |
| Database              | PostgreSQL + PostGIS                          | Mendukung data spasial (polygon slot)           |
| ORM                   | SQLAlchemy 2.x + Alembic                      | Model & migration                               |
| Object storage        | Lokal `data/` (prototype) / S3 / MinIO        | Penyimpanan bukti foto                          |
| Frontend web          | React + Vite + TypeScript                     | Dashboard pengelola                             |
| Mobile                | React Native (opsional) / Web upload          | MVP cukup pakai web upload                      |
| Task queue (opsional) | Celery + Redis                                | Proses deteksi async untuk banyak foto          |
| Containerization      | Docker + Docker Compose                       | Memudahkan setup prototype                      |

---

## 4. Skema Database (ERD)

```
user (role: admin/petugas)
  |
  | 1..N
  v
parking_area ----< parking_slot ----< transaction ----< fine
        |                                |
        | 1..N                           | 1..N
        v                                v
   parking_slot                     violation
        |                                ^
        | (koordinat polygon slot)       | 1..N
        v                                |
  no_parking_zone                 detection_result
                                        ^
                                        | 1..1 (satu hasil deteksi per foto)
                                        |
                                     upload/foto
```

### 4.1 Daftar Tabel

| Tabel               | Deskripsi                                                       |
|---------------------|-----------------------------------------------------------------|
| `user`              | Akun pengguna + role (`admin` pengelola, `officer` petugas).     |
| `parking_area`      | Area parkir (kampus, mall, kantor, dll).                         |
| `parking_slot`      | Slot parkir + koordinat polygon marka (PostGIS).                 |
| `no_parking_zone`   | Zona terlarang (polygon) untuk deteksi "parkir area terlarang".  |
| `vehicle`           | Kendaraan terdeteksi (jenis, nomor plat opsional).               |
| `transaction`       | Transaksi masuk/keluar: slot, waktu, durasi, tarif.              |
| `violation`         | Jenis pelanggaran, lokasi slot, bukti foto, skor keyakinan.      |
| `fine`              | Denda per jenis pelanggaran (aturan tarif).                      |
| `detection_result`  | Output mentah model per foto (bounding box, confidence).         |

### 4.2 Detail Kolom Utama (ringkas)

- `parking_slot`: `id`, `area_id`, `code`, `polygon` (geometry), `orientation` (sudut), `status`.
- `violation`: `id`, `transaction_id`, `slot_id`, `type` (`over_line`, `multi_slot`, `misaligned`, `no_parking_zone`), `evidence_image_url`, `confidence`, `detected_at`, `status` (`pending/confirmed/rejected`).
- `fine`: `id`, `violation_type`, `amount`, `currency`, `rule_description`.
- `detection_result`: `id`, `image_url`, `model_version`, `raw_json`, `created_at`.

---

## 5. Rencana Dataset & Training

> Dataset gambar saat ini berada **di luar project** dan akan **diimpor** ke dalam project.

### 5.1 Struktur Folder Dataset (YOLO format)

```
data/
  raw/                        # gambar mentah hasil impor dari luar
    images/
    (opsional) labels/
  processed/
    images/
      train/
      val/
      test/
    labels/
      train/
      val/
      test/
  dataset.yaml                # konfigurasi kelas + path
```

### 5.2 Alur Impor Dataset (dari luar project)

1. Siapkan gambar di lokasi sumber (folder lokal / Google Drive).
2. Jalankan script impor: `scripts/import_dataset.py`.
3. Script akan:
   - Menyalin gambar ke `data/raw/images/`.
   - Menormalisasi nama file (contoh: `img_0001.jpg`).
   - Membuat manifest/`index.csv` berisi `filename`, `source_path`, `label_status`.
4. Gambar yang **sudah berlabel** dikonversi ke format YOLO (`.txt` per gambar).
5. Gambar yang **belum berlabel** masuk antrian pelabelan.

### 5.3 Definisi Kelas Deteksi (`dataset.yaml`)

```yaml
path: ../data/processed
train: images/train
val: images/val
test: images/test

names:
  0: vehicle              # kendaraan (mobil/motor)
  1: parking_slot         # slot parkir (polygon)
  2: line_marking         # garis marka
  3: no_parking_zone      # area terlarang
```

> **Catatan penting:** Jenis pelanggaran **bukan** kelas deteksi terpisah.
> Pelanggaran ditentukan oleh **rule engine** di atas hasil deteksi objek (lihat Bab 6).

### 5.4 Strategi Pelabelan (untuk data belum berlabel)

| Tools               | Keteratan                                    |
|---------------------|----------------------------------------------|
| Roboflow            | Disarankan; kolaboratif, export YOLO format  |
| CVAT                | Open-source, cocok untuk polygon/segmentasi  |
| LabelImg            | Sederhana, bounding box saja                 |

- `parking_slot` & `no_parking_zone` dilabel sebagai **polygon/segmentation**.
- `vehicle` & `line_marking` dilabel sebagai **bounding box** (atau polygon untuk marka).

### 5.5 Split Dataset

- **Train 70%**, **Validation 20%**, **Test 10%**.
- Split dilakukan **berstrata** per kelas dan per jenis pelanggaran agar distribusi seimbang.

### 5.6 Augmentasi

| Teknik            | Tujuan                                            |
|-------------------|---------------------------------------------------|
| Horizontal flip   | Variasi arah kendaraan                            |
| Rotasi ±15°       | Variasi sudut foto                                |
| Brightness/Contrast | Variasi pencahayaan (siang/malam, indoor/outdoor) |
| Mosaic            | Meningkatkan generalisasi deteksi objek kecil     |

### 5.7 Metrik Evaluasi

- **mAP50** (mean Average Precision @ IoU 0.5) — target awal ≥ 0.8.
- **Precision** & **Recall** per kelas.
- **Confusion matrix** untuk melihat kesalahan klasifikasi antar kelas.
- **Per-class AP** untuk memastikan kelas `vehicle` dan `parking_slot` terdeteksi andal.

### 5.8 Estimasi Jumlah Data Minimal (acuan awal)

| Kelas             | Jumlah minimal (per kelas) |
|-------------------|----------------------------|
| `vehicle`         | 500+ gambar                |
| `parking_slot`    | 300+ gambar                |
| `line_marking`    | 300+ gambar                |
| `no_parking_zone` | 200+ gambar                |

> Nilai di atas adalah acuan awal; tambah data bila mAP masih rendah.

---

## 6. Pipeline Deteksi Pelanggaran (Rule Engine)

Deteksi pelanggaran dilakukan **rule-based** di atas output model, bukan model terpisah.

| Jenis Pelanggaran      | Logika Deteksi                                                          |
|------------------------|-------------------------------------------------------------------------|
| **Melewati garis marka** (`over_line`) | IoU / overlap bounding box `vehicle` terhadap polygon `parking_slot` < threshold (kendaraan keluar batas). |
| **Menggunakan >1 slot** (`multi_slot`) | Satu bounding box `vehicle` memotong >1 polygon `parking_slot`.          |
| **Posisi tidak sesuai** (`misaligned`)  | Sudut orientasi `vehicle` vs `orientation` slot melebihi toleransi (±20°). |
| **Parkir area terlarang** (`no_parking_zone`) | Bounding box `vehicle` terdeteksi di dalam polygon `no_parking_zone`. |

### 6.1 Pseudocode

```python
def detect_violation(detections, slot_polygons, no_parking_zones):
    violations = []
    for vehicle in detections["vehicle"]:
        # cek area terlarang
        for zone in no_parking_zones:
            if intersect(vehicle.bbox, zone.polygon):
                violations.append({"type": "no_parking_zone", ...})

        # cek jumlah slot yang terpotong
        intersected_slots = [s for s in slot_polygons if intersect(vehicle.bbox, s.polygon)]
        if len(intersected_slots) > 1:
            violations.append({"type": "multi_slot", ...})

        # cek overlap terhadap slot (melewati marka)
        for slot in intersected_slots:
            if iou(vehicle.bbox, slot.polygon) < THRESHOLD:
                violations.append({"type": "over_line", ...})

        # cek orientasi (posisi tidak sesuai)
        if abs(vehicle.orientation - slot.orientation) > TOLERANCE:
            violations.append({"type": "misaligned", ...})

    return violations
```

---

## 7. Rencana API Endpoint

| Method | Endpoint                            | Deskripsi                                  |
|--------|-------------------------------------|--------------------------------------------|
| POST   | `/auth/login`                       | Login, return JWT                           |
| GET    | `/areas` / POST `/areas`            | List & buat area parkir                     |
| GET    | `/areas/{id}/slots`                 | List slot dalam area                        |
| POST   | `/slots`                            | Buat slot + polygon                         |
| POST   | `/detections/upload`                | Upload foto → jalankan deteksi + rule engine |
| GET    | `/detections/{id}`                  | Detail hasil deteksi                        |
| POST   | `/transactions`                     | Buat transaksi masuk                        |
| PUT    | `/transactions/{id}/exit`           | Tutup transaksi (keluar) + hitung durasi/tarif |
| GET    | `/violations`                       | List pelanggaran (filter: area, jenis, tanggal) |
| GET    | `/fines` / POST `/fines`            | Aturan denda                                 |
| GET    | `/analytics/occupancy`              | Tingkat okupansi per area/waktu              |
| GET    | `/analytics/compliance`             | Tingkat kepatuhan                            |
| GET    | `/analytics/revenue`                | Pendapatan & denda                          |

---

## 8. Fitur Analitik Dashboard

| Fitur               | Sumber Data                 | Visualisasi                     |
|---------------------|-----------------------------|---------------------------------|
| Tingkat okupansi    | `transaction` + `parking_slot` | Heatmap slot / bar chart      |
| Tingkat kepatuhan   | `violation` vs total transaksi | Persentase / gauge chart       |
| Jenis pelanggaran   | `violation.type`            | Pie / bar chart                 |
| Lokasi pelanggaran  | `violation` + `parking_slot` (spasial) | Peta / heatmap geografis |
| Durasi parkir       | `transaction` (exit - entry)| Histogram                       |
| Pendapatan & denda  | `transaction` + `fine`      | Time-series line chart          |

---

## 9. Roadmap / Milestone (MVP → Produksi)

| Fase | Target                                   | Deliverable                                    |
|------|------------------------------------------|------------------------------------------------|
| **0** | Setup project                            | Struktur repo, Docker, konfigurasi env         |
| **1** | Dataset & training                       | Impor dataset, pelabelan, model YOLO awal      |
| **2** | Backend + DB + deteksi                   | API, skema DB, pipeline CV + rule engine       |
| **3** | Mobile upload + web dashboard            | Upload foto, tampilan slot, pelanggaran        |
| **4** | Analitik & laporan                       | Okupansi, kepatuhan, pendapatan & denda        |
| **5** | Hardening menuju produksi                | Auth penuh, deployment, monitoring, backup     |

---

## 10. Struktur Repo yang Diusulkan

```
smart-parking/                  # nama repo saat ini: Smart-EvaluationSensing-Statistical-System
  backend/                      # FastAPI + CV + ML
    app/
      api/                      # route/endpoint
      core/                     # config, security
      models/                   # SQLAlchemy models
      services/                 # business logic + rule engine
      ml/                       # YOLO inference + post-processing
    alembic/                    # migration
    tests/
  frontend/                     # React dashboard
    src/
  mobile/                       # upload foto (React Native / web)
  ml/                           # training scripts & notebooks
    train.py
    evaluate.py
    notebooks/
  scripts/
    import_dataset.py
  data/
    raw/
    processed/
    dataset.yaml
  docs/
    PLAN-SMART-PARKING.md       # dokumen ini
  docker-compose.yml
  README.md
```

---

## 11. Next Steps (Langkah Selanjutnya)

1. Konfirmasi & review dokumen ini.
2. Setup struktur repo (Fase 0).
3. Siapkan lokasi dataset eksternal → jalankan `scripts/import_dataset.py` (Fase 1).
4. Mulai pelabelan data yang belum berlabel.
5. Training model YOLO awal & evaluasi.
6. Bangun backend API + database (Fase 2).

---

*Dokumen ini dapat diperbarui seiring perkembangan project. Setiap perubahan besar wajib diperbarui di sini agar tetap menjadi acuan tunggal.*
