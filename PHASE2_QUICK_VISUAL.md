# Phase 2: Quick Visual Guide

## 🎯 Phase 1 vs Phase 2 Comparison

### PHASE 1 (Sekarang ✅):
```
Reconciliation Page
├─ Tab 1: Ringkasan Area
│  └─ Tabel: Area | Kapasitas | Aktif | CV | Selisih | Status
│     └─ Status Badge: ⚠ Verifikasi | ✓ Sesuai
│     └─ Tombol: "Lihat Detail →"
├─ Tab 2: Monitoring Transaksi
│  └─ Filter area + Tabel detail transaksi
└─ Tab 3: Status Data
   └─ Availability tracking & disclaimer

❌ NO TRACKING, NO PERSISTENCE
```

---

### PHASE 2 (Planned):
```
Reconciliation Page (EXTENDED)
├─ Tab 1: Ringkasan Area (UPDATED)
│  └─ Tabel + NEW: Verifikasi Status | Last Checked | Admin Name
│     └─ "✓ Verified 2h ago by Admin X"
│     └─ "⏳ Pending verification"
│
├─ Tab 2: Monitoring Transaksi (UPDATED)
│  ├─ Existing: Tabel detail transaksi
│  └─ NEW: Verification Form Section
│     ├─ Status: [✓ OK] [⚠ Masalah] [? Follow-up]
│     ├─ Catatan: [textarea]
│     ├─ Findings: [checkboxes]
│     └─ Button: [Simpan Verifikasi]
│
├─ Tab 3: Status Data (UPDATED)
│  ├─ Existing: Area scan status
│  └─ NEW: Verification Coverage
│     ├─ ✓ Verified: 5/9
│     ├─ ⏳ Pending: 3/9
│     └─ Recent Verifications: [timeline]
│
└─ NEW Tab 4: Verification History (OPTIONAL)
   └─ Timeline: All verifications per area
      └─ Date | Status | Admin | Notes | Follow-up Status

✅ FULL TRACKING + AUDIT TRAIL
```

---

## 📊 Database Addition (Phase 2)

### NEW TABLE: AreaVerification
```
┌─────────────────────────────────────────────────┐
│ AreaVerification                                │
├─────────────────────────────────────────────────┤
│ id              (UUID, PRIMARY KEY)             │
│ areaId          (FK → ParkingArea)              │
│ status          ("verified"|"needs_followup"...) │
│ verifiedBy      (FK → User.id / Admin)          │
│ verifiedAt      (TIMESTAMP)                     │
│ notes           (TEXT - catatan admin)          │
│ findings        (JSON array)                    │
│ activeTransactionCount (INT snapshot)           │
│ cvDetectedCount (INT snapshot)                  │
│ needsFollowUp   (BOOLEAN)                       │
│ followUpAt      (DATETIME - scheduled)          │
│ followUpNote    (TEXT)                          │
│ createdAt       (TIMESTAMP)                     │
│ updatedAt       (TIMESTAMP)                     │
└─────────────────────────────────────────────────┘
```

---

## 🔌 API Endpoints (Phase 2)

### New Endpoints:
```
POST   /api/reconciliation/verify-area
       → Admin submit verification result
       
GET    /api/reconciliation/area-verifications?areaId=xxx
       → Get verification history per area
       
GET    /api/reconciliation/verification-stats
       → Dashboard KPI: coverage, issues, trends
       
PATCH  /api/reconciliation/follow-up/:verificationId
       → Admin submit follow-up result
```

---

## 🎨 UI Changes (Phase 2)

### Tab 1: Ringkasan Area — NEW Column Example:

**BEFORE (Phase 1):**
```
Area     | Kapasitas | Aktif | CV  | Selisih | Status         | Tombol
═════════════════════════════════════════════════════════════════════
Area A1  | 50        | 42    | 45  | +3      | ⚠ Verifikasi   | [Lihat Detail →]
Area A2  | 30        | 28    | 28  | 0       | ✓ Sesuai       | —
```

**AFTER (Phase 2):**
```
Area     | Kapasitas | Aktif | CV  | Selisih | Status | Verifikasi                    | Last Check
═════════════════════════════════════════════════════════════════════════════════════════════════════
Area A1  | 50        | 42    | 45  | +3      | ⚠      | ✓ Verified 2h ago by Admin X  | Admin X
Area A2  | 30        | 28    | 28  | 0       | ✓      | ✓ Verified 1d ago by Admin Y  | Admin Y
Area A3  | 40        | 35    | 32  | -3      | ⚠      | ⏳ Pending verification       | —
```

---

### Tab 2: Monitoring Transaksi — NEW Form Section:

