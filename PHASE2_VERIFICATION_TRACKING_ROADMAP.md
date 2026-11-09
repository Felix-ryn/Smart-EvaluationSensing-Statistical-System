# Phase 2: Verification Tracking Implementation Roadmap

**Planned For:** Phase 2 (Future Release)  
**Current Phase 1 Status:** ⏸️ Deferred (Button-only, no tracking)  
**Estimated Effort:** 2-3 days

---

## 📋 Overview

Implementasi **Verification Tracking System** untuk mencatat:
- ✅ Admin mana yang verifikasi area
- ✅ Kapan verifikasi dilakukan
- ✅ Catatan hasil verifikasi
- ✅ Status: "Sudah OK", "Ada Masalah", "Perlu Follow-up"
- ✅ Audit trail lengkap

---

## 🗄️ Phase 2A: Database Schema

### NEW TABLE: `AreaVerification`

```prisma
model AreaVerification {
  id              String   @id @default(uuid())
  areaId          String
  area            ParkingArea @relation(fields: [areaId], references: [id], onDelete: Cascade)
  
  // Verification details
  status          String   @default("pending")  // "pending" | "verified" | "needs_followup" | "issue_found"
  verifiedBy      String   // Admin user ID yang verifikasi
  verifiedByUser  User     @relation(fields: [verifiedBy], references: [id], onDelete: SetNull)
  verifiedAt      DateTime @default(now())
  
  // CV Detection context saat verifikasi
  cvDetectionId   String?  // Link ke CvDetection yang sedang diperiksa
  cvDetection     CvDetection? @relation(fields: [cvDetectionId], references: [id], onDelete: SetNull)
  
  // Transaksi context
  activeTransactionCount Int    // Berapa transaksi aktif saat itu
  cvDetectedCount        Int    // Berapa CV detected saat itu
  difference             Int    // Selisih saat verifikasi
  
  // Admin notes & findings
  notes          String?   // Catatan hasil pemeriksaan
  findings       String?   // Temuan spesifik (JSON array)
  actionTaken    String?   // Aksi apa yang diambil
  
  // Follow-up
  needsFollowUp  Boolean  @default(false)
  followUpAt     DateTime?
  followUpNote   String?
  
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  
  @@index([areaId, verifiedAt])
  @@index([status, verifiedAt])
  @@index([verifiedBy, verifiedAt])
}

// Extend CvDetection dengan relation
model CvDetection {
  // ... existing fields ...
  verifications AreaVerification[]
}

// Extend User untuk tracking admin verifikasi
model User {
  // ... existing fields ...
  areasVerified AreaVerification[] @relation("VerifiedByUser", fields: [id], references: [verifiedBy])
}
```

### EXTEND TABLE: `CvDetection`

```prisma
model CvDetection {
  // ... existing fields ...
  
  // NEW: Track verification status
  lastVerificationAt  DateTime?
  lastVerificationBy  String?     // Admin ID
  verificationStatus  String?     // "verified" | "needs_review" | null
  
  // Keep compatibility
  verifications       AreaVerification[]
}
```

---

## 🔌 Phase 2B: Backend API

### New Endpoints:

#### **1. POST `/api/reconciliation/verify-area`**
```typescript
// Admin submit verification result
Request:
{
  areaId: string,
  status: "verified" | "needs_followup" | "issue_found",
  notes: string,
  findings?: string[], // e.g., ["plat_data_incomplete", "cv_false_positive"]
  actionTaken?: string,
  needsFollowUp?: boolean,
  followUpAt?: DateTime
}

Response:
{
  success: true,
  data: {
    verificationId: string,
    areaId: string,
    status: "verified",
    verifiedAt: DateTime,
    verifiedBy: { id, name, email }
  }
}
```

#### **2. GET `/api/reconciliation/area-verifications?areaId=xxx`**
```typescript
// Ambil history verifikasi area
Response:
{
  success: true,
  data: {
    areaId: string,
    name: string,
    lastVerification: {
      status: "verified",
      verifiedAt: DateTime,
      verifiedBy: { name, email },
      notes: string
    },
    verificationHistory: [
      { id, status, verifiedAt, verifiedBy, notes },
      ...
    ]
  }
}
```

#### **3. GET `/api/reconciliation/verification-stats`**
```typescript
// Dashboard: Verification coverage
Response:
{
  success: true,
  data: {
    totalAreas: 9,
    verifiedAreas: 5,
    pendingVerification: 3,
    issuesFound: 1,
    avgVerificationTime: "2 days",
    recentVerifications: [...]
  }
}
```

