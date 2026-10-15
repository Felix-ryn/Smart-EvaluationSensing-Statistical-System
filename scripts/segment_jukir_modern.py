"""
Modern jukir segmentation (GMM vs HDBSCAN) with silhouette-based model selection.

No schema-breaking changes:
- Store assignments in existing JukirCluster table
- Noise (HDBSCAN) stored as clusterLabel = -1
- isNoise exposed in JSON/API as derived flag (clusterLabel == -1)
"""

import json
import os
import sys
import uuid
from datetime import datetime, timedelta
from typing import Dict, Tuple

import hdbscan
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sklearn.metrics import silhouette_score
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler
from sqlalchemy import create_engine, text


backend_env = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
load_dotenv(backend_env)
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and "?schema=" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.split("?schema=")[0]

if not DATABASE_URL:
    print("❌ DATABASE_URL not set in backend/.env")
    sys.exit(1)

engine = create_engine(DATABASE_URL)


def query_jukir_metrics(days_back: int = 90) -> pd.DataFrame:
    query = f"""
    SELECT
      u."id",
      u."name",
      COUNT(DISTINCT a."date")::int AS attendance_days,
      AVG(EXTRACT(EPOCH FROM (a."jamPulang" - a."jamDatang")) / 3600.0)::double precision AS avg_daily_work_hours,
      STDDEV_POP(EXTRACT(EPOCH FROM (a."jamPulang" - a."jamDatang")) / 3600.0)::double precision AS stddev_daily_work_hours,
      SUM(CASE WHEN t."amount" IS NOT NULL THEN t."amount" ELSE 0 END)::double precision AS total_earnings,
      COUNT(CASE
        WHEN a."jamDatang"::TIME <= (a."jadwalMasuk"::TIME + INTERVAL '15 minutes')
        THEN 1
      END)::double precision AS on_time_days,
      COALESCE(COUNT(DISTINCT a."date"), 0)::double precision AS total_attendance_days
    FROM "User" u
    LEFT JOIN "Attendance" a
      ON u."id" = a."jukirId"
      AND a."date" >= CURRENT_DATE - INTERVAL '{days_back} days'
    LEFT JOIN "transaction" t
      ON u."id" = t."jukirId"
      AND t."status" = 'COMPLETED'
      AND DATE(t."checkIn") >= CURRENT_DATE - INTERVAL '{days_back} days'
    WHERE u."role" = 'JUKIR'
    GROUP BY u."id", u."name"
    ORDER BY u."id"
    """
    return pd.read_sql_query(query, engine)


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["daily_earnings"] = out.apply(
        lambda r: (r["total_earnings"] / r["attendance_days"]) if r["attendance_days"] and r["attendance_days"] > 0 else 0,
        axis=1,
    )
    out["work_consistency"] = out["stddev_daily_work_hours"].fillna(0.0)
    out["punctuality_percent"] = out.apply(
        lambda r: (r["on_time_days"] / r["total_attendance_days"] * 100)
        if r["total_attendance_days"] and r["total_attendance_days"] > 0
        else 0,
        axis=1,
    ).clip(lower=0, upper=100)
    return out


def score_silhouette(X: np.ndarray, labels: np.ndarray) -> float:
    unique = np.unique(labels)
    if len(unique) < 2:
        return -1.0
    return float(silhouette_score(X, labels))


def run_gmm(X_scaled: np.ndarray, k_min: int = 2, k_max: int = 6) -> Tuple[np.ndarray, np.ndarray, Dict[int, float], float, int]:
    n = X_scaled.shape[0]
    k_max = max(k_min, min(k_max, n - 1))
    bic_scores: Dict[int, float] = {}
    models: Dict[int, GaussianMixture] = {}

    for k in range(k_min, k_max + 1):
        g = GaussianMixture(n_components=k, random_state=42, n_init=10)
        g.fit(X_scaled)
        bic_scores[k] = float(g.bic(X_scaled))
        models[k] = g

    best_k = min(bic_scores, key=bic_scores.get)
    final = models[best_k]
    labels = final.fit_predict(X_scaled).astype(int)
    probs = final.predict_proba(X_scaled).max(axis=1).astype(float)
    sil = score_silhouette(X_scaled, labels)
    return labels, probs, bic_scores, sil, int(best_k)


def run_hdbscan(X_scaled: np.ndarray, min_cluster_size: int = 4) -> Tuple[np.ndarray, np.ndarray, float, int]:
    clusterer = hdbscan.HDBSCAN(min_cluster_size=min_cluster_size, min_samples=1)
    labels = clusterer.fit_predict(X_scaled).astype(int)
    probs = np.asarray(clusterer.probabilities_, dtype=float)

    mask = labels != -1
    unique_non_noise = np.unique(labels[mask]) if np.any(mask) else np.array([])
    if np.sum(mask) >= 2 and len(unique_non_noise) >= 2:
        sil = float(silhouette_score(X_scaled[mask], labels[mask]))
    else:
        sil = -1.0

    noise_count = int(np.sum(labels == -1))
    return labels, probs, sil, noise_count


