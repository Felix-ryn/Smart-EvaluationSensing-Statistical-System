"""
Modern revenue forecasting (XGBoost vs Prophet).

Rules implemented:
- Daily revenue source: Transaction.amount (status COMPLETED)
- Features for XGBoost: lag(1,7,14), rolling_mean_7, day_of_week, is_weekend, is_holiday(ID)
- Prophet: daily ds/y, weekly seasonality, Indonesia holidays
- Split test: priority 20% tail, fallback 30 days (if available)
- Select best model by lower MAPE
- Output remains backward-compatible for dashboard + extended metadata
"""

import json
import os
import sys
from datetime import date, datetime, timedelta
from typing import Dict, List, Tuple

import holidays
import numpy as np
import pandas as pd
from dotenv import load_dotenv
from prophet import Prophet
from sqlalchemy import create_engine
from xgboost import XGBRegressor


backend_env = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
load_dotenv(backend_env)
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL and "?schema=" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.split("?schema=")[0]

if not DATABASE_URL:
    print("❌ DATABASE_URL not set in backend/.env")
    sys.exit(1)

engine = create_engine(DATABASE_URL)


def safe_mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    denom = np.where(np.abs(y_true) < 1.0, 1.0, np.abs(y_true))
    return float(np.mean(np.abs((y_true - y_pred) / denom)) * 100)


def get_holidays_index(start_dt: pd.Timestamp, end_dt: pd.Timestamp) -> set:
    years = list(range(start_dt.year, end_dt.year + 1))
    id_holidays = holidays.country_holidays("ID", years=years)
    return set(pd.to_datetime(list(id_holidays.keys())).date)


def split_test_size(n: int) -> int:
    twenty = max(1, int(round(n * 0.2)))
    if n >= 120:
        return max(twenty, 30)
    return twenty


def add_time_features(df: pd.DataFrame, holiday_dates: set) -> pd.DataFrame:
    out = df.copy()
    out["day_of_week"] = out["date"].dt.dayofweek
    out["is_weekend"] = out["day_of_week"].isin([5, 6]).astype(int)
    out["is_holiday"] = out["date"].dt.date.isin(holiday_dates).astype(int)
    return out


def build_xgb_training_frame(series_df: pd.DataFrame, holiday_dates: set) -> pd.DataFrame:
    d = add_time_features(series_df, holiday_dates)
    d["lag_1"] = d["y"].shift(1)
    d["lag_7"] = d["y"].shift(7)
    d["lag_14"] = d["y"].shift(14)
    d["rolling_mean_7"] = d["y"].shift(1).rolling(7).mean()
    d = d.dropna().reset_index(drop=True)
    return d


def xgb_predict_recursive(train_series: pd.DataFrame, future_dates: List[pd.Timestamp], holiday_dates: set) -> np.ndarray:
    hist = train_series.copy().reset_index(drop=True)
    train_frame = build_xgb_training_frame(hist, holiday_dates)

    feature_cols = [
        "lag_1",
        "lag_7",
        "lag_14",
        "rolling_mean_7",
        "day_of_week",
        "is_weekend",
        "is_holiday",
    ]

    if len(train_frame) < 20:
        # fallback naive if too few rows after lag-drop
        last = float(hist["y"].iloc[-1]) if len(hist) else 0.0
        return np.array([max(0.0, last) for _ in future_dates], dtype=float)

    model = XGBRegressor(
        n_estimators=250,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="reg:squarederror",
        random_state=42,
    )
    model.fit(train_frame[feature_cols], train_frame["y"])

    preds: List[float] = []
    for fd in future_dates:
        lag_1 = float(hist["y"].iloc[-1]) if len(hist) >= 1 else 0.0
        lag_7 = float(hist["y"].iloc[-7]) if len(hist) >= 7 else lag_1
        lag_14 = float(hist["y"].iloc[-14]) if len(hist) >= 14 else lag_7
        roll = float(hist["y"].iloc[-7:].mean()) if len(hist) >= 7 else lag_1

        row = pd.DataFrame(
            [
                {
                    "lag_1": lag_1,
                    "lag_7": lag_7,
                    "lag_14": lag_14,
                    "rolling_mean_7": roll,
                    "day_of_week": int(fd.dayofweek),
                    "is_weekend": 1 if int(fd.dayofweek) in (5, 6) else 0,
                    "is_holiday": 1 if fd.date() in holiday_dates else 0,
                }
            ]
        )

        p = float(model.predict(row[feature_cols])[0])
        p = max(0.0, p)
        preds.append(p)

        hist = pd.concat(
            [
                hist,
                pd.DataFrame(
                    [
                        {
                            "date": fd,
                            "y": p,
                        }
                    ]
                ),
            ],
            ignore_index=True,
        )

    return np.asarray(preds, dtype=float)


