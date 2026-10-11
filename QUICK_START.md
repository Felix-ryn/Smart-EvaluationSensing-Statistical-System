# ⚡ QUICK START - ANALYTICS SYSTEM

## Installation (5 minutes)

```bash
# 1. Setup Python
cd scripts
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

# 2. Verify database
cd ../backend
npm exec prisma migrate deploy
npm run build
```

## Generate Test Data (5 minutes)

```bash
cd scripts
python generate_analytics_data.py
# Generates: 4.800 Attendance records
```

## Run Analytics (15 minutes)

```bash
# Forecast (3-month revenue prediction)
python forecast_revenue_sarima.py
# Outputs: forecast_revenue_3months.json/csv/png

# Segmentation (jukir performance clustering)
python segment_jukir_gmm.py
# Outputs: jukir_clusters.json/csv/png + database
```

## Test API (5 minutes)

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Test endpoints
curl -X GET http://localhost:4000/api/analytics/status \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

---

## Files

| File | Purpose | Status |
|------|---------|--------|
| `schema.prisma` | Database models | ✅ Created |
| `Attendance` table | Working hours tracking | ✅ Created |
| `JukirCluster` table | Cluster assignments | ✅ Created |
| `analytics.ts` | API endpoints | ✅ Created |
| `generate_analytics_data.py` | Test data | ✅ Created |
| `forecast_revenue_sarima.py` | Revenue forecast | ✅ Created |
| `segment_jukir_gmm.py` | Performance clustering | ✅ Created |

---

## API Endpoints

```
POST   /api/analytics/forecast              Trigger SARIMA
POST   /api/analytics/segmentation          Trigger GMM  
GET    /api/analytics/segmentation/latest   Get latest clusters
GET    /api/analytics/forecast/latest       Get latest forecast
GET    /api/analytics/status                System health
```

All require Admin authentication.

---

## Output Files

After running scripts, find in `scripts/`:
- `forecast_revenue_3months.json` - Forecast data
- `forecast_revenue_3months.csv` - Spreadsheet
- `forecast_plot.png` - Chart
- `jukir_clusters.json` - Cluster assignments
- `cluster_summary.csv` - Cluster stats
- `bic_analysis.png` - Optimization curve
- `cluster_analysis.png` - Distribution chart

---

## Environment Variables

```bash
# .env file
DATABASE_URL=postgresql://user:pass@localhost:5434/sess
ANALYTICS_MODE=SIMULATE  # Use REAL for production
```

---

## Troubleshooting

**ImportError in Python?**
```bash
pip install --upgrade -r requirements.txt
```

**SARIMA convergence?**
- Ensure Transaction table has >30 days data
- Check database connection

**No clusters?**
- Need minimum 3 jukir + attendance records
- Check Attendance table is populated

**API not found?**
- Backend must be compiled: `npm run build`
- Restart: `npm run dev`

---

## Documentation

- **Detailed Testing:** See `ANALYTICS_TESTING_GUIDE.md`
- **Full Implementation:** See `ANALYTICS_IMPLEMENTATION_COMPLETE.md`
- **Script Code Comments:** Read docstrings in .py files

---

**Ready to start? Run the Installation section above!** 🚀
