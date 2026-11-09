# 📋 Reconciliation Page Implementation - Quick Summary

## ✅ Implemented
Halaman **Rekonsiliasi Admin** (role: ADMIN) yang memantau perbandingan transaksi parkir aktif dengan deteksi kendaraan dari Computer Vision (CV) per area, tanpa menambahkan tabel baru.

---

## 📂 Files Changed

| File | Changes |
|------|---------|
| **backend/src/lib/business.ts** | +2 functions: `reconciliationSummary()`, `activeTransactionsByArea()` |
| **backend/src/routes/reports.ts** | +2 endpoints: `/reconciliation/summary`, `/reconciliation/active-transactions` |
| **frontend/src/pages/admin/Reconciliation.tsx** | Complete rewrite: 3-tab UI with real data |

**Migrations:** ❌ None  
**New Tables:** ❌ None  
**Schema Changes:** ❌ None

---

## 🔌 Endpoints Used

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/reports/reconciliation` | GET | Admin | Ringkasan per area (existing, extended) |
| `/api/reports/reconciliation/summary` | GET | Admin | KPI: areas, scans, transactions, plate data availability |
| `/api/reports/reconciliation/active-transactions` | GET | Admin | Detail transaksi aktif; query param: `?areaId=...` |

---

## 📊 Frontend UI Structure

### 3 Tabs:

**Tab 1: Ringkasan Area**
```
Area | Kapasitas | Transaksi Aktif | CV Normal | CV Violation | Selisih | Status | Scan Terakhir
```
- Data source: `reconciliation()` function
- Status: "Sesuai" (hijau) jika selisih = 0, atau "Perlu Verifikasi" (kuning)
- Selisih = CV_Normal_Count - Active_Transactions_Count

**Tab 2: Monitoring Transaksi Aktif**
```
Filter Area (dropdown) → 
Kode TX | Area | Jukir | Tipe | Plat | Check-in
```
- Data source: `activeTransactionsByArea(areaId?)` function
- Filterable by area
- Plat: dari `Transaction.plateNumber` (manual input, opsional)

**Tab 3: Status Data & Anomali**
```
KPI Cards:
- Area Terscan: N / Total
- Transaksi Tanpa Plat: N / Total

Table: Status CV Scan per Area
- Area name | Scan status (✓/✗) | Last scan timestamp
```
- Data source: `reconciliationSummary()` function
- Info disclaimer: Phase 1 hanya monitoring quantity, bukan OCR matching

---

## 🔄 Data Sources & Calculations

### Data Source (Existing, No Changes):
```
Transaction {
  id, transactionCode, areaId, plateNumber, checkIn, vehicleType, status, ...
}

ParkingArea {
  id, name, capacity, ...
  detections: CvDetection[]
}

CvDetection {
  id, areaId, normalCount, violationCount, detectedAt, ...
}

User {
  id, name, role, areaId, ...  // jukir info
}
```

### Calculation Logic:

**1. Reconciliation Summary (per area):**
```typescript
activeTransactions = COUNT(Transaction WHERE status='ACTIVE' AND areaId=X)
lastCvDetection = LATEST(CvDetection WHERE areaId=X)
cvNormal = lastCvDetection?.normalCount ?? 0
cvViolation = lastCvDetection?.violationCount ?? 0

selisih = cvNormal - activeTransactions
status = (selisih === 0) ? "Cocok" : "Perlu Verifikasi"
```

**2. Summary Data (global):**
```typescript
totalAreas = COUNT(ParkingArea)
areasWithScan = COUNT(ParkingArea WHERE detections.length > 0)
totalActiveTransactions = COUNT(Transaction WHERE status='ACTIVE')
txWithoutPlate = COUNT(Transaction WHERE status='ACTIVE' AND plateNumber IS NULL)
```

**3. Active Transactions Detail:**
```typescript
SELECT transaction.*, area.name, jukir.name
FROM transaction
JOIN parkingArea ON transaction.areaId = area.id
LEFT JOIN user jukir ON transaction.jukirId = jukir.id
WHERE transaction.status = 'ACTIVE'
  AND (transaction.areaId = ? OR ? IS NULL)
