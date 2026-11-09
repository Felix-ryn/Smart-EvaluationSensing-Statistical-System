# Live Camera Detection - Testing Guide

## Fitur yang Diimplementasikan

### 1. Komponen Frontend
- **LiveCameraDetection.tsx**: Komponen kamera live dengan:
  - Tab Upload/Kamera di ViolationForm
  - Akses kamera via getUserMedia (facingMode: environment)
  - Frame capture ~500ms interval (~2 FPS)
  - Deteksi otomatis saat camera stream berjalan
  - Alert ketika 3+ dari 5 frame terakhir memiliki confidence ≥ threshold
  - Slider threshold (0.1-0.9) dan cooldown (5-60s)
  - Sound (beep 800Hz), vibration, snapshot capture
  - Daftar alert terbaru dengan timestamp dan confidence

### 2. Integration Points
- ViolationForm tetap support upload foto/video manual
- Admin Violations page: hanya tampil daftar & validasi (tanpa form lapor)
- Jukir Violations: tetap punya form lapor + instruksi (now with camera tab)
- User ReportViolation page: support both upload & live camera

### 3. Backend
- Endpoint POST /api/violations tetap sama (accept file multipart)
- Deteksi live camera mengirim frame JPEG blob langsung ke endpoint
- Report otomatis disimpan dengan status PENDING
- Tidak ada perubahan schema database atau endpoint baru

## Testing by Role

### USER Role
**Halaman**: `/report-violation`
**Akses**: Public (no auth)
1. Klik tab "Upload Foto/Video"
   - ✅ Pilih area, upload foto/video, lihat hasil analisis
   - ✅ Laporan disimpan dengan source="USER"
2. Klik tab "Kamera Live"
   - ✅ Allow kamera saat diminta
   - ✅ Pilih area, tulis keterangan opsional
   - ✅ Klik "Mulai Deteksi"
   - ✅ Arahkan kamera ke area parkir yang diduga berpelanggaran
   - ✅ Tunggu hingga 3+ dari 5 frame terakhir violation → alert sound + vibrate
   - ✅ Alert muncul di banner merah + daftar alert
   - ✅ Klik "Berhenti Deteksi" atau tunggu hingga laporan tersimpan

**Expected Behavior**:
- Kamera ditolak: error message "Kamera tidak tersedia atau ditaolak"
- AI service mati: error saat POST /api/violations
- Laporan otomatis disimpan dengan status PENDING

### JUKIR Role
**Halaman**: `/jukir/violations`
**Akses**: Authenticated (JUKIR only)
1. Form tetap ada dengan instruksi pengumpulan
2. Tab "Upload Foto/Video"
   - ✅ Pilih area (assign ke area jukir)
   - ✅ Upload foto, lihat hasil, laporan disimpan
   - ✅ Sumber otomatis "JUKIR"
3. Tab "Kamera Live" (BARU)
   - ✅ Kamera live seperti User
   - ✅ Sumber otomatis "JUKIR"

**Expected Behavior**:
- Jukir dapat membuat laporan via upload atau kamera live
- Laporan status PENDING menunggu admin validasi
- Fitur validasi tidak hilang (tetap di halaman admin)

### ADMIN Role
**Halaman**: `/admin/violations`
**Akses**: Authenticated (ADMIN only)
**Perubahan**: REMOVE form lapor (sebelumnya ada "Lapor sebagai Admin")
1. ✅ Hanya tampil daftar laporan dari USER/JUKIR/CCTV
2. ✅ Filter status, sumber, pencarian
3. ✅ Validasi: VALID/REJECTED dengan note
4. **tidak ada tab kamera** untuk admin

**Expected Behavior**:
- Admin tidak bisa membuat laporan langsung
- Hanya review & validasi laporan yang ada

## Test Scenarios

### Scenario 1: Upload Manual (USER)
1. Go to `/report-violation`
2. Select area
3. Click Upload tab
4. Choose image file with parking violation
5. Click "Kirim & Analisis"
6. **Expected**: Laporan tersimpan, status PENDING, dapat dilihat di jukir/admin dashboard

### Scenario 2: Live Camera Valid Detection (USER)
1. Go to `/report-violation`
2. Click Camera Live tab
3. Select area
4. Click "Mulai Deteksi"
5. Point camera at violation (e.g., car in bike parking)
6. Wait for alert (sound + vibrate)
7. Verify:
   - ✅ Banner alert merah muncul
   - ✅ Sound beep terdengar
   - ✅ Vibration terjadi (device support)
   - ✅ Snapshot ditampilkan di daftar alert
   - ✅ Laporan tersimpan ke database

### Scenario 3: Threshold Adjustment (JUKIR)
1. Go to `/jukir/violations`
2. Click Camera Live tab
3. Adjust threshold slider ke 0.8 (high confidence only)
4. Adjust cooldown ke 30s
5. Click "Mulai Deteksi"
6. **Expected**: Alert hanya muncul jika confidence ≥ 0.8 dan tidak dalam cooldown window

### Scenario 4: Camera Denied
1. Go to `/report-violation`
2. Click Camera Live tab
3. Deny camera permission
4. **Expected**: Error message "Kamera tidak tersedia atau ditolak" muncul

### Scenario 5: AI Service Down
1. Stop FastAPI service
2. Go to `/report-violation`, click Camera Live tab
3. Click "Mulai Deteksi"
4. **Expected**: Error handling saat POST, message shown (detection stops gracefully)

### Scenario 6: Admin Validation
1. User/Jukir submits violation report
2. Go to `/admin/violations`
3. See report in PENDING status
4. Click "Valid" or "Tolak"
5. **Expected**: Status changes, saved to database

## Checklist Summary

### Frontend Changes
- [x] Create LiveCameraDetection.tsx component
- [x] Add tab toggle in ViolationForm
- [x] Remove ViolationForm import from admin/Violations
- [x] Remove admin report form section
- [x] Update ReportViolation page header

### Backend
- [x] No changes (POST /api/violations already supports multipart upload)
- [x] No schema changes
- [x] No migration needed

### Database
- [x] No changes (Violation model already has confidence, source fields)

### Role Access
- [x] USER: can create via upload + camera (public page)
- [x] JUKIR: can create via upload + camera, can validate (authenticated)
- [x] ADMIN: only validate, no form (authenticated admin only)

## Performance Notes

1. Frame processing: ~500ms interval (~2 FPS) to balance responsiveness vs bandwidth
2. Frame size: 640px max width, JPEG 80% quality for bandwidth
3. No parallel requests: sequential frame processing
4. Confidence threshold: 0.5 default, user adjustable
5. Violation persistence: 3+ of 5 frame detection before alert
6. Cooldown: 10s default to prevent spam
