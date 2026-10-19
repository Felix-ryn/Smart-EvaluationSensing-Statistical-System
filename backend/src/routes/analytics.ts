import { Router } from "express";
import path from "path";
import fs from "fs";
import { prisma } from "../prisma.js";
import { requireAdmin, requireJukirOrAdmin } from "../middleware/auth.js";
import { runForecast, getLastForecastInfo } from "../services/scheduler.js";
import { spawnPythonScript } from "../lib/python.js";

const analyticsRouter = Router();

// Helper: trigger Python script asynchronously
async function triggerPythonScript(scriptName: string): Promise<{ jobId: string; status: string }> {
  const jobId = `job_${Date.now()}`;

  // Execute async (don't wait for completion), but fail fast if process can't be spawned.
  const launched = await spawnPythonScript(scriptName, { stdio: "pipe" });
  const child = launched.child;

  child.stdout?.on("data", (chunk) => {
    const msg = String(chunk).trim();
    if (msg) console.log(`[${jobId}] ${scriptName} stdout: ${msg}`);
  });
  child.stderr?.on("data", (chunk) => {
    const msg = String(chunk).trim();
    if (msg) console.error(`[${jobId}] ${scriptName} stderr: ${msg}`);
  });
  child.on("error", (err) => {
    console.error(`[${jobId}] Script ${scriptName} spawn error:`, err);
  });
  child.on("close", (code) => {
    if (code !== 0) {
      console.error(`[${jobId}] Script ${scriptName} exited with code ${code}`);
      return;
    }
    console.log(`[${jobId}] Script ${scriptName} finished successfully`);
  });

  return {
    jobId,
    status: "QUEUED",
  };
}

// ==========================================
// POST /api/analytics/forecast
// Trigger modern revenue forecast (XGBoost vs Prophet)
// ==========================================
analyticsRouter.post("/forecast", requireAdmin, async (req, res, next) => {
  try {
    const result = await triggerPythonScript("forecast_revenue_modern.py");

    res.status(202).json({
      success: true,
      message: "Revenue forecast job triggered",
      data: {
        jobId: result.jobId,
        status: result.status,
        description: "Forecast results (model compare + selected model) saved to forecast_revenue_3months.json",
      },
    });
  } catch (e) {
    next(e);
  }
});

// ==========================================
// POST /api/analytics/segmentation
// Trigger modern jukir segmentation (GMM vs HDBSCAN)
// ==========================================
analyticsRouter.post("/segmentation", requireAdmin, async (req, res, next) => {
  try {
    const result = await triggerPythonScript("segment_jukir_modern.py");

    res.status(202).json({
      success: true,
      message: "Jukir segmentation job triggered",
      data: {
        jobId: result.jobId,
        status: result.status,
        description: "Results saved to JukirCluster table + model comparison in jukir_clusters.json",
      },
    });
  } catch (e) {
    next(e);
  }
});

// ==========================================
// POST /api/analytics/data-generation
// Trigger test data generation (development only)
// ==========================================
analyticsRouter.post("/data-generation", requireAdmin, async (req, res, next) => {
  try {
    // Check if ANALYTICS_MODE is SIMULATE
    const mode = process.env.ANALYTICS_MODE || "SIMULATE";
    if (mode !== "SIMULATE") {
      return res.status(400).json({
        success: false,
        message: "Data generation only available in SIMULATE mode",
        code: "MODE_NOT_SUPPORTED",
      });
    }

    const result = await triggerPythonScript("generate_analytics_data.py");

    res.status(202).json({
      success: true,
      message: "Data generation job triggered",
      data: {
        jobId: result.jobId,
        status: result.status,
        description: "Generates 4.800+ Attendance records and enhances Transaction data",
      },
    });
  } catch (e) {
    next(e);
  }
});

