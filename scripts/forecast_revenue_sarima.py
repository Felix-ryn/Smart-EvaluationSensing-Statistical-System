"""
SARIMA Revenue Forecast Script
- Forecast monthly revenue per 3 months (90 days)
- SARIMA(1,1,1)×(0,1,0)₇ model (weekly seasonality)
- Per-area breakdown + total aggregation
- 95% confidence intervals
- Output: JSON, CSV, PNG visualization
"""

import os
import sys
from datetime import datetime, timedelta
import json
import pandas as pd
import numpy as np
from sqlalchemy import create_engine, text
from statsmodels.tsa.statespace.sarimax import SARIMAX
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


def query_daily_revenue(days_back=180):
    """
    Query daily revenue from SetoranEntry table (Approved settlements only).
    Returns: DataFrame with date, areaId, area_name, total_amount, active_jukir_count
    
    Note: Using SetoranEntry instead of Transaction for cleaner, aggregated data
    """
    print("📊 Querying daily revenue from SetoranEntry...")
    
    query = f"""
    SELECT 
        DATE(s."date") as date,
        s."areaId",
        a."name" as area_name,
        COALESCE(SUM(COALESCE(s."jukirShareAmount", 0) + COALESCE(s."taxAmount", 0)), 0) as total_amount,
        COUNT(DISTINCT s."jukirId") as active_jukir_count
    FROM "SetoranEntry" s
    JOIN "ParkingArea" a ON s."areaId" = a."id"
    WHERE s."status" = 'APPROVED'
        AND DATE(s."date") >= CURRENT_DATE - INTERVAL '{days_back} days'
    GROUP BY DATE(s."date"), s."areaId", a."name"
    ORDER BY date, s."areaId"
    """
    
    try:
        df = pd.read_sql_query(query, engine)
        df['date'] = pd.to_datetime(df['date'])
        # Ensure numeric columns
        df['total_amount'] = pd.to_numeric(df['total_amount'], errors='coerce')
        df['transaction_count'] = pd.to_numeric(df['transaction_count'], errors='coerce')
        print(f"  ✓ Loaded {len(df)} daily revenue records")
        return df
    except Exception as e:
        print(f"❌ Error querying revenue: {e}")
        sys.exit(1)


def fit_sarima_forecast(timeseries, area_name, order=(1, 1, 1), seasonal_order=(0, 1, 0, 7), forecast_steps=90):
    """
    Fit SARIMA model and forecast.
    Returns: dict with forecast, model stats, or None if failed
    """
    try:
        # Fit SARIMA model
        model = SARIMAX(
            timeseries,
            order=order,
            seasonal_order=seasonal_order,
            enforce_stationarity=False,
            enforce_invertibility=False,
        )
        results = model.fit(disp=False, maxiter=500)
        
        # Forecast
        forecast = results.get_forecast(steps=forecast_steps)
        forecast_df = forecast.summary_frame(alpha=0.05)  # 95% CI
        
        return {
            'model': results,
            'forecast': forecast_df,
            'aic': results.aic,
            'bic': results.bic,
            'rmse': np.sqrt(results.mse),
        }
    except Exception as e:
        print(f"  ⚠️  SARIMA fit failed for {area_name}: {e}")
        return None


