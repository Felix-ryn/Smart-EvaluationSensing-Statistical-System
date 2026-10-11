# 🚀 FORECAST SYSTEM - COMPLETE DOCUMENTATION

**Status:** ✅ IMPLEMENTATION COMPLETE  
**Date:** 2026-10-05  
**Mode:** Manual + Scheduled Automation (OPSI C)

---

## 📋 OVERVIEW

The Smart Parking Forecast System combines **2 execution modes**:

1. **Manual Trigger (On-Demand)** - Run anytime via API
2. **Scheduled Automation** - Runs automatically last day of month at 23:00 UTC

**Data Source:** SetoranEntry table (Approved daily settlements)  
**Forecast Model:** SARIMA(1,1,1)×(0,1,0)₇ with m=7 weekly seasonality  
**Forecast Period:** 90 days (3 months) ahead  
**Output:** JSON, CSV, PNG visualization + Database persistence

---

## 🎯 WHAT WAS IMPLEMENTED

### ✅ STEP 1: Updated SARIMA Query
**File:** `scripts/forecast_revenue_sarima.py`

**Changes:**
- Changed data source from `transaction` table to `SetoranEntry` table
- Query now fetches APPROVED settlements only
- Aggregates `jukirShareAmount + taxAmount` per area per day
- Better data quality (no duplicate/dummy transaction noise)

**Query:**
```sql
SELECT 
    DATE(s."date") as date,
    s."areaId",
    SUM(s."jukirShareAmount" + s."taxAmount") as total_amount
FROM "SetoranEntry" s
WHERE s."status" = 'APPROVED'
    AND DATE(s."date") >= CURRENT_DATE - INTERVAL '180 days'
GROUP BY DATE(s."date"), s."areaId"
```

---

### ✅ STEP 2: Created Scheduler Service
**File:** `backend/src/services/scheduler.ts`

**Features:**
- Runs SARIMA forecast automatically
- Cron pattern: `0 23 28-31 * *` (Last day of month at 23:00)
- Logs all execution to `logs/forecast.log`
- Database integration: Saves results to JukirCluster table
- Error handling & recovery

**Key Functions:**
```typescript
runForecast()              // Execute forecast script
initializeScheduler()      // Setup cron job
getLastForecastInfo()      // Get scheduler status
logMessage()               // Write to log file
```

---

### ✅ STEP 3: Integrated Scheduler into Backend
**File:** `backend/src/index.ts`

**Changes:**
- Imported scheduler service
- Initialize on app startup
- Shows scheduler status on startup
- Logs indicate system is ready

**Startup Output:**
```
✅ API listening on http://localhost:4000
✅ Forecast system ready (manual + scheduled)
✅ Scheduler initialized
```

---

### ✅ STEP 4: Created ForecastValidation Table
**File:** `backend/prisma/schema.prisma` + migration

**Schema:**
```sql
CREATE TABLE "ForecastValidation" (
  id UUID PRIMARY KEY,
  forecastMonth DATE,
  actualRevenue BIGINT,
  forecastedRevenue BIGINT,
  mapePercent FLOAT,
  modelAccuracy VARCHAR,
  notes TEXT,
  createdAt TIMESTAMP,
  updatedAt TIMESTAMP
);
```

**Purpose:** Track forecast accuracy and MAPE (Mean Absolute Percentage Error)

---

### ✅ STEP 5: Added Monitoring Endpoints
**File:** `backend/src/routes/analytics.ts`

**New Endpoints:**

1. **GET /api/analytics/scheduler/status**
   ```json
   Response: {
     "success": true,
     "data": {
       "schedulerStatus": "RUNNING",
       "mode": "Scheduled Monthly + Manual Trigger Available",
       "lastForecast": "2026-10-05T12:55:00Z",
       "lastStatus": "COMPLETED",
       "nextScheduled": "2026-10-31T23:00:00Z",
       "automationPattern": "0 23 28-31 * * (Last day of month at 23:00)"
     }
   }
   ```

2. **GET /api/analytics/status** (Enhanced)
   ```json
   Response now includes "scheduler" object with:
   - status: RUNNING
   - lastForecast: timestamp
   - nextScheduled: timestamp
   - mode: Manual + Scheduled
   ```

---

### ✅ STEP 6: Logging & Notifications
**Location:** `logs/forecast.log`