// ==========================================
// GET /api/analytics/segmentation/latest
// Fetch latest jukir cluster assignments
// ==========================================
analyticsRouter.get("/segmentation/latest", requireAdmin, async (req, res, next) => {
  try {
    // Get latest analysis date
    const latestAnalysis = await prisma.jukirCluster.findFirst({
      orderBy: { analyzedTo: "desc" },
      select: { analyzedTo: true },
    });

    if (!latestAnalysis) {
      return res.status(404).json({
        success: false,
        message: "No cluster analysis found",
        code: "NOT_FOUND",
      });
    }

    // Get all clusters for latest date
    const clusters = await prisma.jukirCluster.findMany({
      where: { analyzedTo: latestAnalysis.analyzedTo },
      include: {
        jukir: {
          select: {
            id: true,
            name: true,
            email: true,
            areaId: true,
          },
        },
      },
      orderBy: [{ clusterLabel: "asc" }, { dailyEarnings: "desc" }],
    });

    // Try to enrich with model metadata from script output (if available)
    const modelInfoPath = path.join(process.cwd(), "../scripts/jukir_clusters.json");
    let modelMeta: {
      selectedModel?: string;
      silhouetteGmm?: number | null;
      silhouetteHdbscan?: number | null;
      noiseCount?: number | null;
    } = {};
    if (fs.existsSync(modelInfoPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(modelInfoPath, "utf-8"));
        modelMeta = {
          selectedModel: parsed.selected_model,
          silhouetteGmm: parsed.model_comparison?.gmm?.silhouette ?? null,
          silhouetteHdbscan: parsed.model_comparison?.hdbscan?.silhouette ?? null,
          noiseCount:
            parsed.model_comparison?.hdbscan?.noise_count ??
            clusters.filter((c) => c.clusterLabel === -1).length,
        };
      } catch {
        // ignore malformed optional metadata
      }
    }

    // Group by cluster
    const clusterGroups: Record<number, typeof clusters> = {};
    for (const cluster of clusters) {
      if (!clusterGroups[cluster.clusterLabel]) {
        clusterGroups[cluster.clusterLabel] = [];
      }
      clusterGroups[cluster.clusterLabel].push(cluster);
    }

    // Calculate cluster statistics
    const clusterStats: Record<
      number,
      {
        count: number;
        avgEarnings: number;
        avgConsistency: number;
        avgPunctuality: number;
      }
    > = {};

    for (const clusterLabel in clusterGroups) {
      const clusterMembers = clusterGroups[parseInt(clusterLabel)];
      clusterStats[parseInt(clusterLabel)] = {
        count: clusterMembers.length,
        avgEarnings: Math.round(
          clusterMembers.reduce((sum, m) => sum + m.dailyEarnings, 0) /
            clusterMembers.length
        ),
        avgConsistency: parseFloat(
          (
            clusterMembers.reduce((sum, m) => sum + m.workConsistency, 0) /
            clusterMembers.length
          ).toFixed(2)
        ),
        avgPunctuality: parseFloat(
          (
            clusterMembers.reduce((sum, m) => sum + m.punctualityPercent, 0) /
            clusterMembers.length
          ).toFixed(1)
        ),
      };
    }

    res.json({
      success: true,
      data: {
        analyzedDate: latestAnalysis.analyzedTo,
        totalJukir: clusters.length,
        clusters: clusterGroups,
        clusterStatistics: clusterStats,
        selectedModel: modelMeta.selectedModel ?? "gmm",
        silhouette: {
          gmm: modelMeta.silhouetteGmm ?? null,
          hdbscan: modelMeta.silhouetteHdbscan ?? null,
        },
        noiseCount: modelMeta.noiseCount ?? clusters.filter((c) => c.clusterLabel === -1).length,
      },
    });
  } catch (e) {
    next(e);
  }
});