ORDER BY checkIn DESC
```

---

## ⚠️ Important Notes

### What It Does:
✅ Monitor **quantity** of active transactions vs CV detection per area  
✅ Show **data availability** (areas scanned, plate numbers collected)  
✅ Early warning jika ada **discrepancy** (untuk operational monitoring)  
✅ Real data dari database, **tidak ada dummy values**  

### What It Does NOT:
❌ **Not plate-level matching** — individual plate text comparison  
❌ **Not fraud detection** — selisih bukan indikasi pelanggaran  
❌ **Not OCR-powered** — OCR pipeline belum tersedia (Phase 2)  
❌ **Not pencocokan otomatis** — belum bisa link transaksi ↔ deteksi by plate  

### Interpretasi Selisih:
| Value | Meaning | Action |
|-------|---------|--------|
| 0 | Jumlah cocok | ✓ Normal |
| +2 | CV deteksi lebih banyak | ⚠ Cek: false positive, kendaraan non-transaksi |
| -2 | Transaksi lebih banyak | ⚠ Cek: lag update, miss detection CV |

**→ Ini adalah MONITORING TOOL, bukan FRAUD DETECTION**

---

## 🧪 How to Test

### 1. Backend - Verify Endpoints:
```bash
# Test summary endpoint
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:3000/api/reports/reconciliation/summary

# Response should show:
{
  "success": true,
  "data": {
    "totalAreas": 5,
    "areasWithCvScan": 3,
    "areasWithoutScan": 2,
    "totalActiveTransactions": 42,
    "transactionsWithoutPlate": 18,
    "areasCvStatus": [...]
  }
}

# Test active transactions
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  http://localhost:3000/api/reports/reconciliation/active-transactions?areaId=area-id-123
```

### 2. Frontend - Navigate & Verify:
1. Login as Admin
2. Go to sidebar → Reconciliation
3. **Tab 1:** Verify all areas shown, selisih calculated correctly
4. **Tab 2:** Select area, see detail transactions, plat numbers
5. **Tab 3:** Check area scan status, plate data availability

### 3. Verify Data Integrity:
- Pastikan `Transaction.plateNumber` sudah ada isinya di beberapa record
- Pastikan `CvDetection` sudah ada records dengan timestamp
- Pastikan area punya jukir assigned

---

## 🔐 Security & Access Control

- ✅ Both endpoints require `requireAdmin` middleware
- ✅ No sensitive personal data exposed
- ✅ No data modification (read-only)
- ✅ Consistent with existing auth pattern

---

## 📈 Query Performance

- **reconciliation()** — N+1 mitigated by `include()`, 1 query
- **reconciliationSummary()** — 5 parallel queries (allSettled)
- **activeTransactionsByArea()** — 1 query with select optimization

Expected response time: <200ms for typical dataset

---

## 🎯 Phase 2 Roadmap

To enable **plate-level matching** & OCR:

1. **Setup OCR pipeline** (PaddleOCR di ai-service)
2. **Create PlateObservation table** untuk track deteksi plat
3. **Extend CvDetection** dengan relation ke PlateObservation
4. **Add `/api/reconciliation/plate-matches` endpoint**
5. **Enhance UI** dengan plate-specific matching tab + confidence display

See `RECONCILIATION_PHASE1_IMPLEMENTATION.md` for detailed Phase 2 plan.

---

## ✨ Summary

**Ini halaman monitoring operasional, bukan investigasi fraud.**

Gunakan untuk:
- 📊 Cek consistency transaksi vs deteksi
- 📍 Monitor area mana yang scan CV-nya
- 🚗 Track berapa banyak transaksi tanpa plat data
- 🔍 Identify anomali untuk deeper investigation

Data real dari database → honest picture of system state.
