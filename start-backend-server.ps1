# PowerShell script to start the backend server
# This will kill any existing Node.js processes on port 4000 first

Write-Host "Checking for processes on port 4000..." -ForegroundColor Yellow

# Find and kill processes on port 4000
$processes = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($pid in $processes) {
    if ($pid -ne 0) {
        Write-Host "Killing process $pid on port 4000..." -ForegroundColor Yellow
        Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
}

Start-Sleep -Seconds 2

# Check if port is free
$stillInUse = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -ne 0 }
if ($stillInUse) {
    Write-Host "⚠️  Port 4000 is still in use. Trying to kill all Node.js processes..." -ForegroundColor Red
    Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2
}

Write-Host "Starting backend server..." -ForegroundColor Green
npm run dev:server

