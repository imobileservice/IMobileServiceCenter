# PowerShell script to start both servers for development

Write-Host "Starting iMobile E-Commerce Development Servers..." -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# Check if node_modules exists
if (-not (Test-Path "node_modules")) {
    Write-Host "node_modules not found. Installing dependencies..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install dependencies. Please run 'npm install' manually." -ForegroundColor Red
        exit 1
    }
}

# Check if .env file exists and has required variables
if (-not (Test-Path ".env")) {
    Write-Host "ERROR: .env file not found!" -ForegroundColor Red
    Write-Host "Please create a .env file with your Supabase credentials." -ForegroundColor Red
    Write-Host "See .env.example for reference." -ForegroundColor Yellow
    exit 1
}

# Read .env and check for required variables
$envContent = Get-Content .env -Raw
if (-not ($envContent -match "VITE_SUPABASE_URL") -and -not ($envContent -match "NEXT_PUBLIC_SUPABASE_URL")) {
    Write-Host "ERROR: VITE_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL not found in .env" -ForegroundColor Red
    exit 1
}
if (-not ($envContent -match "VITE_SUPABASE_ANON_KEY") -and -not ($envContent -match "NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
    Write-Host "ERROR: VITE_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY not found in .env" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Dependencies and configuration verified" -ForegroundColor Green
Write-Host ""

# Build the server TypeScript files if needed
if (-not (Test-Path "dist-server")) {
    Write-Host "Building server for the first time..." -ForegroundColor Yellow
    npm run build:server
}

Write-Host "Starting servers..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Server 1: Express API Server (Port 4000)" -ForegroundColor Green
Write-Host "Server 2: Vite Dev Server (Port 3000)" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop both servers" -ForegroundColor Yellow
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# Start both servers
$apiServer = Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev:server" -PassThru
Start-Sleep -Seconds 3  # Give API server time to start

$viteServer = Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev" -PassThru

Write-Host ""
Write-Host "Both servers are starting..." -ForegroundColor Green
Write-Host ""
Write-Host "Once both servers are ready:" -ForegroundColor Cyan
Write-Host "  → Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "  → API:      http://localhost:4000" -ForegroundColor White
Write-Host ""
Write-Host "To stop servers: Close both PowerShell windows that opened" -ForegroundColor Yellow
Write-Host ""

# Wait for user input to keep the script running
Write-Host "Press Enter to stop all servers and exit..." -ForegroundColor Yellow
Read-Host

# Clean up - terminate both processes
if ($apiServer -and !$apiServer.HasExited) {
    Stop-Process -Id $apiServer.Id -Force
}
if ($viteServer -and !$viteServer.HasExited) {
    Stop-Process -Id $viteServer.Id -Force
}

Write-Host "Servers stopped." -ForegroundColor Green