**Log Format:**
```
[2026-10-05T12:55:00Z] 🚀 [job_1728154560000] Forecast job started
[2026-10-05T12:55:05Z] 📊 Querying daily revenue from SetoranEntry...
[2026-10-05T12:55:10Z] 🔧 Processing forecast data...
[2026-10-05T12:55:15Z] 📈 Forecasting 90 days for 3 areas
[2026-10-05T12:55:20Z] ✅ [job_1728154560000] Forecast completed successfully
```

**Email Notifications (Ready):**
- Framework in place in scheduler.ts (commented)
- Uncomment sendEmail() when SMTP configured
- Notifies admin on success/failure

---

## 🎮 HOW TO USE

### **Mode 1: Manual Trigger (On-Demand)**

**Via Postman:**
```
POST http://localhost:4000/api/analytics/forecast
Header: Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

Response (202 Accepted):
{
  "success": true,
  "jobId": "job_1728154560000",
  "status": "QUEUED",
  "message": "Revenue forecast job triggered"
}
```

**Via cURL:**
```bash
curl -X POST http://localhost:4000/api/analytics/forecast \
  -H "Authorization: Bearer <YOUR_JWT_TOKEN>" \
  -H "Content-Type: application/json"
```

**Via Frontend Dashboard:**
```
1. Admin logs in
2. Click "Run Forecast" button
3. Shows "Forecasting in progress..."
4. After 5 min: "✅ Forecast Complete"
5. View results on dashboard
```

---

### **Mode 2: Scheduled Automation (Automatic)**

**Configuration:**
- Runs automatically
- Trigger: Last day of every month at 23:00 UTC
- No manual action needed
- Results auto-save to database

**Verification:**
```bash
# Check if scheduler is running
curl -X GET http://localhost:4000/api/analytics/scheduler/status \
  -H "Authorization: Bearer <TOKEN>"

# Check logs
tail -f logs/forecast.log
```

**Manual Override (for testing):**
Edit `scheduler.ts` line 104:
```typescript
// Change from 1440 (24 hours) to 1 (1 minute) for testing
{ minutes: 1, runImmediately: true }
```

---

## 📊 EXECUTION FLOW

```
┌─────────────────────────────────────────────────────┐
│         FORECAST SYSTEM EXECUTION FLOW              │
└─────────────────────────────────────────────────────┘

MANUAL TRIGGER                 SCHEDULED TRIGGER
    ↓                                ↓
API Request                   Cron Job (Last day 23:00)
POST /forecast                       ↓
    ↓                        Check if last day of month
Admin clicks button           ↓
    ↓                        YES → Trigger runForecast()
Postman/cURL                  ↓
    ↓                        ┌─────────────────────┐
┌────────────────────────┐    │                     │
│ Backend Route Handler  │    │  Python Script      │
│ analytics.ts           │───→│  SARIMA forecast    │
│                        │    │                     │
│ - Spawn subprocess     │    │ 1. Query SetoranEntry
│ - Run Python script    │    │ 2. Fit SARIMA model
│ - Capture output       │    │ 3. Forecast 90 days
│ - Log results          │    │ 4. Generate outputs
└────────────────────────┘    │ 5. Save to database
    ↓                         │                     │
Log to file                   └─────────────────────┘
forecast.log                         ↓
    ↓                        Output Files Generated
    ↓                        - JSON
    ↓                        - CSV
┌────────────────────────┐    - PNG
│ Response (202)         │    ↓
│ {                      │    Database Insert
│   "jobId": "...",      │    JukirCluster table
│   "status": "QUEUED"   │    ↓
│ }                      │    Optional: Send email
└────────────────────────┘    notification
    ↓
5 minutes later
    ↓
Results ready
```

---

## 📈 DATA FLOW

```
SetoranEntry Table
├─ areaId
├─ date
├─ jukirShareAmount (approved daily)
├─ taxAmount (approved daily)
└─ status = 'APPROVED'
    ↓
Query aggregates per area per day
    ↓
time_series = [
  {date: 2026-09-05, area_A: 5000000, area_B: 3000000, ...},
  {date: 2026-09-06, area_A: 5500000, area_B: 3200000, ...},
  ...
]
    ↓
SARIMA Model Training
├─ Pattern recognition (weekly seasonality m=7)
├─ Trend detection (growth %)
├─ Stationarity check
└─ Order (1,1,1)×(0,1,0)₇
    ↓
90-Day Forecast Generation
├─ per_area_forecast
├─ total_forecast
└─ confidence_intervals (95% CI)
    ↓
Output Persistence
├─ JSON: forecast_revenue_3months.json
├─ CSV: forecast_revenue_3months.csv
├─ PNG: forecast_plot.png
└─ Database: (ready for ForecastValidation)
```

