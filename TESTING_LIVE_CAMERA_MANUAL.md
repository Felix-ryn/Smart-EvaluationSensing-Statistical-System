# Manual Testing Checklist - Live Camera Detection

## Environment Setup
- Backend: Node/Express running on `http://localhost:4000`
- FastAPI AI Service: running on `http://localhost:8000` (or env var AI_SERVICE_URL)
- Frontend: Vite dev server on `http://localhost:5173`
- Database: PostgreSQL connected

## Pre-Test Checks

### Database Verification
```bash
# Ensure Violation table has these columns:
# - photoPath (String)
# - areaId (String, nullable)
# - violationType (String: "parking_violation" | "review" | "none")
# - confidence (Float, nullable)
# - source (enum: "USER", "JUKIR", "CCTV")
# - status (enum: "PENDING", "VALID", "REJECTED")
# - reportedById (String, nullable)
# - reporterRole (enum: "ADMIN", "JUKIR", "USER")
# - note (String, nullable)
# - detections (Json, nullable)

# Run check:
npx prisma studio  # Verify schema visually
```

### Backend Service Check
```bash
# Terminal 1: Start backend
cd backend
npm run dev
# Should see: Server running on port 4000

# Terminal 2: Check AI service
curl http://localhost:8000/docs
# FastAPI Swagger should load

# Terminal 3: Start frontend
cd frontend
npm run dev
# Should see: VITE v... ready in XXX ms
```

---

## Test 1: USER Role - Upload Tab

**Prerequisite**: Not authenticated (public page)

### Steps:
1. Open browser to `http://localhost:5173/report-violation`
2. Verify page header: "Laporkan Pelanggaran Parkir"
3. See two tabs: "Upload Foto/Video" (active) and "Kamera Live"
4. Select area from dropdown
5. Ensure "User" is default source (should be "USER")
6. Add note: "Test manual upload"
7. Choose image file with parking violation (test-violation.jpg)
8. Click "Kirim & Analisis"
9. Wait for analysis (should take 2-5s)

### Expected Result:
- ✅ Badge shows "Pelanggaran terdeteksi" or "Perlu review" or "Tidak ada pelanggaran"
- ✅ Confidence percentage displayed
- ✅ Photo preview shown
- ✅ No console errors

### Database Check:
```bash
# In psql or pgAdmin:
SELECT id, photoPath, source, status, confidence FROM "Violation" 
ORDER BY createdAt DESC LIMIT 1;

# Expected: source='USER', status='PENDING', confidence > 0
```

---

## Test 2: USER Role - Live Camera Tab (Normal Flow)

**Prerequisite**: Same as Test 1

### Steps:
1. Go to `/report-violation`
2. Click "Kamera Live" tab
3. Select area
4. Add optional note: "Live camera test"
5. Verify threshold is 0.5 (default)
6. Verify cooldown is 10s (default)
7. **Click "Mulai Deteksi"**
   - Browser should ask for camera permission
   - Click "Allow"
8. Wait 2-3 seconds
   - Video stream should appear in preview
9. Adjust camera to show parking violation area
10. **Wait for detection to trigger**
    - Listen for beep sound (800Hz, 200ms)
    - Feel vibration if device supports (200ms)
    - Check for red banner: "Pelanggaran Terdeteksi! Snapshot disimpan."
11. **View alert list**
    - Timestamp shown (HH:MM:SS)
    - Area name displayed
    - Confidence % shown
    - Thumbnail snapshot visible
12. **Click "Berhenti Deteksi"**
    - Video stream stops
    - Frame history clears

### Expected Result:
- ✅ Video stream visible
- ✅ Sound/vibration triggered on violation
- ✅ Banner alert visible with snapshot
- ✅ Alert list shows recent detections
- ✅ Can click "Reset" to clear history
- ✅ Can start detection again

### Database Check:
```bash
# Check that violation was auto-saved:
SELECT id, photoPath, source, status, confidence, createdAt 
FROM "Violation" 
ORDER BY createdAt DESC LIMIT 1;

# Expected: source='USER', status='PENDING'
```

