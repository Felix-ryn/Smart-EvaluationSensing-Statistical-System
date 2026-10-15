"""
Generate realistic analytics data for Smart Parking System.

Target volumes (simulasi, no schema changes):
- ParkingArea: 8 rows
- User (JUKIR): 10 rows
- Attendance: ±1.500 rows
- Transaction: 10.000 rows
- SetoranEntry: menyesuaikan hari aktif

Pattern constraints:
- Weekly pattern (weekday/weekend different)
- Slow trend +3-5% per month
- Random noise 10-15%
- National holiday effects (Indonesia)
- Rush hours 07-09 and 16-18
- QRIS share slowly rises 20% -> 40%

IMPORTANT:
- No character label is stored in DB
- Keep consistency: duration, amount, and grossAmount
"""

import os
import sys
from datetime import datetime, timedelta
import random
import uuid
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import holidays

# Load environment from backend .env
backend_env = os.path.join(os.path.dirname(__file__), "..", "backend", ".env")
load_dotenv(backend_env)
DATABASE_URL = os.getenv("DATABASE_URL")
# Remove schema parameter for psycopg3 compatibility
if DATABASE_URL and "?schema=" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.split("?schema=")[0]
ANALYTICS_MODE = os.getenv("ANALYTICS_MODE", "SIMULATE")

if not DATABASE_URL:
    print("❌ DATABASE_URL not set in .env")
    sys.exit(1)

engine = create_engine(DATABASE_URL)

ID_HOLIDAYS = holidays.country_holidays("ID", years=[datetime.now().year - 1, datetime.now().year, datetime.now().year + 1])

AREA_SPECS = [
    {"id": "area-a", "name": "Area A", "location": "Jl. Merdeka No. 1", "vehicleType": "motorcycle", "capacity": 80, "latitude": -7.2516, "longitude": 112.7553},
    {"id": "area-b", "name": "Area B", "location": "Jl. Sudirman No. 88", "vehicleType": "motorcycle", "capacity": 70, "latitude": -7.2512, "longitude": 112.7561},
    {"id": "area-c", "name": "Area C", "location": "Jl. Gatot Subroto No. 10", "vehicleType": "car", "capacity": 45, "latitude": -7.2508, "longitude": 112.7548},
    {"id": "area-d", "name": "Area D", "location": "Jl. Veteran No. 2", "vehicleType": "motorcycle", "capacity": 75, "latitude": -7.2499, "longitude": 112.7570},
    {"id": "area-e", "name": "Area E", "location": "Jl. Pahlawan No. 14", "vehicleType": "car", "capacity": 40, "latitude": -7.2525, "longitude": 112.7539},
    {"id": "area-f", "name": "Area F", "location": "Jl. Dharmawangsa No. 7", "vehicleType": "motorcycle", "capacity": 65, "latitude": -7.2530, "longitude": 112.7568},
    {"id": "area-g", "name": "Area G", "location": "Jl. Diponegoro No. 23", "vehicleType": "car", "capacity": 38, "latitude": -7.2504, "longitude": 112.7529},
    {"id": "area-h", "name": "Area H", "location": "Jl. Ahmad Yani No. 50", "vehicleType": "motorcycle", "capacity": 72, "latitude": -7.2489, "longitude": 112.7584},
]

TARGET_JUKIR = 10
TARGET_TRANSACTIONS = 10_000

JUKIR_SPECS = [
    {"name": "Budi Santoso", "email": "jukir.budi@sess.local", "areaId": "area-a"},
    {"name": "Siti Rahayu", "email": "jukir.siti@sess.local", "areaId": "area-b"},
    {"name": "Agus Wijaya", "email": "jukir.agus@sess.local", "areaId": "area-c"},
    {"name": "Dewi Lestari", "email": "jukir.dewi@sess.local", "areaId": "area-d"},
    {"name": "Rudi Hartono", "email": "jukir.rudi@sess.local", "areaId": "area-e"},
    {"name": "Maya Putri", "email": "jukir.maya@sess.local", "areaId": "area-f"},
    {"name": "Andi Pratama", "email": "jukir.andi@sess.local", "areaId": "area-g"},
    {"name": "Nina Kusuma", "email": "jukir.nina@sess.local", "areaId": "area-h"},
    {"name": "Fajar Nugroho", "email": "jukir.fajar@sess.local", "areaId": "area-a"},
    {"name": "Lina Maharani", "email": "jukir.lina@sess.local", "areaId": "area-c"},
]