def prophet_predict(train_series: pd.DataFrame, predict_dates: List[pd.Timestamp], holiday_dates: set) -> np.ndarray:
    holiday_df = pd.DataFrame(
        {
            "ds": pd.to_datetime(sorted(list(holiday_dates))),
            "holiday": "id_holiday",
        }
    )
    prop_df = train_series.rename(columns={"date": "ds", "y": "y"}).copy()
    model = Prophet(weekly_seasonality=True, yearly_seasonality=True, daily_seasonality=False, holidays=holiday_df)
    model.fit(prop_df)
    future = pd.DataFrame({"ds": pd.to_datetime(predict_dates)})
    pred = model.predict(future)["yhat"].astype(float).values
    return np.maximum(pred, 0.0)


def evaluate_and_forecast(series_df: pd.DataFrame, horizon_days: int = 90) -> Dict:
    s = series_df.sort_values("date").reset_index(drop=True)
    n = len(s)
    if n < 150:
        raise ValueError(f"Data harian kurang dari minimum yang dibutuhkan ({n} hari)")

    test_size = split_test_size(n)
    train_df = s.iloc[: n - test_size].copy()
    test_df = s.iloc[n - test_size :].copy()

    holiday_dates = get_holidays_index(s["date"].min(), s["date"].max() + timedelta(days=horizon_days + 30))

    test_dates = list(pd.to_datetime(test_df["date"]).tolist())

    xgb_test = xgb_predict_recursive(train_df[["date", "y"]], test_dates, holiday_dates)
    xgb_mape = safe_mape(test_df["y"].values, xgb_test)

    prophet_test = prophet_predict(train_df[["date", "y"]], test_dates, holiday_dates)
    prophet_mape = safe_mape(test_df["y"].values, prophet_test)

    selected = "xgboost" if xgb_mape <= prophet_mape else "prophet"

    forecast_dates = pd.date_range(s["date"].max() + timedelta(days=1), periods=horizon_days, freq="D")
    if selected == "xgboost":
        forecast_vals = xgb_predict_recursive(s[["date", "y"]], list(forecast_dates), holiday_dates)
    else:
        forecast_vals = prophet_predict(s[["date", "y"]], list(forecast_dates), holiday_dates)

    # pragmatic uncertainty band (non-parametric) from test residual spread
    selected_test = xgb_test if selected == "xgboost" else prophet_test
    resid_std = float(np.std(test_df["y"].values - selected_test)) if len(test_df) > 1 else 0.0
    lower = np.maximum(0.0, forecast_vals - 1.96 * resid_std)
    upper = np.maximum(0.0, forecast_vals + 1.96 * resid_std)

    daily_forecast = [
        {
            "date": d.strftime("%Y-%m-%d"),
            "lower": float(l),
            "point": float(p),
            "upper": float(u),
        }
        for d, l, p, u in zip(forecast_dates, lower, forecast_vals, upper)
    ]

    monthly_bucket: Dict[str, float] = {}
    for row in daily_forecast:
        ym = row["date"][:7]
        monthly_bucket[ym] = monthly_bucket.get(ym, 0.0) + row["point"]

    monthly_forecast = [
        {"month": k, "point": float(v)} for k, v in sorted(monthly_bucket.items(), key=lambda x: x[0])
    ]

    return {
        "selected_model": selected,
        "model_comparison": {
            "xgboost": {"mape": float(xgb_mape)},
            "prophet": {"mape": float(prophet_mape)},
        },
        "test_window": {
            "train_days": int(len(train_df)),
            "test_days": int(len(test_df)),
            "split_rule": "20% tail (fallback 30 hari)",
        },
        "forecast": daily_forecast,
        "monthly_forecast": monthly_forecast,
    }