---

## Test 3: USER Role - Camera Denied Permission

**Prerequisite**: User denies camera access

### Steps:
1. Go to `/report-violation`
2. Click "Kamera Live" tab
3. Click "Mulai Deteksi"
4. When browser asks, click "Block" or "Deny"

### Expected Result:
- ✅ Error message: "Kamera tidak tersedia atau ditolak"
- ✅ Detection button remains clickable
- ✅ Video preview shows placeholder

---

## Test 4: USER Role - Threshold Adjustment

**Prerequisite**: Camera streaming

### Steps:
1. Go to `/report-violation` → Camera Live tab
2. Set threshold slider to **0.8** (high confidence only)
3. Set cooldown to **30** seconds
4. Click "Mulai Deteksi"
5. Point camera at various parking scenarios
   - Some with clear violations
   - Some borderline

### Expected Result:
- ✅ Alerts only trigger when confidence ≥ 0.8
- ✅ After first alert, wait 30s before next alert can trigger
- ✅ Frame history shows color coding (red=violation, green=normal)

### Frame History Visual:
```
Status Frame Terakhir (5/5)
┌──┬──┬──┬──┬──┐
│1 │2 │3 │4 │5 │
│80%│75%│82%│40%│20%│
└──┴──┴──┴──┴──┘
  red red red grn grn  ← color indicates violation/normal
```
- When 3+ red = alert triggers

---

## Test 5: JUKIR Role - Upload + Camera Tabs

**Prerequisite**: Logged in as JUKIR user

### Steps:
1. Login with jukir account
2. Navigate to `/jukir/violations`
3. Header should show: "Upload Pelanggaran"
4. See form + instructions on right side
5. Test upload tab same as Test 1 (source should be "JUKIR")
6. Test camera tab same as Test 2 (source should be "JUKIR")

### Expected Result:
- ✅ Both upload and camera tabs work
- ✅ Source automatically set to "JUKIR"
- ✅ Laporan can be created and saved
- ✅ Instruction list still visible on right

### Database Check:
```bash
SELECT id, source, reporterRole, status 
FROM "Violation" 
WHERE source='JUKIR' 
ORDER BY createdAt DESC LIMIT 1;

# Expected: source='JUKIR', reporterRole='JUKIR', status='PENDING'
```

---

## Test 6: ADMIN Role - Violations List (No Form)

**Prerequisite**: Logged in as ADMIN

### Steps:
1. Login with admin account
2. Go to `/admin/violations`
3. **Verify form is GONE** (previously was "Lapor sebagai Admin" section)
4. Should ONLY see:
   - KPI stats (Total, Pending, Valid, Rejected)
   - Filters (Status, Sumber, Pencarian)
   - Table with all violations
5. Look at violations from Test 1, 2, 5
6. Click "Valid" button on a PENDING violation
7. Confirm status changes to "VALID" in table
8. Click "Tolak" on another
9. Confirm status changes to "REJECTED"

### Expected Result:
- ✅ NO "Lapor sebagai Admin" form visible
- ✅ Can filter by Status/Source
- ✅ Can validate violations (Valid/Tolak)
- ✅ Status updates immediately in table
- ✅ Can see confidence levels and timestamps

### Database Check:
```bash
# Verify admin validation:
SELECT id, violationType, source, status, adminNote, updatedAt 
FROM "Violation" 
WHERE status != 'PENDING' 
ORDER BY updatedAt DESC LIMIT 3;

# Expected: status='VALID' or 'REJECTED'
```

---

## Test 7: Error Handling - AI Service Down

**Prerequisite**: Stop FastAPI service

### Steps:
1. Stop AI service: `Ctrl+C` in FastAPI terminal
2. Go to `/report-violation` → Camera Live tab
3. Click "Mulai Deteksi"
4. Point camera, wait for detection
5. Observe behavior

### Expected Result:
- ✅ Error silently handled, no crash
- ✅ Detection may retry or fail gracefully
- ✅ No violation saved (detection failed)
- ✅ Frontend remains functional
- **Note**: Current implementation may need error handling enhancement