def tarif(vehicle_type: str, minutes: int) -> int:
    hours = max(1, (minutes + 59) // 60)
    if vehicle_type == "car":
        first, next_h, maximum = 3000, 1500, 15000
    else:
        first, next_h, maximum = 2000, 1000, 10000
    fee = first + max(0, hours - 1) * next_h
    return int(min(fee, maximum))


def ensure_areas() -> None:
    with engine.connect() as conn:
        for a in AREA_SPECS:
            conn.execute(
                text(
                    """
                    INSERT INTO "ParkingArea" ("id", "name", "location", "latitude", "longitude", "vehicleType", "capacity", "status", "createdAt", "updatedAt")
                    VALUES (:id, :name, :location, :latitude, :longitude, :vehicleType, :capacity, 'ACTIVE', NOW(), NOW())
                    ON CONFLICT ("id") DO UPDATE SET
                      "name" = EXCLUDED."name",
                      "location" = EXCLUDED."location",
                      "latitude" = EXCLUDED."latitude",
                      "longitude" = EXCLUDED."longitude",
                      "vehicleType" = EXCLUDED."vehicleType",
                      "capacity" = EXCLUDED."capacity",
                      "updatedAt" = NOW()
                    """
                ),
                a,
            )
        conn.commit()


def ensure_10_jukir_exact() -> None:
    base_password = "$2a$10$9a6x5S5fR8kV4g4wWfG2yeVAKolN0LwB8zYW0S9zS9G6f0m0K7J2u"  # bcrypt of password123
    with engine.connect() as conn:
        for spec in JUKIR_SPECS:
            conn.execute(
                text(
                    """
                    INSERT INTO "User" ("id", "name", "email", "passwordHash", "role", "status", "areaId", "createdAt", "updatedAt")
                    VALUES (gen_random_uuid(), :name, :email, :passwordHash, 'JUKIR', 'ACTIVE', :areaId, NOW(), NOW())
                    ON CONFLICT ("email") DO UPDATE SET
                      "name" = EXCLUDED."name",
                      "passwordHash" = EXCLUDED."passwordHash",
                      "role" = 'JUKIR',
                      "status" = 'ACTIVE',
                      "areaId" = EXCLUDED."areaId",
                      "updatedAt" = NOW()
                    """
                ),
                {
                    "name": spec["name"],
                    "email": spec["email"],
                    "passwordHash": base_password,
                    "areaId": spec["areaId"],
                },
            )

        allowed_emails = {spec["email"] for spec in JUKIR_SPECS}
        extra_jukir_rows = conn.execute(
            text('SELECT "id", "email" FROM "User" WHERE "role" = \'JUKIR\'')
        ).fetchall()
        for row in extra_jukir_rows:
            if row[1] not in allowed_emails:
                conn.execute(
                    text(
                        '''
                        UPDATE "User"
                        SET "role" = 'USER', "status" = 'INACTIVE', "areaId" = NULL, "updatedAt" = NOW()
                        WHERE "id" = CAST(:id AS uuid)
                        '''
                    ),
                    {"id": str(row[0])},
                )

        conn.commit()


def get_jukir_users():
    """Fetch all JUKIR users from database."""
    try:
        with engine.connect() as conn:
            result = conn.execute(text('SELECT id, name, email, "areaId" FROM "User" WHERE role = \'JUKIR\''))
            by_email = {row[2]: (row[0], row[1], row[3]) for row in result}

            ordered = []
            for spec in JUKIR_SPECS:
                if spec["email"] in by_email:
                    ordered.append(by_email[spec["email"]])

            return ordered[:TARGET_JUKIR]
    except Exception as e:
        print(f"❌ Error fetching jukir users: {e}")
        sys.exit(1)


def trend_multiplier(dt: datetime, base_start: datetime) -> float:
    months = max(0.0, (dt - base_start).days / 30.0)
    monthly_growth = 1.04  # ~4%/month
    return monthly_growth ** months


def holiday_multiplier(d: date) -> float:
    return 0.75 if d in ID_HOLIDAYS else 1.0


def weekday_multiplier(d: date) -> float:
    return 0.7 if d.weekday() >= 5 else 1.0


def noise_multiplier() -> float:
    return random.uniform(0.85, 1.15)


def generate_attendance_data(jukir_list):
    """
    Generate realistic Attendance records.
    - 10 jukir × ~150 working days
    - Varies by character type
    """
    print("📊 Generating Attendance data...")
    
    attendance_records = []
    base_date = datetime.now() - timedelta(days=260)  # wider window to reach ~150 weekdays
    
    for jukir_idx, (jukir_id, jukir_name, _area_id) in enumerate(jukir_list):
        print(f"  Jukir {jukir_idx+1}/{len(jukir_list)}: {jukir_name}")
        
        # Generate ~150 working days (skip weekends)
        dates_set = set()
        attempts = 0
        max_attempts = 700
        
        while len(dates_set) < 150 and attempts < max_attempts:
            days_offset = random.randint(0, 259)
            date = (base_date + timedelta(days=days_offset)).date()
            
            # Skip weekends (5=Sat, 6=Sun)
            if date.weekday() < 5:
                dates_set.add(date)
            attempts += 1
        
        # Generate attendance for each date
        for date in sorted(dates_set)[:150]:
            shift = random.choice(['PAGI', 'SORE'])
            jadwal_masuk = '07:00' if shift == 'PAGI' else '13:00'
            
            # Parse jadwal_masuk time
            hour, minute = map(int, jadwal_masuk.split(':'))
            jadwal_dt = datetime.combine(date, datetime.min.time().replace(hour=hour, minute=minute))
            
            # Arrival variance without storing any character label
            variance = random.choice([8, 12, 15, 20, 30])
            arrival_minutes = random.randint(-variance, variance)
            jam_datang = jadwal_dt + timedelta(minutes=arrival_minutes)
            
            # Jam pulang = jamDatang + work_hours
            work_hours = max(4, min(8, random.gauss(6.8, 1.1)))
            jam_pulang = jam_datang + timedelta(hours=work_hours)
            
            attendance_records.append({
                'id': uuid.uuid4(),  # Use UUID object, not string
                'jukirId': jukir_id,
                'date': date,
                'shift': shift,
                'jadwalMasuk': jadwal_masuk,
                'jamDatang': jam_datang,
                'jamPulang': jam_pulang,
                'createdAt': datetime.now(),
                'updatedAt': datetime.now(),
            })
    
    # Insert into database
    if attendance_records:
        try:
            with engine.connect() as conn:
                conn.execute(
                    text(
                        """
                        INSERT INTO "Attendance"
                        ("id", "jukirId", "date", "shift", "jadwalMasuk", "jamDatang", "jamPulang", "createdAt", "updatedAt")
                        VALUES
                        (CAST(:id AS uuid), CAST(:jukirId AS uuid), CAST(:date AS date), CAST(:shift AS "Shift"), :jadwalMasuk, :jamDatang, :jamPulang, :createdAt, :updatedAt)
                        """
                    ),
                    [
                        {
                            "id": str(r["id"]),
                            "jukirId": str(r["jukirId"]),
                            "date": str(r["date"]),
                            "shift": r["shift"],
                            "jadwalMasuk": r["jadwalMasuk"],
                            "jamDatang": r["jamDatang"],
                            "jamPulang": r["jamPulang"],
                            "createdAt": r["createdAt"],
                            "updatedAt": r["updatedAt"],
                        }
                        for r in attendance_records
                    ],
                )
                conn.commit()
            print(f"\n✅ Generated {len(attendance_records)} Attendance records")
            return len(attendance_records)
        except Exception as e:
            print(f"❌ Error inserting Attendance data: {e}")
            sys.exit(1)
    
    return 0


def generate_transactions_and_setoran(jukir_list, days=365, target_transactions=TARGET_TRANSACTIONS):
    print("📊 Generating Transaction + SetoranEntry data...")
    tx_rows = []
    setoran_rows = []
    now = datetime.now()
    start = now - timedelta(days=days)

    tx_counter = 1
    day_index = 0
    while len(tx_rows) < target_transactions:
        for jukir_id, _name, area_id in jukir_list:
            if len(tx_rows) >= target_transactions:
                break

            if not area_id:
                area_id = random.choice([a["id"] for a in AREA_SPECS])

            day = (start + timedelta(days=day_index)).date()
            is_weekend = day.weekday() >= 5
            # base 8-14 transactions/day/jukir dengan pattern musiman
            base = random.randint(8, 14)
            vol = int(round(base * weekday_multiplier(day) * holiday_multiplier(day) * trend_multiplier(datetime.combine(day, datetime.min.time()), start) * noise_multiplier()))
            vol = max(3, min(18, vol))
            remaining = target_transactions - len(tx_rows)
            vol = min(vol, remaining)

            daily_amount_sum = 0
            qris_ratio = min(0.4, 0.2 + (day_index / max(1, days - 1)) * 0.2)

            for _ in range(vol):
                peak = random.random() < 0.65
                if peak:
                    hour = random.choice([7, 8, 9, 16, 17, 18])
                else:
                    hour = random.randint(10, 21 if not is_weekend else 20)

                minute = random.randint(0, 59)
                check_in = datetime.combine(day, datetime.min.time()) + timedelta(hours=hour, minutes=minute)
                duration = random.randint(30, 360)
                check_out = check_in + timedelta(minutes=duration)

                vehicle_type = random.choice(["motorcycle", "car"])
                amount = tarif(vehicle_type, duration)
                payment_method = "QRIS" if random.random() < qris_ratio else "CASH"

                tx_rows.append(
                    {
                        "id": str(uuid.uuid4()),
                        "transactionCode": f"SIM-{tx_counter:08d}",
                        "areaId": area_id,
                        "jukirId": jukir_id,
                        "vehicleType": vehicle_type,
                        "checkIn": check_in,
                        "checkOut": check_out,
                        "durationMinutes": duration,
                        "amount": amount,
                        "paymentMethod": payment_method,
                        "paidAt": check_out,
                        "status": "COMPLETED",
                        "createdAt": check_in,
                        "updatedAt": check_out,
                    }
                )
                tx_counter += 1
                daily_amount_sum += amount

            tax_percent = 10.0
            jukir_share_percent = 15.0
            tax_amount = int(round(daily_amount_sum * (tax_percent / 100.0)))
            jukir_share_amount = int(round(daily_amount_sum * (jukir_share_percent / 100.0)))

            setoran_rows.append(
                {
                    "id": str(uuid.uuid4()),
                    "jukirId": jukir_id,
                    "areaId": area_id,
                    "date": datetime.combine(day, datetime.min.time()),
                    "totalTransactions": vol,
                    "grossAmount": daily_amount_sum,
                    "taxPercent": tax_percent,
                    "taxAmount": tax_amount,
                    "jukirSharePercent": jukir_share_percent,
                    "jukirShareAmount": jukir_share_amount,
                    "status": "APPROVED",
                    "approvedAt": datetime.now(),
                    "approvedBy": None,
                    "adminNote": "Simulated data",
                    "createdAt": datetime.now(),
                    "updatedAt": datetime.now(),
                }
            )

        day_index += 1

    with engine.connect() as conn:
        conn.execute(text('DELETE FROM "SetoranEntry"'))
        conn.execute(text('DELETE FROM "transaction"'))
        conn.commit()

    with engine.connect() as conn:
        if tx_rows:
            conn.execute(
                text(
                    """
                    INSERT INTO "transaction"
                    ("id", "transactionCode", "areaId", "jukirId", "vehicleType", "checkIn", "checkOut", "durationMinutes", "amount", "paymentMethod", "paidAt", "status", "createdAt", "updatedAt")
                    VALUES
                    (CAST(:id AS uuid), :transactionCode, :areaId, CAST(:jukirId AS uuid), :vehicleType, :checkIn, :checkOut, :durationMinutes, :amount, CAST(:paymentMethod AS "PaymentMethod"), :paidAt, CAST(:status AS "TransactionStatus"), :createdAt, :updatedAt)
                    """
                ),
                tx_rows,
            )

        if setoran_rows:
            conn.execute(
                text(
                    """
                    INSERT INTO "SetoranEntry"
                    ("id", "jukirId", "areaId", "date", "totalTransactions", "grossAmount", "taxPercent", "taxAmount", "jukirSharePercent", "jukirShareAmount", "status", "approvedAt", "approvedBy", "adminNote", "createdAt", "updatedAt")
                    VALUES
                    (CAST(:id AS uuid), CAST(:jukirId AS uuid), :areaId, :date, :totalTransactions, :grossAmount, :taxPercent, :taxAmount, :jukirSharePercent, :jukirShareAmount, CAST(:status AS "SetoranStatus"), :approvedAt, :approvedBy, :adminNote, :createdAt, :updatedAt)
                    """
                ),
                setoran_rows,
            )

        conn.commit()

    print(f"✅ Generated {len(tx_rows)} transactions and {len(setoran_rows)} setoran rows")
    return len(tx_rows), len(setoran_rows)


def validate_transaction_data():
    """
    Validate that existing Transaction data is consistent with fee calculation.
    (Optional enhancement - just print summary for now)
    """
    print("📋 Validating Transaction data...")
    try:
        with engine.connect() as conn:
            result = conn.execute(text("""
                SELECT 
                    COUNT(*) as total_transactions,
                    COUNT(CASE WHEN amount IS NULL THEN 1 END) as null_amounts,
                    COUNT(CASE WHEN status = 'COMPLETED' THEN 1 END) as completed,
                    ROUND(AVG(amount), 0) as avg_amount
                FROM "transaction"
            """))
            row = result.fetchone()
            print(f"  Total transactions: {row[0]}")
            print(f"  Null amounts: {row[1]}")
            print(f"  Completed: {row[2]}")
            print(f"  Average amount: Rp {row[3]:,.0f}")
            print("✅ Transaction data valid")
    except Exception as e:
        print(f"⚠️  Could not validate transaction data: {e}")


def main():
    """Main entry point."""
    if ANALYTICS_MODE != "SIMULATE":
        print("⚠️  Production mode: skipping data generation")
        return
    
    print("\n" + "="*60)
    print("ANALYTICS DATA GENERATION")
    print("="*60)
    
    # Ensure baseline entities
    ensure_areas()
    ensure_10_jukir_exact()

    # Fetch jukir users
    jukir_list = get_jukir_users()
    print(f"\n📌 Found {len(jukir_list)} JUKIR users")
    
    if len(jukir_list) == 0:
        print("❌ No JUKIR users found in database")
        sys.exit(1)
    
    # Reset attendance before regenerate
    with engine.connect() as conn:
        conn.execute(text('DELETE FROM "Attendance"'))
        conn.commit()

    # Generate attendance data
    attendance_count = generate_attendance_data(jukir_list)

    # Generate transaction + setoran data
    transaction_count, setoran_count = generate_transactions_and_setoran(
        jukir_list,
        days=365,
        target_transactions=TARGET_TRANSACTIONS,
    )
    
    # Validate transaction data
    validate_transaction_data()
    
    print("\n" + "="*60)
    print("✅ DATA GENERATION COMPLETE!")
    print("="*60)
    print(f"Generated: {attendance_count} Attendance records")
    print(f"Generated: {transaction_count} Transaction rows")
    print(f"Generated: {setoran_count} SetoranEntry rows")
    print("Mode: SIMULATE (development)")
    print("\nNext steps:")
    print("1. Run: python forecast_revenue_sarima.py")
    print("2. Run: python segment_jukir_gmm.py")
    print("="*60 + "\n")


if __name__ == "__main__":
    main()