// ==========================================
// GET /api/analytics/segmentation/me
// Jukir-facing view: semua jukir + penanda baris milik sendiri.
// HARUS didefinisikan sebelum /segmentation/:date agar tidak tertangkap olehnya.
// ==========================================
analyticsRouter.get("/segmentation/me", requireJukirOrAdmin, async (req, res, next) => {
  try {
    const latestAnalysis = await prisma.jukirCluster.findFirst({
      orderBy: { analyzedTo: "desc" },
      select: { analyzedTo: true },
    });

    if (!latestAnalysis) {
      return res.status(404).json({
        success: false,
        message: "Belum ada analisis segmentasi",
        code: "NOT_FOUND",
      });
    }

      const rows = await prisma.jukirCluster.findMany({
      where: { analyzedTo: latestAnalysis.analyzedTo },
      include: { jukir: { select: { id: true, name: true } } }, // email sengaja tidak diambil
      orderBy: [{ clusterLabel: "asc" }, { dailyEarnings: "desc" }],
    });

    const members = rows.map((r) => ({
      id: r.id,
      jukirId: r.jukirId,
      name: r.jukir?.name ?? "—",
      clusterLabel: r.clusterLabel,
      gmmProbability: r.gmmProbability,
      dailyEarnings: r.dailyEarnings,
      workConsistency: r.workConsistency,
      punctualityPercent: r.punctualityPercent,
      isNoise: r.clusterLabel === -1,
    }));

    const modelInfoPath = path.join(process.cwd(), "../scripts/jukir_clusters.json");
    let selectedModel = "gmm";
    let silhouette: { gmm: number | null; hdbscan: number | null } = {
      gmm: null,
      hdbscan: null,
    };
    if (fs.existsSync(modelInfoPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(modelInfoPath, "utf-8"));
        selectedModel = parsed.selected_model ?? selectedModel;
        silhouette = {
          gmm: parsed.model_comparison?.gmm?.silhouette ?? null,
          hdbscan: parsed.model_comparison?.hdbscan?.silhouette ?? null,
        };
      } catch {
        // ignore malformed optional metadata
      }
    }

    // Statistik rata-rata per cluster
    const clusterStatistics: Record<
      number,
      { count: number; avgEarnings: number; avgConsistency: number; avgPunctuality: number }
    > = {};
    for (const m of members) {
      const k = m.clusterLabel;
      if (!clusterStatistics[k]) {
        clusterStatistics[k] = { count: 0, avgEarnings: 0, avgConsistency: 0, avgPunctuality: 0 };
      }
      clusterStatistics[k].count += 1;
      clusterStatistics[k].avgEarnings += m.dailyEarnings;
      clusterStatistics[k].avgConsistency += m.workConsistency;
      clusterStatistics[k].avgPunctuality += m.punctualityPercent;
    }
    for (const k of Object.keys(clusterStatistics)) {
      const s = clusterStatistics[Number(k)];
      s.avgEarnings = Math.round(s.avgEarnings / s.count);
      s.avgConsistency = parseFloat((s.avgConsistency / s.count).toFixed(2));
      s.avgPunctuality = parseFloat((s.avgPunctuality / s.count).toFixed(1));
    }

    // Baris milik pemanggil + peringkat dalam clusternya
    const myRow = members.find((m) => m.jukirId === req.user?.id) ?? null;
    let myRank: number | null = null;
    let myClusterSize: number | null = null;
    if (myRow) {
      const peers = members
        .filter((m) => m.clusterLabel === myRow.clusterLabel)
        .sort((a, b) => b.dailyEarnings - a.dailyEarnings);
      myClusterSize = peers.length;
      myRank = peers.findIndex((m) => m.jukirId === myRow.jukirId) + 1;
    }

    res.json({
      success: true,
      data: {
        analyzedDate: latestAnalysis.analyzedTo,
        totalJukir: members.length,
        members,
        clusterStatistics,
        selectedModel,
        silhouette,
        noiseCount: members.filter((m) => m.clusterLabel === -1).length,
        me: myRow ? { ...myRow, rank: myRank, clusterSize: myClusterSize } : null,
      },
    });
  } catch (e) {
    next(e);
  }
});

// ==========================================
// GET /api/analytics/segmentation/model-info
// Model metadata untuk segmentasi (GMM/HDBSCAN compare).
// HARUS sebelum /segmentation/:date.
// ==========================================
analyticsRouter.get("/segmentation/model-info", requireJukirOrAdmin, async (_req, res, next) => {
  try {
    const jsonPath = path.join(process.cwd(), "../scripts/jukir_clusters.json");

    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({
        success: false,
        message: "Info model belum tersedia. Jalankan segmentasi terlebih dahulu.",
        code: "NOT_FOUND",
      });
    }

    const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));

    res.json({
      success: true,
      data: {
        analyzedDate: parsed.analyzed_date ?? null,
        analysisWindowDays: parsed.analysis_window_days ?? null,
        selectedModel: parsed.selected_model ?? null,
        optimalClusters: parsed.model_comparison?.gmm?.optimal_clusters ?? parsed.optimal_clusters ?? null,
        bicScores: parsed.model_comparison?.gmm?.bic_scores ?? parsed.bic_scores ?? {},
        silhouette: {
          gmm: parsed.model_comparison?.gmm?.silhouette ?? null,
          hdbscan: parsed.model_comparison?.hdbscan?.silhouette ?? null,
        },
        noiseCount: parsed.model_comparison?.hdbscan?.noise_count ?? null,
      },
    });
  } catch (e) {
    next(e);
  }
});