def save_to_db(df: pd.DataFrame, labels: np.ndarray, probs: np.ndarray, days_back: int) -> None:
    today = datetime.now().date()
    analyzed_from = today - timedelta(days=days_back)

    records = []
    for i, row in df.iterrows():
        records.append(
            {
                "id": str(uuid.uuid4()),
                "jukirId": row["id"],
                "clusterLabel": int(labels[i]),
                "gmmProbability": float(np.clip(probs[i], 0.0, 1.0)),
                "dailyEarnings": float(row["daily_earnings"]),
                "workConsistency": float(row["work_consistency"]),
                "punctualityPercent": float(row["punctuality_percent"]),
                "analyzedFrom": str(analyzed_from),
                "analyzedTo": str(today),
            }
        )

    with engine.connect() as conn:
        conn.execute(text("DELETE FROM \"JukirCluster\" WHERE \"analyzedTo\" = CAST(:d AS date)"), {"d": str(today)})
        for r in records:
            conn.execute(
                text(
                    """
                    INSERT INTO "JukirCluster"
                    (id, "jukirId", "clusterLabel", "gmmProbability", "dailyEarnings", "workConsistency",
                     "punctualityPercent", "analyzedFrom", "analyzedTo", "createdAt", "updatedAt")
                    VALUES
                    (CAST(:id AS uuid), CAST(:jukirId AS uuid), :clusterLabel, :gmmProbability,
                     :dailyEarnings, :workConsistency, :punctualityPercent,
                     CAST(:analyzedFrom AS date), CAST(:analyzedTo AS date), NOW(), NOW())
                    """
                ),
                r,
            )
        conn.commit()


def main() -> None:
    print("=" * 70)
    print("MODERN SEGMENTATION (GMM vs HDBSCAN)")
    print("=" * 70)

    days_back = 90
    raw = query_jukir_metrics(days_back=days_back)
    if raw.empty or len(raw) < 3:
        print("❌ Tidak cukup data jukir untuk segmentasi")
        sys.exit(1)

    df = build_features(raw)
    feature_cols = ["daily_earnings", "work_consistency", "punctuality_percent"]
    X = df[feature_cols].fillna(0.0).values
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    gmm_labels, gmm_probs, bic_scores, gmm_sil, gmm_k = run_gmm(X_scaled)
    hdb_labels, hdb_probs, hdb_sil, hdb_noise = run_hdbscan(X_scaled, min_cluster_size=4)

    selected_model = "gmm" if gmm_sil >= hdb_sil else "hdbscan"
    selected_labels = gmm_labels if selected_model == "gmm" else hdb_labels
    selected_probs = gmm_probs if selected_model == "gmm" else hdb_probs

    save_to_db(df, selected_labels, selected_probs, days_back=days_back)

    today = datetime.now().date().isoformat()
    payload = {
        "analyzed_date": today,
        "analysis_window_days": days_back,
        "selected_model": selected_model,
        "model_comparison": {
            "gmm": {
                "silhouette": float(gmm_sil),
                "optimal_clusters": int(gmm_k),
                "bic_scores": {str(k): float(v) for k, v in bic_scores.items()},
            },
            "hdbscan": {
                "silhouette": float(hdb_sil),
                "noise_count": int(hdb_noise),
                "min_cluster_size": 4,
            },
        },
        "noise_rule": "clusterLabel = -1 => isNoise=true",
        "jukir_assignments": [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "cluster": int(selected_labels[i]),
                "isNoise": bool(int(selected_labels[i]) == -1),
                "confidence": float(np.clip(selected_probs[i], 0.0, 1.0)),
                "daily_earnings": float(r["daily_earnings"]),
                "work_consistency": float(r["work_consistency"]),
                "punctuality_percent": float(r["punctuality_percent"]),
            }
            for i, r in df.iterrows()
        ],
    }

    with open("jukir_clusters.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    print("✓ jukir_clusters.json")

    pd.DataFrame(payload["jukir_assignments"]).to_csv("cluster_summary.csv", index=False)
    print("✓ cluster_summary.csv")

    print(
        f"✓ selected_model={selected_model} | "
        f"silhouette(gmm)={gmm_sil:.4f} silhouette(hdbscan)={hdb_sil:.4f} | noise={hdb_noise}"
    )
    print("=" * 70)
    print("✅ MODERN SEGMENTATION COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