def query_daily_area_revenue() -> pd.DataFrame:
    query = """
    SELECT
      DATE(t."checkIn") AS date,
      t."areaId" AS area_id,
      a."name" AS area_name,
      SUM(COALESCE(t."amount", 0))::double precision AS y
    FROM "transaction" t
    JOIN "ParkingArea" a ON a."id" = t."areaId"
    WHERE t."status" = 'COMPLETED'
      AND t."amount" IS NOT NULL
      AND DATE(t."checkIn") >= CURRENT_DATE - INTERVAL '365 days'
    GROUP BY DATE(t."checkIn"), t."areaId", a."name"
    ORDER BY date, area_id
    """
    df = pd.read_sql_query(query, engine)
    if df.empty:
        return df
    df["date"] = pd.to_datetime(df["date"])
    df["y"] = pd.to_numeric(df["y"], errors="coerce").fillna(0.0)
    return df


def pad_daily(series_df: pd.DataFrame) -> pd.DataFrame:
    series_df = series_df.sort_values("date")
    rng = pd.date_range(series_df["date"].min(), series_df["date"].max(), freq="D")
    return (
        series_df.set_index("date")
        .reindex(rng, fill_value=0.0)
        .rename_axis("date")
        .reset_index()
        .rename(columns={0: "y"})
    )


def main() -> None:
    print("=" * 70)
    print("MODERN FORECAST (XGBOOST vs PROPHET)")
    print("=" * 70)

    raw = query_daily_area_revenue()
    if raw.empty:
        print("❌ Tidak ada data transaksi completed untuk forecast")
        sys.exit(1)

    output: Dict[str, Dict] = {}

    # Per-area forecast
    for area_id in sorted(raw["area_id"].unique()):
        ad = raw[raw["area_id"] == area_id][["date", "y"]].copy()
        area_name = str(raw[raw["area_id"] == area_id]["area_name"].iloc[0])
        ad = pad_daily(ad)
        try:
            res = evaluate_and_forecast(ad, horizon_days=90)
            output[area_id] = {
                "area_name": area_name,
                "model_aic": None,
                "model_bic": None,
                "model_rmse": None,
                "forecast": res["forecast"],
                "monthly_forecast": res["monthly_forecast"],
                "selected_model": res["selected_model"],
                "model_comparison": res["model_comparison"],
                "test_window": res["test_window"],
            }
            print(
                f"✓ {area_name}: model={res['selected_model']} | "
                f"MAPE xgb={res['model_comparison']['xgboost']['mape']:.2f}% "
                f"prophet={res['model_comparison']['prophet']['mape']:.2f}%"
            )
        except Exception as ex:
            print(f"⚠️ Skip area {area_name}: {ex}")

    # Total forecast from total series (not sum of per-area model outputs)
    total_daily = raw.groupby("date", as_index=False)["y"].sum()
    total_daily = pad_daily(total_daily[["date", "y"]])
    total_res = evaluate_and_forecast(total_daily, horizon_days=90)
    output["TOTAL"] = {
        "area_name": "Total All Areas",
        "forecast": total_res["forecast"],
        "monthly_forecast": total_res["monthly_forecast"],
        "selected_model": total_res["selected_model"],
        "model_comparison": total_res["model_comparison"],
        "test_window": total_res["test_window"],
        "method_note": "Best of XGBoost vs Prophet by lower MAPE",
    }

    with open("forecast_revenue_3months.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print("✓ forecast_revenue_3months.json")

    csv_rows = []
    for area_id, payload in output.items():
        for p in payload.get("forecast", []):
            csv_rows.append(
                {
                    "area_id": area_id,
                    "area_name": payload.get("area_name"),
                    "date": p["date"],
                    "lower_ci": p["lower"],
                    "forecast": p["point"],
                    "upper_ci": p["upper"],
                    "selected_model": payload.get("selected_model"),
                }
            )
    pd.DataFrame(csv_rows).to_csv("forecast_revenue_3months.csv", index=False)
    print("✓ forecast_revenue_3months.csv")

    print("=" * 70)
    print("✅ MODERN FORECAST COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
