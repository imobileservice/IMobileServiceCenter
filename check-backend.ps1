# Quick script to check if backend server is running
Write-Host "Checking backend server status..." -ForegroundColor Cyan
Write-Host ""

# Check if port 4000 is in use
$port4000 = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue

if ($port4000) {
    Write-Host "✅ Backend server is RUNNING on port 4000" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test it: http://localhost:4000/health" -ForegroundColor Yellow
} else {
    Write-Host "❌ Backend server is NOT running on port 4000" -ForegroundColor Red
    Write-Host ""
    Write-Host "To start the backend server, run:" -ForegroundColor Yellow
    Write-Host "  npm run dev:server" -ForegroundColor White
    Write-Host ""
    Write-Host "Or use the startup script:" -ForegroundColor Yellow
    Write-Host "  .\start-dev.bat" -ForegroundColor White
}

Write-Host ""
Write-Host "Checking environment variables..." -ForegroundColor Cyan

# Check .env file
if (Test-Path ".env") {
    Write-Host "✅ .env file exists" -ForegroundColor Green
    
    $envContent = Get-Content ".env" -Raw
    if ($envContent -match "SUPABASE_SERVICE_ROLE_KEY") {
        Write-Host "✅ SUPABASE_SERVICE_ROLE_KEY found in .env" -ForegroundColor Green
    } else {
        Write-Host "❌ SUPABASE_SERVICE_ROLE_KEY NOT found in .env" -ForegroundColor Red
        Write-Host "   Add it to your .env file!" -ForegroundColor Yellow
    }
    
    if ($envContent -match "VITE_SUPABASE_URL") {
        Write-Host "✅ VITE_SUPABASE_URL found in .env" -ForegroundColor Green
    } else {
        Write-Host "❌ VITE_SUPABASE_URL NOT found in .env" -ForegroundColor Red
    }
} else {
    Write-Host "❌ .env file NOT found" -ForegroundColor Red
    Write-Host "   Create a .env file with your Supabase credentials!" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