// ==========================================
// GET /api/analytics/segmentation/:date
// Fetch cluster assignments for specific date
// ==========================================
analyticsRouter.get("/segmentation/:date", requireAdmin, async (req, res, next) => {
  try {
    const date = new Date(req.params.date);

    if (isNaN(date.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format (use YYYY-MM-DD)",
        code: "INVALID_DATE",
      });
    }

    const clusters = await prisma.jukirCluster.findMany({
      where: { analyzedTo: date },
      include: {
        jukir: {
          select: {
            id: true,
            name: true,
            email: true,
            areaId: true,
          },
        },
      },
      orderBy: [{ clusterLabel: "asc" }, { dailyEarnings: "desc" }],
    });

    if (clusters.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No cluster analysis for this date",
        code: "NOT_FOUND",
      });
    }

    res.json({
      success: true,
      data: {
        analyzedDate: date,
        totalJukir: clusters.length,
        clusters,
      },
    });
  } catch (e) {
    next(e);
  }
});

// ==========================================
// GET /api/analytics/segmentation/summary/all
// Get summary of all segmentation analyses
// ==========================================
analyticsRouter.get("/segmentation/summary/all", requireAdmin, async (req, res, next) => {
  try {
    // Get all unique analysis dates
    const analyses = await prisma.jukirCluster.findMany({
      distinct: ["analyzedTo"],
      select: { analyzedTo: true },
      orderBy: { analyzedTo: "desc" },
    });

    // For each date, get summary stats
    const summaries = [];
    for (const analysis of analyses) {
      const clusters = await prisma.jukirCluster.findMany({
        where: { analyzedTo: analysis.analyzedTo },
      });

      const clusterLabels = new Set(clusters.map((c) => c.clusterLabel));

      summaries.push({
        analyzedDate: analysis.analyzedTo,
        totalJukir: clusters.length,
        numClusters: clusterLabels.size,
        avgEarnings: Math.round(
          clusters.reduce((sum, c) => sum + c.dailyEarnings, 0) / clusters.length
        ),
        avgPunctuality: parseFloat(
          (
            clusters.reduce((sum, c) => sum + c.punctualityPercent, 0) /
            clusters.length
          ).toFixed(1)
        ),
      });
    }

    res.json({
      success: true,
      data: {
        totalAnalyses: summaries.length,
        analyses: summaries,
      },
    });
  } catch (e) {
    next(e);
  }
});

// ==========================================
// GET /api/analytics/forecast/latest
// Fetch latest forecast data from JSON file
// ==========================================
analyticsRouter.get("/forecast/latest", requireAdmin, async (req, res, next) => {
  try {
    const forecastPath = path.join(process.cwd(), "../scripts/forecast_revenue_3months.json");

    if (!fs.existsSync(forecastPath)) {
      return res.status(404).json({
        success: false,
        message: "Forecast data not available. Run forecast job first.",
        code: "NOT_FOUND",
      });
    }

    const forecastData = JSON.parse(fs.readFileSync(forecastPath, "utf-8"));

    res.json({
      success: true,
      data: forecastData,
    });
  } catch (e) {
    next(e);
  }
});