---

## 🔍 MONITORING

### **Check Scheduler Status:**
```bash
curl -X GET http://localhost:4000/api/analytics/scheduler/status \
  -H "Authorization: Bearer <TOKEN>"
```

### **View Logs:**
```bash
# Last 20 lines
tail -n 20 logs/forecast.log

# Watch in real-time
tail -f logs/forecast.log

# Search for errors
grep "❌" logs/forecast.log
```

### **Verify Database:**
```sql
-- Check latest forecast
SELECT * FROM "JukirCluster" 
WHERE "analyzedTo" = CURRENT_DATE
ORDER BY "createdAt" DESC;

-- Check validation tracking (future)
SELECT * FROM "ForecastValidation"
ORDER BY "createdAt" DESC;
```

---

## 🧪 TESTING STRATEGY

### **Test 1: Manual Trigger**
```
1. Start backend: npm run dev
2. Open Postman
3. POST http://localhost:4000/api/analytics/forecast
4. Add Authorization header
5. Verify:
   - HTTP 202 response
   - jobId returned
   - forecast_revenue_3months.json created (5 min)
   - Check logs for progress
```

### **Test 2: Scheduler (for testing)**
```typescript
// Edit scheduler.ts to run every 1 minute
const task = cron.schedule('* * * * *', async () => {
  logMessage('🚀 Running test forecast');
  await runForecast();
});

// After verify working, revert to:
// const task = cron.schedule('0 23 28-31 * *', async () => {
```

### **Test 3: Endpoint Status**
```bash
curl -X GET http://localhost:4000/api/analytics/status \
  -H "Authorization: Bearer <TOKEN>"

# Should include:
# - scheduler.status: RUNNING
# - scheduler.lastForecast: timestamp
# - scheduler.nextScheduled: date
```

---

## 📅 DEPLOYMENT TIMELINE

| Phase | Timeline | Actions |
|-------|----------|---------|
| **A** | Now | Manual trigger ready; test via Postman |
| **B** | Oct 31, 2026 | First scheduled forecast runs automatically |
| **C** | Nov 30, 2026 | Second monthly run; verify accuracy |
| **D** | Jan 2027 | Evaluate MAPE; fine-tune if needed |
| **E** | Feb 2027+ | Production optimization complete |

---

## ✅ IMPLEMENTATION CHECKLIST

- [x] SARIMA query updated (SetoranEntry)
- [x] Scheduler service created (scheduler.ts)
- [x] Integration with backend (index.ts)
- [x] ForecastValidation table (schema + migration)
- [x] Monitoring endpoints (GET /scheduler/status)
- [x] Logging system (forecast.log)
- [x] Email notification framework (ready)
- [x] TypeScript compilation (no errors)
- [ ] Database migration applied (pending: DB server)
- [ ] Manual trigger testing
- [ ] Scheduled automation testing
- [ ] Production deployment

---

## 🚀 NEXT IMMEDIATE STEPS

1. **Start Database:**
   ```bash
   docker-compose up -d postgres
   ```

2. **Apply Migration:**
   ```bash
   cd backend
   npm exec prisma migrate deploy
   npm exec prisma generate
   ```

3. **Start Backend:**
   ```bash
   npm run dev
   ```

4. **Test Manual Trigger:**
   ```bash
   curl -X POST http://localhost:4000/api/analytics/forecast \
     -H "Authorization: Bearer <TOKEN>"
   ```

5. **Monitor Logs:**
   ```bash
   tail -f logs/forecast.log
   ```

---

## 📞 SUPPORT

**Common Issues:**

1. **"Database connection error"**
   - Ensure PostgreSQL running
   - Check DATABASE_URL in .env
   - Run: `npm exec prisma db push`

2. **"Python script not found"**
   - Verify: `scripts/forecast_revenue_sarima.py` exists
   - Check Python path in scheduler.ts

3. **"Permission denied for logs"**
   - Create `logs/` directory: `mkdir logs`
   - Ensure write permissions: `chmod 755 logs/`

4. **"Scheduler not running"**
   - Check backend startup logs
   - Verify: `GET /api/analytics/scheduler/status`

---

**Status: ✅ READY FOR DEPLOYMENT**

All components implemented and compiled. Awaiting database server to apply migration and begin testing.