**After Inspection, Admin Fills:**
```
┌─────────────────────────────────────────┐
│  📋 KESIMPULAN VERIFIKASI               │
├─────────────────────────────────────────┤
│                                         │
│  Status Pemeriksaan:                    │
│  [ ✓ Sudah OK ]                         │
│  [ ⚠ Ada Masalah ]                      │
│  [ ? Perlu Follow-up ]                  │
│                                         │
│  Catatan:                               │
│  ┌─────────────────────────────────┐   │
│  │ Selisih +3 karena CV false pos..│   │
│  └─────────────────────────────────┘   │
│                                         │
│  Temuan (pilih semua yang sesuai):      │
│  ☑ Plat data lengkap                   │
│  ☐ CV deteksi akurat                   │
│  ☑ Ada false positive CV                │
│  ☐ Ada missing transaksi               │
│                                         │
│  Aksi yang diambil:                     │
│  ┌─────────────────────────────────┐   │
│  │ Koordinasi dengan CV team...    │   │
│  └─────────────────────────────────┘   │
│                                         │
│  Butuh Follow-up?                       │
│  [ ✓ ] Ya, Follow-up: [30/11/2026]     │
│                                         │
│         [✓ Simpan Verifikasi] [Batal]  │
│                                         │
└─────────────────────────────────────────┘
```

---

### Tab 3: Status Data — NEW Verification Coverage:

**Current (Phase 1):**
```
Area Terscan: 3/9
Transaksi Tanpa Plat: 18/42
(no verification tracking)
```

**Phase 2:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 VERIFICATION COVERAGE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Areas Verified:     5 / 9  (56%)
⏳ Pending Review:    3 / 9  (33%)
🔴 Issues Found:      1 / 9  (11%)

🕒 Recent Verifications:
┌─────────────────────────────────────────┐
│ Area A1 | ✓ Verified | 2h ago | Admin X │
│ Area A2 | ✓ Verified | 1d ago | Admin Y │
│ Area A3 | ⏳ Pending  | —      | —       │
└─────────────────────────────────────────┘

⏰ Next Follow-up:
│ Area A1 | 30 Nov 2026 | Issue found    │
```

---

## 🗂️ Implementation Breakdown (Phase 2)

### Part A: Database (1-2h)
```
1. Write schema extension
2. Create migration file
3. Run migration
4. Verify new table in DB
```

### Part B: Backend (4-6h)
```
1. Create business logic functions (3h)
   - verifyArea()
   - getAreaVerificationHistory()
   - getVerificationStats()
   - followUpVerification()

2. Create API endpoints (3h)
   - POST /reconciliation/verify-area
   - GET /reconciliation/area-verifications
   - GET /reconciliation/verification-stats
   - PATCH /reconciliation/follow-up/:id

3. Add validation & error handling (1h)
```

### Part C: Frontend (6-8h)
```
1. Create components (4h)
   - VerificationForm.tsx (verification modal/section)
   - VerificationHistory.tsx (timeline display)
   - VerificationStats.tsx (KPI cards)

2. Update Reconciliation.tsx (3h)
   - Tab 1: Add verification column + styling
   - Tab 2: Add form section + submission
   - Tab 3: Add coverage stats

3. Integration + styling (1h)
```

### Part D: Testing (2-3h)
```
1. Unit tests (1h)
2. Integration tests (1h)
3. E2E tests (1h)
```

**Total: ~2-3 days** (if full-time)

---

## 📋 Checklist: Ready for Phase 2?

Pre-Implementation Checklist:
- [ ] Review this roadmap with team
- [ ] Confirm database schema (AreaVerification table)
- [ ] Confirm API contracts (endpoints & payloads)
- [ ] UI mockups approved
- [ ] Validation rules defined
- [ ] Error handling strategy
- [ ] Testing plan prepared
- [ ] Timeline & resources allocated

---

## 💡 Key Differences: Phase 1 vs Phase 2

| Aspect | Phase 1 | Phase 2 |
|--------|---------|---------|
| **Purpose** | Monitoring | Compliance & Audit |
| **Data Persistence** | No | Yes, immutable |
| **Who Verified** | No tracking | Admin name + timestamp |
| **Findings** | Just observation | Documented & categorized |
| **Follow-up** | Manual | Scheduled & tracked |
| **Audit Trail** | None | Complete history |
| **Reporting** | No metrics | Coverage %, trends |
| **Effort** | 2-3 days Phase 1 | 2-3 days Phase 2 |

---

## 🚀 Phase 2 Entry Point

When ready to start Phase 2:
1. Open `PHASE2_VERIFICATION_TRACKING_ROADMAP.md` (detailed spec)
2. Review schema & endpoints
3. Start with database migration
4. Follow implementation sections A → B → C → D
5. Test thoroughly before merge

**Document is complete & ready to implement anytime.** ✅

---

## 📎 Related Documents

- `RECONCILIATION_SUMMARY.md` — Phase 1 overview
- `RECONCILIATION_PHASE1_IMPLEMENTATION.md` — Phase 1 detailed
- `RECONCILIATION_UPDATE_VERIFICATION.md` — Opsi 1 button implementation
- `PHASE2_VERIFICATION_TRACKING_ROADMAP.md` — This is the detailed spec ← START HERE for Phase 2