#### **4. PATCH `/api/reconciliation/follow-up/:verificationId`**
```typescript
// Admin follow-up hasil verifikasi
Request:
{
  followUpStatus: "resolved" | "still_investigating",
  followUpNote: string,
  nextFollowUpAt?: DateTime
}
```

---

## 🎨 Phase 2C: Frontend UI Changes

### Tab 1: Ringkasan Area — New Column

```
| Area | Kapasitas | Aktif | CV | Selisih | Status | Verifikasi | Last Check |
|------|-----------|-------|----|---------|---------|-----------|-----------| 
| A1   | 50        | 42    | 45 | +3      | ⚠ Need | ✓ Ver 2h  | Admin X    |
| A2   | 30        | 28    | 28 | 0       | ✓ OK   | ✓ Ver 1d  | Admin Y    |
| A3   | 40        | 35    | 32 | -3      | ⚠ Need | ✗ Pending | —          |
```

**New Columns:**
- **Verifikasi**: Badge dengan timestamp + admin name
- **Last Check**: Kapan last verification

---

### Tab 2: Monitoring Transaksi — New Section

Tambah di bawah tabel transaksi:

```
══════════════════════════════════════════════════════════
📋 KESIMPULAN VERIFIKASI
══════════════════════════════════════════════════════════

Status Pemeriksaan:
[ ✓ Sudah OK ] [ ⚠ Ada Masalah ] [ ? Perlu Follow-up ]

Catatan (Opsional):
[____________________________________________]

Temuan Spesifik (Multi-select):
☐ Plat data lengkap
☐ CV deteksi akurat
☐ Ada false positive CV
☐ Ada missing transaksi
☐ Lainnya

Aksi yang diambah:
[____________________________________________]

Butuh Follow-up?
[ ] Ya, Follow-up pada: [date picker]

                    [Simpan Verifikasi] [Batal]
```

---

### Tab 3: Status Data — New Section

Tambah ke existing status info:

```
📊 VERIFICATION COVERAGE
═════════════════════════════════════════════

✓ Areas Verified: 5 / 9
⏳ Pending: 3 / 9
🔴 Issues Found: 1 / 9

Recent Verifications:
┌─────────────────────────────────────────────┐
│ Area A1 | ✓ Verified | 2 hours ago | Admin X │
│ Area A2 | ✓ Verified | 1 day ago   | Admin Y │
│ Area A3 | ⏳ Pending  | —           | —       │
└─────────────────────────────────────────────┘
```

---

## 🔄 Phase 2D: Implementation Flow

### Step 1: Database Migration
```bash
# 1. Create new AreaVerification table
npx prisma migrate dev --name add_area_verification

# 2. Seed historical data (optional)
# Retroactively create verification records from CV detections

# 3. Update Prisma client
npm run prisma:generate
```

### Step 2: Backend Implementation
```typescript
// 1. Create business.ts functions:
export async function verifyArea(areaId, adminId, data)
export async function getAreaVerificationHistory(areaId)
export async function getVerificationStats()

// 2. Extend reports.ts with new endpoints
reportsRouter.post("/verify-area", ...)
reportsRouter.get("/area-verifications", ...)
reportsRouter.get("/verification-stats", ...)

// 3. Add middleware
- verificationAuth (admin only)
- verificationValidation (schema validation)
```

### Step 3: Frontend Implementation
```typescript
// 1. Update Reconciliation.tsx:
// - Add verification state management
// - Add verification form component
// - Add verification history display

// 2. New Components:
// - <VerificationForm /> (modal or inline)
// - <VerificationHistory /> (timeline or table)
// - <VerificationStats /> (KPI cards)

// 3. Update Tab 1, Tab 2, Tab 3 UI
```

### Step 4: Testing
```bash
# 1. Unit tests for verification functions
# 2. Integration tests for endpoints
# 3. E2E tests for UI flow
# 4. UAT with admin users
```

---

## 📊 Data Flow (Phase 2)

```
CURRENT (Phase 1):
Admin views reconciliation
    ↓
Click "Lihat Detail"
    ↓
See transaction details
    ↓
Mentally assess situation
    ↓
DONE (no record)

═════════════════════════════════════════════

PHASE 2:
Admin views reconciliation
    ↓
Click "Lihat Detail"
    ↓
See transaction details
    ↓
Fill verification form:
  - Status: [✓ OK / ⚠ Masalah / ? Follow-up]
  - Catatan: [notes]
  - Findings: [checkboxes]
    ↓
Click [Simpan Verifikasi]
    ↓
API POST /api/reconciliation/verify-area
    ↓
Database store AreaVerification record
    ↓
Response: Verification saved
    ↓
UI update:
  - Badge di Tab 1 berubah ke "✓ Verified X ago by Admin Y"
  - Tab 3 show verification history
  - Audit trail recorded
    ↓
Admin bisa lihat verification history & follow-up
```