// ==========================================
// GET /api/analytics/status
// Check status of all analytics
// ==========================================
analyticsRouter.get("/status", requireAdmin, async (req, res, next) => {
  try {
    // Check Attendance table
    const attendanceCount = await prisma.attendance.count();

    // Check JukirCluster table
    const clusterCount = await prisma.jukirCluster.count();
    const latestCluster = await prisma.jukirCluster.findFirst({
      orderBy: { analyzedTo: "desc" },
    });

    // Check if forecast file exists
    const forecastPath = path.join(process.cwd(), "../scripts/forecast_revenue_3months.json");
    const forecastExists = fs.existsSync(forecastPath);

    // Check if model metadata exists
    const modelInfoPath = path.join(process.cwd(), "../scripts/jukir_clusters.json");
    const modelInfoExists = fs.existsSync(modelInfoPath);

    // Get scheduler info
    const schedulerInfo = await getLastForecastInfo();

    res.json({
      success: true,
      data: {
        attendance: {
          totalRecords: attendanceCount,
          status: attendanceCount > 0 ? "Ready" : "Empty",
        },
        clustering: {
          totalRecords: clusterCount,
          latestAnalysis: latestCluster?.analyzedTo || null,
          status: clusterCount > 0 ? "Ready" : "Not Generated",
        },
        forecast: {
          exists: forecastExists,
          status: forecastExists ? "Ready" : "Not Generated",
        },
        modelInfo: {
          exists: modelInfoExists,
          status: modelInfoExists ? "Ready" : "Not Generated",
        },
        scheduler: {
          status: "RUNNING",
          lastForecast: schedulerInfo.lastForecast,
          lastStatus: schedulerInfo.lastStatus,
          nextScheduled: schedulerInfo.nextScheduled,
          mode: "Manual + Scheduled (Last day of month at 23:00 UTC)",
        },
      },
    });
  } catch (e) {
    next(e);
  }
});

// ==========================================
// GET /api/analytics/shift-revenue
// Pendapatan per tanggal untuk shift PAGI vs SORE + garis rata-rata gabungan
// ==========================================
analyticsRouter.get("/shift-revenue", requireAdmin, async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number.parseInt(String(req.query.days ?? "90"), 10) || 90, 7), 365);
    const granularity = String(req.query.granularity ?? "daily") === "weekly" ? "weekly" : "daily";
    const bucketExpr = granularity === "weekly" ? `DATE_TRUNC('week', t."checkIn")::date` : `DATE(t."checkIn")`;

    const rows = await prisma.$queryRawUnsafe<
      { bucket: Date; shift: "PAGI" | "SORE"; total: bigint }[]
    >(
      `
      SELECT
        ${bucketExpr} as bucket,
        a."shift" as shift,
        SUM(COALESCE(t."amount", 0))::bigint as total
      FROM "transaction" t
      JOIN "Attendance" a
        ON a."jukirId" = t."jukirId"
       AND a."date" = DATE(t."checkIn")
      WHERE t."status" = 'COMPLETED'
        AND t."amount" IS NOT NULL
        AND t."checkIn" >= NOW() - ($1 || ' days')::interval
      GROUP BY bucket, a."shift"
      ORDER BY bucket ASC
      `,
      String(days),
    );

    const byBucket = new Map<string, { pagi: number; sore: number }>();
    for (const r of rows) {
      const key = new Date(r.bucket).toISOString().slice(0, 10);
      if (!byBucket.has(key)) byBucket.set(key, { pagi: 0, sore: 0 });
      const cur = byBucket.get(key)!;
      if (r.shift === "PAGI") cur.pagi = Number(r.total);
      if (r.shift === "SORE") cur.sore = Number(r.total);
    }

    const series = Array.from(byBucket.entries())
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([date, v]) => ({ date, pagi: v.pagi, sore: v.sore, total: v.pagi + v.sore }));

    const overallAverage =
      series.length > 0
        ? series.reduce((sum, s) => sum + s.total, 0) / series.length
        : 0;

    res.json({
      success: true,
      data: {
        days,
        granularity,
        overallAverage,
        series,
      },
    });
  } catch (e) {
    next(e);
  }
});

// ==========================================
// GET /api/analytics/scheduler/status
// Get detailed scheduler status
// ==========================================
analyticsRouter.get("/scheduler/status", requireAdmin, async (req, res, next) => {
  try {
    const schedulerInfo = await getLastForecastInfo();

    res.json({
      success: true,
      data: {
        schedulerStatus: "RUNNING",
        mode: "Scheduled Monthly + Manual Trigger Available",
        lastForecast: schedulerInfo.lastForecast,
        lastStatus: schedulerInfo.lastStatus,
        nextScheduled: schedulerInfo.nextScheduled,
        manualTriggerEndpoint: "POST /api/analytics/forecast",
        automationPattern: "0 23 28-31 * * (Last day of month at 23:00)",
      },
    });
  } catch (e) {
    next(e);
  }
});

export { analyticsRouter };
