@echo off
echo ========================================
echo IMobile Backend - Cloudflare Tunnel Setup
echo ========================================
echo.
echo This script will:
echo   1. Start the Express backend server
echo   2. Start the Cloudflare Tunnel
echo.
echo Make sure you have:
echo   - Created a tunnel: cloudflared tunnel create imobile-backend
echo   - Updated cloudflare-tunnel-config.yml with your tunnel ID
echo   - Set up your .env file with Supabase credentials
echo.
pause

echo.
echo Starting Express backend server...
start "IMobile Backend Server" cmd /k "npm run dev:server"

echo.
echo Waiting 5 seconds for backend to start...
timeout /t 5 /nobreak >nul

echo.
echo Starting Cloudflare Tunnel...
echo Your backend will be available at the URL shown below:
echo.
C:\cloudflared\cloudflared.exe tunnel --config cloudflare-tunnel-config.yml run

pause

