"""
Generate Attendance test data using direct SQL (UUID-safe)
"""
import os
from datetime import datetime, timedelta
import random
import uuid
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv("../backend/.env")
db_url = os.getenv("DATABASE_URL").split("?")[0]
engine = create_engine(db_url)

# Get jukir users
with engine.connect() as conn:
    result = conn.execute(text('SELECT id FROM "User" WHERE role = \'JUKIR\''))
    jukir_ids = [row[0] for row in result.fetchall()]

print(f"✅ Found {len(jukir_ids)} JUKIR users")
print(f"📊 Generating Attendance data...")

base_date = datetime.now() - timedelta(days=180)
record_count = 0

for jukir_id in jukir_ids:
    print(f"  Generating for jukir: {jukir_id}")
    
    # Generate 150 working days
    dates_set = set()
    for _ in range(300):
        days_offset = random.randint(0, 179)
        date = (base_date + timedelta(days=days_offset)).date()
        if date.weekday() < 5:  # Skip weekends
            dates_set.add(date)
    
    # Insert records
    for date in sorted(dates_set)[:150]:
        shift = random.choice(['PAGI', 'SORE'])
        jadwal_masuk = '07:00' if shift == 'PAGI' else '13:00'
        
        hour, minute = map(int, jadwal_masuk.split(':'))
        jadwal_dt = datetime.combine(date, datetime.min.time().replace(hour=hour, minute=minute))
        
        # Random arrival variance
        variance = random.randint(-20, 30)
        jam_datang = jadwal_dt + timedelta(minutes=variance)
        
        # Work hours 4-8
        work_hours = random.uniform(4, 8)
        jam_pulang = jam_datang + timedelta(hours=work_hours)
        
        # Direct SQL insert using CAST function
        with engine.connect() as conn:
            try:
                conn.execute(text("""
                    INSERT INTO "Attendance" 
                    (id, "jukirId", date, shift, "jadwalMasuk", "jamDatang", "jamPulang", "createdAt", "updatedAt")
                    VALUES 
                    (CAST(:id AS uuid), CAST(:jukir_id AS uuid), CAST(:date AS date), 
                     :shift, :jadwal_masuk, :jam_datang, :jam_pulang, NOW(), NOW())
                """), {
                    'id': str(uuid.uuid4()),
                    'jukir_id': str(jukir_id),
                    'date': str(date),
                    'shift': shift,
                    'jadwal_masuk': jadwal_masuk,
                    'jam_datang': jam_datang,
                    'jam_pulang': jam_pulang
                })
                conn.commit()
                record_count += 1
            except Exception as e:
                print(f"    ❌ Error: {str(e)[:100]}")
                conn.rollback()
                break

print(f"\n✅ Generated {record_count} Attendance records")
print("✅ Data generation complete!")