---

## Test 8: Frame Processing Timing

**Prerequisite**: Camera streaming

### Steps:
1. Go to `/report-violation` → Camera Live
2. Enable browser DevTools (F12)
3. Open Network tab
4. Start detection
5. Observe POST requests to `/api/violations`

### Expected Result:
- ✅ Requests sent ~every 500ms (~2 FPS)
- ✅ Each request ≤ 640px width JPEG
- ✅ No parallel requests (sequential)
- ✅ Request size typically 20-50KB

---

## Test 9: Multi-Frame Detection (3 of 5)

**Prerequisite**: Camera showing clear violation

### Steps:
1. Start camera detection with threshold=0.5
2. Point at parking violation
3. Wait for frame history to populate
4. Observe: need 3+ violation frames to trigger alert

### Expected Result:
```
Frame History Evolution:
Frame 1: 65% (red) ✓ violation
Frame 2: 58% (red) ✓ violation  
Frame 3: 62% (red) ✓ violation ← 3/3 → ALERT TRIGGERS
Frame 4: 55% (red) ✓ violation
Frame 5: 48% (red) ✓ violation
```

- ✅ Alert triggers after 3rd violation frame
- ✅ Sound + vibration fires
- ✅ Snapshot saved

---

## Test 10: Cooldown Window

**Prerequisite**: Alert just triggered

### Steps:
1. Get first alert (cooldown=10s default)
2. Immediately try to trigger another violation
3. Wait 5 seconds, check if second alert shows
4. Wait 10+ seconds total, trigger again

### Expected Result:
- ✅ Second alert blocked within 10s window
- ✅ After 10s, new alerts can trigger again
- ✅ Frame history continues updating
- ✅ Cooldown timer prevents spam

---

## Test 11: Reset Button

**Prerequisite**: Active detection with alerts

### Steps:
1. Generate some alerts
2. Click "Reset" button
3. Observe:
   - Frame history clears
   - Alert list empties
   - Detection continues running

### Expected Result:
- ✅ History cleared
- ✅ Alerts cleared
- ✅ Detection still running
- ✅ Can trigger new alerts

---

## Test 12: Cross-Browser Camera Support

**Prerequisites**: Access to different browsers

### Test on:
- [ ] Chrome/Chromium (desktop)
- [ ] Firefox (desktop)
- [ ] Safari (desktop)
- [ ] Chrome (Android)
- [ ] Safari (iOS)

### Expected Result:
- ✅ Camera permission prompt appears
- ✅ Video stream shows
- ✅ getUserMedia works (environment facingMode)
- ✅ Canvas capture works
- ⚠️ Note: iOS Safari may have limitations

---

## Regression Tests

### Existing Features Not Broken:
1. **Upload still works** (Test 1)
2. **Admin validations still work** (Test 6)
3. **Jukir transactions unaffected** ✓
4. **Area management unaffected** ✓
5. **Dashboard stats unaffected** ✓

---

## Final Checklist

- [ ] Test 1: Upload manual
- [ ] Test 2: Camera normal flow
- [ ] Test 3: Camera denied
- [ ] Test 4: Threshold adjustment
- [ ] Test 5: Jukir role both tabs
- [ ] Test 6: Admin no form
- [ ] Test 7: AI service error
- [ ] Test 8: Frame timing
- [ ] Test 9: 3-of-5 detection
- [ ] Test 10: Cooldown
- [ ] Test 11: Reset
- [ ] Test 12: Cross-browser (optional)
- [ ] Regression tests passed

---

## Known Limitations / Future Improvements

1. **No offline queue**: If AI service is down, violations not saved
2. **No retry logic**: Failed detections don't auto-retry
3. **Mobile battery**: Continuous camera + detection drains battery
4. **No video recording**: Only snapshots, not full video
5. **No bounding boxes**: AI detections not visualized on stream

ponytail: Add retry logic when AI service fails; add bounding box canvas overlay when frameHistory >= 3/5; add battery optimization mode (reduce FPS).