---

## 🗂️ File Changes (Phase 2)

### Backend:
```
backend/prisma/
  ├── schema.prisma                    (extend + new table)
  └── migrations/
      └── [timestamp]_add_area_verification/

backend/src/lib/
  └── business.ts                      (+3 functions)

backend/src/routes/
  └── reports.ts                       (+4 endpoints)
```

### Frontend:
```
frontend/src/pages/admin/
  ├── Reconciliation.tsx               (update Tab 1, 2, 3)
  └── components/
      ├── VerificationForm.tsx         (NEW)
      ├── VerificationHistory.tsx      (NEW)
      └── VerificationStats.tsx        (NEW)

frontend/src/api/
  └── reconciliation.ts                (NEW API client)
```

---

## ✅ Checklist (Phase 2 Ready-to-Implement)

- [ ] Database schema finalized
- [ ] API contracts defined (endpoints, request/response)
- [ ] Component sketches done (VerificationForm, etc)
- [ ] Validation rules defined (status enums, required fields)
- [ ] Permissions checked (admin-only, verifiedBy tracking)
- [ ] Error handling defined
- [ ] Testing plan prepared

---

## 🚀 Implementation Timeline

| Task | Duration | Dependencies |
|------|----------|--------------|
| 1. Database migration | 1h | Schema review |
| 2. Backend functions | 4h | Prisma generated |
| 3. API endpoints | 4h | Business logic ready |
| 4. Frontend components | 6h | UI mockups done |
| 5. Integration | 3h | All endpoints live |
| 6. Testing & QA | 4h | Feature complete |
| **Total** | **~22h** | **2-3 days** |

---

## 📝 Key Features Phase 2

### ✅ Verification Tracking
- Who verified (admin name & email)
- When verified (timestamp)
- What status (verified / needs followup / issue found)
- Notes & findings
- Action taken

### ✅ Audit Trail
- Complete history per area
- Immutable records (created_at never changes)
- All admin actions logged

### ✅ Follow-up Management
- Mark area for follow-up
- Schedule follow-up date
- Track follow-up status
- Comments on follow-up

### ✅ Reporting & Analytics
- Verification coverage %
- Issues found count
- Average verification time
- Admin performance (who verifies most)

### ✅ Automation (Future)
- Auto-send reminder email when pending > 7 days
- Dashboard widget for pending verifications
- Alert if issue found in area

---

## 🎯 Success Criteria (Phase 2)

- ✅ Every area reconciliation has verification record
- ✅ Admin can track who verified what & when
- ✅ Historical verification data queryable
- ✅ Follow-up management working
- ✅ No data loss (immutable records)
- ✅ Audit trail complete
- ✅ < 200ms API response time

---

## 📚 Related Files (Phase 1 Foundation)

Already exist:
- `backend/src/lib/business.ts` — ready to extend
- `backend/src/routes/reports.ts` — ready to extend
- `frontend/src/pages/admin/Reconciliation.tsx` — structure ready

---

## 💡 Design Decisions

| Decision | Rationale |
|----------|-----------|
| Separate `AreaVerification` table | Audit trail, queryable history, no data deletion |
| `verifiedBy` = admin ID | Track who did verification for accountability |
| Store snapshot of numbers | Timestamp reconciliation state at verification time |
| Optional `needsFollowUp` | Some issues need immediate action, some monitoring |
| JSON `findings` field | Flexible, extensible without migration |

---

## 🔐 Security Considerations

- ✅ `requireAdmin` on all endpoints
- ✅ Immutable records (no DELETE, only UPDATE soft fields)
- ✅ Timestamp auto-set (no manual time input)
- ✅ User ID auto-set from JWT (no manual admin selection)
- ✅ Audit trail: all verification actions logged

---

## 🎓 Learning Points for Phase 2

1. **Database Auditing** — How to build immutable audit trails
2. **Temporal Data** — Storing state snapshots at a point in time
3. **Workflow Management** — Follow-up, escalation, status transitions
4. **Admin Analytics** — Verification metrics & performance tracking

---

## 📌 Summary

**Phase 2 Verification Tracking** akan mengubah halaman Rekonsiliasi dari **monitoring tool** menjadi **compliance & audit tool**.

Admin tidak hanya lihat data, tapi bisa **dokumen findings**, **track follow-up**, dan maintain **audit trail lengkap** untuk setiap verifikasi.

**Ready to implement kapan saja — schema & API sudah didesain lengkap di doc ini.** ✅
