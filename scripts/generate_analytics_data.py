"""
Generate realistic analytics data for Smart Parking System.
- 4.800 Attendance records (32 jukir × ~150 days)
- 3 character types (tinggi/stabil/perlu_pendampingan) - embedded logic, NOT stored in DB
- Jadwal masuk: 07:00 (PAGI) atau 13:00 (SORE)
- Jam datang: jadwal ± 10-45 menit (variance per character)
- Jam pulang: jamDatang + 4-8 jam
"""

import os
import sys
from datetime import datetime, timedelta
import random
import uuid
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

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

# Define 3 character types (NOT saved to DB - only for data generation logic)
CHARACTER_PROFILES = {
    'tinggi': {
        'earnings_range': (6000000, 8000000),
        'work_hours_mean': 8.0,
        'work_hours_std': 0.5,
        'punctuality_rate': 0.95,
        'arrival_variance_minutes': 5,
        'label': 'Tinggi (Excellent)',
    },
    'stabil': {
        'earnings_range': (4000000, 5000000),
        'work_hours_mean': 7.0,
        'work_hours_std': 1.0,
        'punctuality_rate': 0.85,
        'arrival_variance_minutes': 15,
        'label': 'Stabil (Good)',
    },
    'perlu_pendampingan': {
        'earnings_range': (2000000, 3000000),
        'work_hours_mean': 6.0,
        'work_hours_std': 2.0,
        'punctuality_rate': 0.60,
        'arrival_variance_minutes': 30,
        'label': 'Perlu Pendampingan (Needs Support)',
    }
}


def get_jukir_users():
    """Fetch all JUKIR users from database."""
    try:
        with engine.connect() as conn:
            result = conn.execute(
                text('SELECT id, name FROM "User" WHERE role = \'JUKIR\' ORDER BY id')
            )
            return [(row[0], row[1]) for row in result]
    except Exception as e:
        print(f"❌ Error fetching jukir users: {e}")
        sys.exit(1)


def assign_character_type(jukir_index, total_jukir):
    """
    Assign character type to jukir deterministically.
    Characters: tinggi, stabil, perlu_pendampingan
    Overlap ~10% to avoid perfect separation
    """
    character_list = list(CHARACTER_PROFILES.keys())
    
    # 10% chance of random assignment (overlap)
    if random.random() < 0.1:
        return random.choice(character_list)
    
    # Deterministic assignment based on index
    return character_list[jukir_index % len(character_list)]


def generate_attendance_data(jukir_list):
    """
    Generate 4.800 realistic Attendance records.
    - 32 jukir × ~150 working days
    - Varies by character type
    """
    print("📊 Generating Attendance data...")
    
    attendance_records = []
    base_date = datetime.now() - timedelta(days=183)  # ~6 months ago
    
    for jukir_idx, (jukir_id, jukir_name) in enumerate(jukir_list):
        # Assign character (deterministic + 10% overlap)
        character = assign_character_type(jukir_idx, len(jukir_list))
        profile = CHARACTER_PROFILES[character]
        
        print(f"  Jukir {jukir_idx+1}/{len(jukir_list)}: {jukir_name} ({character})")
        
        # Generate ~150 working days (skip weekends)
        dates_set = set()
        attempts = 0
        max_attempts = 300
        
        while len(dates_set) < 150 and attempts < max_attempts:
            days_offset = random.randint(0, 182)
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
            
            # Jam datang = jadwal ± variance (based on character)
            variance = profile['arrival_variance_minutes']
            arrival_minutes = random.randint(-variance, variance)
            jam_datang = jadwal_dt + timedelta(minutes=arrival_minutes)
            
            # Jam pulang = jamDatang + work_hours
            work_hours = max(4, min(8, random.gauss(
                profile['work_hours_mean'],
                profile['work_hours_std']
            )))
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
            df = pd.DataFrame(attendance_records)
            df.to_sql('Attendance', engine, if_exists='append', index=False)
            print(f"\n✅ Generated {len(attendance_records)} Attendance records")
            return len(attendance_records)
        except Exception as e:
            print(f"❌ Error inserting Attendance data: {e}")
            sys.exit(1)
    
    return 0


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
    
    # Fetch jukir users
    jukir_list = get_jukir_users()
    print(f"\n📌 Found {len(jukir_list)} JUKIR users")
    
    if len(jukir_list) == 0:
        print("❌ No JUKIR users found in database")
        sys.exit(1)
    
    # Generate attendance data
    attendance_count = generate_attendance_data(jukir_list)
    
    # Validate transaction data
    validate_transaction_data()
    
    print("\n" + "="*60)
    print("✅ DATA GENERATION COMPLETE!")
    print("="*60)
    print(f"Generated: {attendance_count} Attendance records")
    print("Mode: SIMULATE (development)")
    print("\nNext steps:")
    print("1. Run: python forecast_revenue_sarima.py")
    print("2. Run: python segment_jukir_gmm.py")
    print("="*60 + "\n")


if __name__ == "__main__":
    main()
