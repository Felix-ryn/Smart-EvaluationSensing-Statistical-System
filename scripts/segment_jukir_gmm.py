"""
Jukir Performance Segmentation - Gaussian Mixture Model
- Query jukir metrics (last 90 days): earnings, work consistency, punctuality
- Fit GMM with 2-6 clusters
- Select optimal via BIC (Bayesian Information Criterion)
- Save cluster assignments to JukirCluster table
- Output: JSON, CSV, PNG (BIC curve)

NOTE: Performance labels are NOT stored in DB (integrity rule)
Labels are only for reporting/visualization
"""

import os
import sys
from datetime import datetime, timedelta
import json
import uuid
import pandas as pd
import numpy as np
from sqlalchemy import create_engine, text
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler
import matplotlib.pyplot as plt
import seaborn as sns
from dotenv import load_dotenv

# Setup
backend_env = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
load_dotenv(backend_env)
DATABASE_URL = os.getenv("DATABASE_URL")
# Remove schema parameter for psycopg3 compatibility
if DATABASE_URL and "?schema=" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.split("?schema=")[0]

if not DATABASE_URL:
    print("❌ DATABASE_URL not set in .env")
    sys.exit(1)

engine = create_engine(DATABASE_URL)
sns.set_style("whitegrid")


def query_jukir_metrics(days_back=90):
    """
    Query jukir performance metrics for last N days.
    Returns: DataFrame with jukir metrics for clustering
    """
    print("📊 Querying jukir metrics...")
    
    query = f"""
    SELECT 
        u."id",
        u."name",
        COUNT(DISTINCT a."date") as attendance_days,
        AVG(EXTRACT(EPOCH FROM (a."jamPulang" - a."jamDatang")) / 3600.0) as avg_daily_work_hours,
        STDDEV_POP(EXTRACT(EPOCH FROM (a."jamPulang" - a."jamDatang")) / 3600.0) as stddev_daily_work_hours,
        SUM(CASE WHEN t."amount" IS NOT NULL THEN t."amount" ELSE 0 END) as total_earnings,
        COUNT(CASE 
            WHEN a."jamDatang"::TIME <= 
                 (a."jadwalMasuk"::TIME + INTERVAL '15 minutes') 
            THEN 1 
        END)::float as on_time_days,
        COALESCE(COUNT(DISTINCT a."date"), 0) as total_attendance_days
    FROM "User" u
    LEFT JOIN "Attendance" a ON u."id" = a."jukirId" 
        AND a."date" >= CURRENT_DATE - INTERVAL '{days_back} days'
    LEFT JOIN "transaction" t ON u."id" = t."jukirId"
        AND t."status" = 'COMPLETED'
        AND DATE(t."checkIn") >= CURRENT_DATE - INTERVAL '{days_back} days'
    WHERE u."role" = 'JUKIR'
    GROUP BY u."id", u."name"
    ORDER BY u."id"
    """
    
    try:
        df = pd.read_sql_query(query, engine)
        print(f"  ✓ Loaded metrics for {len(df)} jukir users")
        return df
    except Exception as e:
        print(f"❌ Error querying jukir metrics: {e}")
        sys.exit(1)


def calculate_performance_metrics(jukir_df):
    """
    Calculate clustering features from raw metrics.
    Returns: DataFrame with features for GMM
    """
    print("🔧 Calculating performance metrics...")
    
    # Daily earnings (total earnings / attendance days, avoid division by zero)
    jukir_df['daily_earnings'] = jukir_df.apply(
        lambda row: (row['total_earnings'] / row['attendance_days']) 
                    if row['attendance_days'] > 0 else 0,
        axis=1
    )
    
    # Work consistency (std dev of daily work hours, fill NaN with 0)
    jukir_df['work_consistency'] = jukir_df['stddev_daily_work_hours'].fillna(0)
    
    # Punctuality percentage (on-time / total, handle division by zero)
    jukir_df['punctuality_percent'] = jukir_df.apply(
        lambda row: (row['on_time_days'] / row['total_attendance_days'] * 100) 
                    if row['total_attendance_days'] > 0 else 0,
        axis=1
    ).clip(lower=0, upper=100)
    
    print(f"  ✓ Metrics calculated")
    print(f"    - Daily earnings range: Rp {jukir_df['daily_earnings'].min():,.0f} - Rp {jukir_df['daily_earnings'].max():,.0f}")
    print(f"    - Punctuality range: {jukir_df['punctuality_percent'].min():.1f}% - {jukir_df['punctuality_percent'].max():.1f}%")
    
    return jukir_df


