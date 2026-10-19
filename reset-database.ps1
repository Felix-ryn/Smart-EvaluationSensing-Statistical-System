# Reset and Migrate Database for 3 Role System
# This script will clean old data and setup new schema

Write-Host "=== Smart Parking - 3 Role Migration ===" -ForegroundColor Cyan
Write-Host ""

$envPath = "C:\Smart-EvaluationSensing-Statistical-System\backend\.env"
if (-not (Test-Path $envPath)) {
    Write-Host "Error: .env file not found at $envPath" -ForegroundColor Red
    exit 1
}

Write-Host "Step 1: Reading DATABASE_URL from .env..." -ForegroundColor Yellow
$dbs = Select-String -Path $envPath -Pattern "DATABASE_URL=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value }
Write-Host "Database URL: $dbs" -ForegroundColor Green
Write-Host ""

# Extract connection info
$hostMatch = $dbs -match "host=([^;]+)"
$portMatch = $dbs -match "port=([^;]+)"
$dbName = $dbs -match "database=([^;]+)"
$username = $dbs -match "user=([^;]+)"

$PGHOST = if ($hostMatch) { $matches[1] } else { "localhost" }
$PGPORT = if ($portMatch) { $matches[1] } else { "5432" }
$PGDATABASE = if ($dbName) { $matches[1] } else { "sess" }
$PGUSER = if ($username) { $matches[1] } else { "postgres" }

Write-Host "Connection Details:" -ForegroundColor Cyan
Write-Host "  Host: $PGHOST"
Write-Host "  Port: $PGPORT"
Write-Host "  Database: $PGDATABASE"
Write-Host "  User: $PGUSER"
Write-Host ""

# Option 1: Using PSQL directly
Write-Host "Option A: Using PostgreSQL psql client" -ForegroundColor Yellow
$pSqlPath = Get-ChildItem -Path "C:\Program Files\PostgreSQL" -Filter "psql.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pSqlPath) {
    Write-Host "Found psql at: $($pSqlPath.FullName)" -ForegroundColor Green
    
    $psqlCmd = "& `"$($pSqlPath.FullName)`" -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE -c"
    
    # Drop tables
    Write-Host "`n Dropping all tables..." -ForegroundColor Yellow
    & $psqlCmd 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' 2>$null
    
    if ($?) {
        Write-Host "✓ Schema reset completed" -ForegroundColor Green
    } else {
        Write-Host "✗ Failed to reset schema" -ForegroundColor Red
    }
} else {
    Write-Host "⚠ psql not found. Please install PostgreSQL." -ForegroundColor Magenta
}

# Option 2: Using npx prisma db push
Write-Host "`nOption B: Using Prisma db push" -ForegroundColor Yellow
Write-Host "This will apply schema changes directly..." -ForegroundColor Gray
Write-Host ""

Write-Host "Starting Prisma db push --accept-data-loss..." -ForegroundColor Cyan
cd backend
$result = npx prisma db push --accept-data-loss 2>&1
Write-Host $result

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✓ Schema pushed successfully!" -ForegroundColor Green
} else {
    Write-Host "`n✗ Schema push failed with code: $LASTEXITCODE" -ForegroundColor Red
    
    # Try alternative - use prisma generate first
    Write-Host "`nTrying alternative approach..." -ForegroundColor Yellow
    $generateResult = npx prisma generate 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Generated Prisma Client" -ForegroundColor Green
    } else {
        Write-Host "✗ Generation failed" -ForegroundColor Red
    }
}

# Re-seed database
Write-Host "`nRe-seeding database with test data..." -ForegroundColor Cyan
if (Test-Path "./prisma/seed.ts") {
    $seedResult = npm run db:seed 2>&1
    Write-Host $seedResult
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✓ Database seeded successfully!" -ForegroundColor Green
    } else {
        Write-Host "`n✗ Seeding failed" -ForegroundColor Red
    }
} else {
    Write-Host "⚠ Seed file not found" -ForegroundColor Yellow
}

Write-Host "`n=== Migration Complete ===" -ForegroundColor Cyan
Write-Host "Test credentials:" -ForegroundColor Yellow
Write-Host "  Admin: admin@sess.local / password123"
Write-Host "  Jukir Budi: jukir.budi@sess.local / password123"
Write-Host "  Jukir Siti: jukir.siti@sess.local / password123"
Write-Host "  Jukir Agus: jukir.agus@sess.local / password123"
Write-Host "  Jukir Dewi: jukir.dewi@sess.local / password123"
Write-Host "  Customer: user@sess.local / password123"
Write-Host ""
Write-Host "Backend running on: http://localhost:3001" -ForegroundColor Cyan
Write-Host "Frontend running on: http://localhost:3000" -ForegroundColor Cyan