def forecast_revenue():
    """
    Main forecast pipeline.
    1. Query daily revenue (last 180 days)
    2. Fit SARIMA per area
    3. Forecast 90 days
    4. Aggregate and save outputs
    """
    print("\n" + "="*70)
    print("REVENUE FORECAST - SARIMA(1,1,1)×(0,1,0)₇")
    print("="*70)
    
    # Query data
    revenue_df = query_daily_revenue(days_back=180)
    
    if revenue_df.empty:
        print("❌ No transaction data found")
        sys.exit(1)
    
    # Get unique areas
    areas = revenue_df['areaId'].unique()
    print(f"\n🏢 Found {len(areas)} parking areas")
    
    forecasts = {}
    base_date = datetime.now().date()
    forecast_dates = pd.date_range(
        base_date + timedelta(days=1),
        periods=90,
        freq='D'
    )
    
    # Forecast per area
    for area_id in sorted(areas):
        area_data = revenue_df[revenue_df['areaId'] == area_id].copy()
        area_name = area_data['area_name'].iloc[0]
        
        # Sort by date
        area_data = area_data.sort_values('date').set_index('date')
        
        # Resample to daily (fill missing with 0)
        if len(area_data) > 0:
            date_range = pd.date_range(area_data.index.min(), area_data.index.max(), freq='D')
            area_data = area_data.reindex(date_range, fill_value=0)
            
            # Convert to numeric to avoid type issues
            area_data['total_amount'] = pd.to_numeric(area_data['total_amount'], errors='coerce').fillna(0)
            
            print(f"\n📈 Forecasting: {area_name}")
            print(f"  Data points: {len(area_data)}")
        else:
            print(f"\n⚠️  Skipping {area_name}: No data available")
            continue
        
        # Fit SARIMA
        result = fit_sarima_forecast(area_data['total_amount'], area_name)
        
        if result:
            forecast_values = result['forecast']['mean'].values
            lower_ci = result['forecast']['mean_ci_lower'].values
            upper_ci = result['forecast']['mean_ci_upper'].values
            
            # Ensure non-negative forecasts
            forecast_values = np.maximum(forecast_values, 0)
            lower_ci = np.maximum(lower_ci, 0)
            upper_ci = np.maximum(upper_ci, 0)
            
            forecasts[area_id] = {
                'area_name': area_name,
                'model_aic': float(result['aic']),
                'model_bic': float(result['bic']),
                'model_rmse': float(result['rmse']),
                'forecast': [
                    {
                        'date': date.strftime('%Y-%m-%d'),
                        'lower': float(lower),
                        'point': float(point),
                        'upper': float(upper),
                    }
                    for date, point, lower, upper in zip(
                        forecast_dates, forecast_values, lower_ci, upper_ci
                    )
                ]
            }
            print(f"  ✓ Forecast: {forecast_values[0]:,.0f} - {forecast_values[-1]:,.0f} Rp")
        else:
            print(f"  ❌ Failed to forecast {area_name}")
    
    # Aggregate total
    print(f"\n📊 Aggregating total forecast...")
    total_forecast = []
    for i in range(90):
        point_sum = sum(
            f['forecast'][i]['point']
            for f in forecasts.values() if i < len(f['forecast'])
        )
        lower_sum = sum(
            f['forecast'][i]['lower']
            for f in forecasts.values() if i < len(f['forecast'])
        )
        upper_sum = sum(
            f['forecast'][i]['upper']
            for f in forecasts.values() if i < len(f['forecast'])
        )
        total_forecast.append({
            'date': (base_date + timedelta(days=i+1)).strftime('%Y-%m-%d'),
            'lower': max(0, lower_sum),
            'point': max(0, point_sum),
            'upper': max(0, upper_sum),
        })
    
    forecasts['TOTAL'] = {
        'area_name': 'Total All Areas',
        'forecast': total_forecast
    }
    
    # Save outputs
    print(f"\n💾 Saving outputs...")
    
    # JSON
    with open('forecast_revenue_3months.json', 'w') as f:
        json.dump(forecasts, f, indent=2)
    print("  ✓ forecast_revenue_3months.json")
    
    # CSV
    csv_data = []
    for area_id, forecast_data in forecasts.items():
        for point in forecast_data['forecast']:
            csv_data.append({
                'area_id': area_id,
                'area_name': forecast_data['area_name'],
                'date': point['date'],
                'lower_ci': point['lower'],
                'forecast': point['point'],
                'upper_ci': point['upper'],
            })
    
    csv_df = pd.DataFrame(csv_data)
    csv_df.to_csv('forecast_revenue_3months.csv', index=False)
    print("  ✓ forecast_revenue_3months.csv")
    
    # Visualization
    fig, axes = plt.subplots(2, 1, figsize=(14, 8))
    
    # Plot 1: Total forecast with CI
    ax = axes[0]
    total_data = forecasts['TOTAL']['forecast']
    dates = [datetime.strptime(p['date'], '%Y-%m-%d') for p in total_data]
    points = [p['point'] for p in total_data]
    lowers = [p['lower'] for p in total_data]
    uppers = [p['upper'] for p in total_data]
    
    ax.plot(dates, points, 'b-', linewidth=2, label='Forecast')
    ax.fill_between(dates, lowers, uppers, alpha=0.3, label='95% CI')
    ax.set_title('Total Revenue Forecast - 3 Months', fontsize=12, fontweight='bold')
    ax.set_ylabel('Revenue (Rp)')
    ax.legend()
    ax.grid(True, alpha=0.3)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'Rp {x/1e6:.1f}M'))
    
    # Plot 2: Per-area comparison (last day of forecast)
    ax = axes[1]
    area_last_values = []
    area_names = []
    for area_id, forecast_data in forecasts.items():
        if area_id != 'TOTAL':
            last_value = forecast_data['forecast'][-1]['point']
            area_last_values.append(last_value)
            area_names.append(forecast_data['area_name'][:15])  # Truncate long names
    
    if area_last_values:
        colors = plt.cm.Set3(np.linspace(0, 1, len(area_last_values)))
        ax.barh(area_names, area_last_values, color=colors)
        ax.set_title('Day 90 Forecast by Area', fontsize=12, fontweight='bold')
        ax.set_xlabel('Revenue (Rp)')
        ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, p: f'Rp {x/1e6:.1f}M'))
    
    plt.tight_layout()
    plt.savefig('forecast_plot.png', dpi=300, bbox_inches='tight')
    plt.close()
    print("  ✓ forecast_plot.png")
    
    # Summary
    print("\n" + "="*70)
    print("✅ FORECAST COMPLETE")
    print("="*70)
    print(f"Forecasted areas: {len(forecasts) - 1}")
    print(f"Forecast period: 90 days (3 months)")
    print(f"Total forecast (day 90): Rp {total_forecast[-1]['point']:,.0f}")
    print(f"Total range: Rp {total_forecast[-1]['lower']:,.0f} - Rp {total_forecast[-1]['upper']:,.0f}")
    print("\nOutputs:")
    print("  - forecast_revenue_3months.json")
    print("  - forecast_revenue_3months.csv")
    print("  - forecast_plot.png")
    print("="*70 + "\n")


if __name__ == "__main__":
    forecast_revenue()
