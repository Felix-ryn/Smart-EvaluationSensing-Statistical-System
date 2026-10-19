# Reset and Migrate Database for 3 Role System

Write-Host "=== Smart Parking - 3 Role Migration ===" -ForegroundColor Cyan
Write-Host ""

# Navigate to backend directory
Set-Location C:\Smart-EvaluationSensing-Statistical-System\backend

Write-Host "Resetting database with Prisma db push..." -ForegroundColor Yellow
Write-Host "This will drop all data and apply new schema..." -ForegroundColor Gray
Write-Host ""

# Apply schema changes (accepts data loss)
npx prisma db push --accept-data-loss

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ Schema pushed successfully!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "✗ Schema push failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Re-seeding database with test data..." -ForegroundColor Cyan

# Seed the database
npm run db:seed

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✓ Database seeded successfully!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "✗ Seeding failed!" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Migration Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test Credentials:" -ForegroundColor Yellow
Write-Host "  Admin:      admin@sess.local / password123"
Write-Host "  Jukir Budi: jukir.budi@sess.local / password123"
Write-Host "  Jukir Siti: jukir.siti@sess.local / password123"
Write-Host "  Jukir Agus: jukir.agus@sess.local / password123"
Write-Host "  Jukir Dewi: jukir.dewi@sess.local / password123"
Write-Host "  Customer:   user@sess.local / password123"
Write-Host ""
Write-Host "Backend: http://localhost:3001" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:3000" -ForegroundColor Cyan