def fit_gmm_clustering(X_scaled, max_clusters=6):
    """
    Fit GMM with different cluster sizes and select optimal via BIC.
    Returns: (optimal_k, bic_scores, gmm_final, cluster_labels, cluster_probs)
    """
    print("🎯 Fitting GMM models...")
    
    bic_scores = {}
    gmm_models = {}
    
    # Limit max clusters to number of samples
    n_samples = X_scaled.shape[0]
    max_clusters = min(max_clusters, n_samples - 1)
    
    for n_clusters in range(2, max_clusters + 1):
        print(f"  Testing {n_clusters} clusters...", end=" ")
        gmm = GaussianMixture(n_components=n_clusters, random_state=42, n_init=10)
        gmm.fit(X_scaled)
        bic = gmm.bic(X_scaled)
        bic_scores[n_clusters] = bic
        gmm_models[n_clusters] = gmm
        print(f"BIC = {bic:.1f}")
    
    # Select optimal via lowest BIC
    optimal_k = min(bic_scores, key=bic_scores.get)
    gmm_final = gmm_models[optimal_k]
    
    # Predict clusters
    cluster_labels = gmm_final.fit_predict(X_scaled)
    cluster_probs = gmm_final.predict_proba(X_scaled).max(axis=1)
    
    print(f"\n✓ Optimal clusters: {optimal_k} (BIC = {bic_scores[optimal_k]:.1f})")
    
    return optimal_k, bic_scores, gmm_final, cluster_labels, cluster_probs


def get_performance_label(daily_earnings, work_consistency, punctuality, cluster):
    """
    Assign human-readable performance label.
    NOTE: NOT stored in database - only for reporting/visualization
    
    Labels are heuristic-based on metrics:
    - Tinggi (Excellent): High earnings, high punctuality, low inconsistency
    - Stabil (Good): Moderate earnings, good punctuality
    - Perlu Pendampingan (Needs Support): Low earnings, low punctuality
    """
    # High performers: >5.5jt/hari, >90% punctuality
    if daily_earnings > 5500000 and punctuality > 90:
        return "Tinggi (Excellent)"
    # Good: >3.5jt/hari, >75% punctuality
    elif daily_earnings > 3500000 and punctuality > 75:
        return "Stabil (Good)"
    # Needs support: <4jt/hari or <70% punctuality
    elif daily_earnings < 4000000 or punctuality < 70:
        return "Perlu Pendampingan (Needs Support)"
    # Default: Stabil
    else:
        return "Stabil (Good)"


