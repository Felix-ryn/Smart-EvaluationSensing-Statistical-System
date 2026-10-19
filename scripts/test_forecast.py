"""
Simplified SARIMA forecast test - generates synthetic forecast data
"""
import json
from datetime import datetime, timedelta
import os

# Create synthetic forecast data
print("=" * 70)
print("SARIMA FORECAST - TEST VERSION (Synthetic Data)")
print("=" * 70)

base_date = datetime.now().date()
forecasts = {}

# Generate for 3 areas
areas = [
    {'id': 'area-1', 'name': 'Area Kampus A'},
    {'id': 'area-2', 'name': 'Area Pusat Kota'},
    {'id': 'area-3', 'name': 'Area Mall Plaza'},
]

for area in areas:
    print(f"\n📈 Forecasting: {area['name']}")
    forecast_values = []
    
    # Generate 90-day forecast with slight growth trend
    base_value = 1000000  # Rp 1 juta per hari
    for day in range(90):
        point = base_value * (1 + 0.03 * (day / 90))  # 3% growth
        lower = point * 0.8  # 80% confidence lower
        upper = point * 1.2  # 120% confidence upper
        
        forecast_values.append({
            'date': (base_date + timedelta(days=day+1)).strftime('%Y-%m-%d'),
            'lower': int(lower),
            'point': int(point),
            'upper': int(upper),
        })
    
    forecasts[area['id']] = {
        'area_name': area['name'],
        'model_aic': 100.5,
        'model_bic': 110.2,
        'model_rmse': 50000,
        'forecast': forecast_values
    }

# Aggregate total
total_forecast = []
for i in range(90):
    total_point = sum(f['forecast'][i]['point'] for f in forecasts.values())
    total_lower = sum(f['forecast'][i]['lower'] for f in forecasts.values())
    total_upper = sum(f['forecast'][i]['upper'] for f in forecasts.values())
    
    total_forecast.append({
        'date': (base_date + timedelta(days=i+1)).strftime('%Y-%m-%d'),
        'lower': int(total_lower),
        'point': int(total_point),
        'upper': int(total_upper),
    })

forecasts['TOTAL'] = {
    'area_name': 'Total All Areas',
    'forecast': total_forecast
}

# Save JSON
with open('forecast_revenue_3months.json', 'w') as f:
    json.dump(forecasts, f, indent=2)
print("  ✓ forecast_revenue_3months.json")

# Save CSV
import csv
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

with open('forecast_revenue_3months.csv', 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=['area_id', 'area_name', 'date', 'lower_ci', 'forecast', 'upper_ci'])
    writer.writeheader()
    writer.writerows(csv_data)
print("  ✓ forecast_revenue_3months.csv")

# Create simple PNG plot
try:
    import matplotlib.pyplot as plt
    
    fig, ax = plt.subplots(figsize=(12, 6))
    total_data = forecasts['TOTAL']['forecast']
    dates = [datetime.strptime(p['date'], '%Y-%m-%d') for p in total_data]
    points = [p['point'] / 1e6 for p in total_data]  # Convert to millions
    lowers = [p['lower'] / 1e6 for p in total_data]
    uppers = [p['upper'] / 1e6 for p in total_data]
    
    ax.plot(dates, points, 'b-', linewidth=2, label='Forecast')
    ax.fill_between(dates, lowers, uppers, alpha=0.3, label='95% CI')
    ax.set_xlabel('Date')
    ax.set_ylabel('Revenue (Rp Millions)')
    ax.set_title('Total Revenue Forecast - 3 Months')
    ax.legend()
    ax.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig('forecast_plot.png', dpi=100, bbox_inches='tight')
    plt.close()
    print("  ✓ forecast_plot.png")
except ImportError:
    print("  ⚠️  matplotlib not available, skipping PNG")

print("\n" + "=" * 70)
print("✅ FORECAST COMPLETE")
print("=" * 70)
print(f"Forecasted areas: {len(forecasts) - 1}")
print(f"Forecast period: 90 days (3 months)")
print(f"Total forecast (day 90): Rp {total_forecast[-1]['point']:,}")
print("\nOutputs:")
print("  - forecast_revenue_3months.json")
print("  - forecast_revenue_3months.csv")
print("  - forecast_plot.png")
print("=" * 70 + "\n")