def segment_jukir():
    """
    Main GMM segmentation pipeline.
    """
    print("\n" + "="*70)
    print("JUKIR PERFORMANCE SEGMENTATION - GMM")
    print("="*70)
    
    # Query metrics
    jukir_df = query_jukir_metrics(days_back=90)
    
    if len(jukir_df) < 3:
        print("❌ Not enough jukir data for clustering (need at least 3)")
        sys.exit(1)
    
    print(f"\n👥 Jukir users: {len(jukir_df)}")
    
    # Calculate features
    jukir_df = calculate_performance_metrics(jukir_df)
    
    # Prepare feature matrix
    feature_cols = ['daily_earnings', 'work_consistency', 'punctuality_percent']
    X = jukir_df[feature_cols].fillna(0).values
    
    # Normalize (important for GMM)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    # Fit GMM and select optimal clusters
    optimal_k, bic_scores, gmm_final, cluster_labels, cluster_probs = fit_gmm_clustering(X_scaled, max_clusters=6)
    
    # Add cluster assignments to dataframe
    jukir_df['cluster'] = cluster_labels
    jukir_df['gmm_probability'] = cluster_probs
    
    # Save to database
    print("\n💾 Saving cluster assignments to database...")
    today = datetime.now().date()
    analysis_start = today - timedelta(days=90)
    
    # Prepare records for insertion
    insert_records = []
    for _, row in jukir_df.iterrows():
        insert_records.append({
            'id': str(uuid.uuid4()),
            'jukirId': row['id'],
            'clusterLabel': int(row['cluster']),
            'gmmProbability': float(row['gmm_probability']),
            'dailyEarnings': float(row['daily_earnings']),
            'workConsistency': float(row['work_consistency']),
            'punctualityPercent': float(row['punctuality_percent']),
            'analyzedFrom': analysis_start,
            'analyzedTo': today,
            'createdAt': datetime.now(),
            'updatedAt': datetime.now(),
        })
    
    # Delete old records for same analyzedTo date (upsert logic)
    try:
        with engine.connect() as conn:
            conn.execute(
                text(f"DELETE FROM \"JukirCluster\" WHERE \"analyzedTo\" = '{today}'::DATE")
            )
            conn.commit()
    except Exception as e:
        print(f"⚠️  Warning: Could not delete old records: {e}")
    
    # Insert new records using direct SQL with proper type casting
    try:
        with engine.connect() as conn:
            for record in insert_records:
                conn.execute(text("""
                    INSERT INTO "JukirCluster" 
                    (id, "jukirId", "clusterLabel", "gmmProbability", "dailyEarnings", "workConsistency", 
                     "punctualityPercent", "analyzedFrom", "analyzedTo", "createdAt", "updatedAt")
                    VALUES 
                    (CAST(:id AS uuid), CAST(:jukirId AS uuid), :clusterLabel, :gmmProbability, 
                     :dailyEarnings, :workConsistency, :punctualityPercent,
                     CAST(:analyzedFrom AS date), CAST(:analyzedTo AS date), :createdAt, :updatedAt)
                """), {
                    'id': record['id'],
                    'jukirId': record['jukirId'],
                    'clusterLabel': record['clusterLabel'],
                    'gmmProbability': record['gmmProbability'],
                    'dailyEarnings': record['dailyEarnings'],
                    'workConsistency': record['workConsistency'],
                    'punctualityPercent': record['punctualityPercent'],
                    'analyzedFrom': str(record['analyzedFrom']),
                    'analyzedTo': str(record['analyzedTo']),
                    'createdAt': record['createdAt'],
                    'updatedAt': record['updatedAt']
                })
            conn.commit()
        print(f"  ✓ Saved {len(insert_records)} cluster assignments")
    except Exception as e:
        print(f"❌ Error saving to database: {e}")
        sys.exit(1)
    
    # JSON output (with performance labels for reporting)
    print("\n📝 Generating reports...")
    cluster_output = {
        'analyzed_date': today.isoformat(),
        'analysis_window_days': 90,
        'optimal_clusters': optimal_k,
        'bic_scores': {str(k): float(v) for k, v in bic_scores.items()},
        'jukir_assignments': [
            {
                'id': str(row['id']),
                'name': row['name'],
                'cluster': int(row['cluster']),
                'confidence': float(row['gmm_probability']),
                'daily_earnings': float(row['daily_earnings']),
                'work_consistency': float(row['work_consistency']),
                'punctuality_percent': float(row['punctuality_percent']),
                'attendance_days': int(row['attendance_days']),
                'total_earnings': float(row['total_earnings']),
                # Performance label (NOT in DB, only for reporting)
                'performance_label': get_performance_label(
                    row['daily_earnings'],
                    row['work_consistency'],
                    row['punctuality_percent'],
                    row['cluster']
                ),
            }
            for _, row in jukir_df.iterrows()
        ]
    }
    
    # Save JSON
    with open('jukir_clusters.json', 'w') as f:
        json.dump(cluster_output, f, indent=2)
    print("  ✓ jukir_clusters.json")
    
    # Save CSV summary per cluster
    cluster_summary = jukir_df.groupby('cluster').agg({
        'daily_earnings': ['count', 'mean', 'std', 'min', 'max'],
        'work_consistency': ['mean', 'std'],
        'punctuality_percent': ['mean', 'std'],
        'attendance_days': 'mean',
    }).round(2)
    
    cluster_summary.to_csv('cluster_summary.csv')
    print("  ✓ cluster_summary.csv")
    
    # Visualization: BIC curve
    fig, ax = plt.subplots(figsize=(10, 6))
    
    clusters = sorted(bic_scores.keys())
    scores = [bic_scores[k] for k in clusters]
    
    ax.plot(clusters, scores, 'b-o', linewidth=2, markersize=10, label='BIC Score')
    ax.axvline(x=optimal_k, color='r', linestyle='--', linewidth=2, label=f'Optimal: {optimal_k} clusters')
    
    # Highlight optimal point
    ax.plot(optimal_k, bic_scores[optimal_k], 'r*', markersize=20)
    
    ax.set_xlabel('Number of Clusters', fontsize=12)
    ax.set_ylabel('BIC Score', fontsize=12)
    ax.set_title('GMM Cluster Selection - BIC Analysis', fontsize=14, fontweight='bold')
    ax.legend(fontsize=11)
    ax.grid(True, alpha=0.3)
    ax.set_xticks(clusters)
    
    plt.tight_layout()
    plt.savefig('bic_analysis.png', dpi=300, bbox_inches='tight')
    plt.close()
    print("  ✓ bic_analysis.png")
    
    # Cluster distribution visualization
    fig, axes = plt.subplots(1, 3, figsize=(15, 4))
    
    # Plot 1: Cluster distribution
    cluster_counts = jukir_df['cluster'].value_counts().sort_index()
    axes[0].bar(cluster_counts.index, cluster_counts.values, color='steelblue')
    axes[0].set_xlabel('Cluster')
    axes[0].set_ylabel('Number of Jukir')
    axes[0].set_title('Jukir Distribution by Cluster')
    axes[0].set_xticks(range(optimal_k))
    
    # Plot 2: Daily earnings by cluster
    jukir_df.boxplot(column='daily_earnings', by='cluster', ax=axes[1])
    axes[1].set_xlabel('Cluster')
    axes[1].set_ylabel('Daily Earnings (Rp)')
    axes[1].set_title('Daily Earnings by Cluster')
    axes[1].yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'{x/1e6:.1f}M'))
    plt.sca(axes[1])
    plt.xticks(range(1, optimal_k + 1), range(optimal_k))
    
    # Plot 3: Punctuality by cluster
    jukir_df.boxplot(column='punctuality_percent', by='cluster', ax=axes[2])
    axes[2].set_xlabel('Cluster')
    axes[2].set_ylabel('Punctuality (%)')
    axes[2].set_title('Punctuality by Cluster')
    axes[2].set_xticks(range(1, optimal_k + 1), range(optimal_k))
    
    plt.suptitle('')  # Remove default title
    plt.tight_layout()
    plt.savefig('cluster_analysis.png', dpi=300, bbox_inches='tight')
    plt.close()
    print("  ✓ cluster_analysis.png")
    
    # Summary statistics
    print("\n" + "="*70)
    print("✅ SEGMENTATION COMPLETE")
    print("="*70)
    print(f"Total jukir analyzed: {len(jukir_df)}")
    print(f"Optimal clusters: {optimal_k}")
    print(f"Analysis period: {analysis_start.isoformat()} to {today.isoformat()}")
    print(f"\nCluster distribution:")
    for cluster_id in range(optimal_k):
        count = (jukir_df['cluster'] == cluster_id).sum()
        avg_earnings = jukir_df[jukir_df['cluster'] == cluster_id]['daily_earnings'].mean()
        avg_punctuality = jukir_df[jukir_df['cluster'] == cluster_id]['punctuality_percent'].mean()
        print(f"  Cluster {cluster_id}: {count} jukir | Earnings: Rp {avg_earnings:,.0f}/hari | Punctuality: {avg_punctuality:.1f}%")
    
    print(f"\nOutputs:")
    print(f"  - jukir_clusters.json")
    print(f"  - cluster_summary.csv")
    print(f"  - bic_analysis.png")
    print(f"  - cluster_analysis.png")
    print(f"  - Database: JukirCluster table ({len(insert_records)} records)")
    print("="*70 + "\n")


if __name__ == "__main__":
    segment_jukir()
