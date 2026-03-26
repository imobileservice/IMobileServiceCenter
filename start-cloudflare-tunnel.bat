@echo off
echo ========================================
echo Cloudflare Tunnel for IMobile Backend
echo ========================================
echo.
echo Make sure:
echo   1. Backend server is running (npm run dev:server)
echo   2. You have created a tunnel (cloudflared tunnel create imobile-backend)
echo   3. You have updated cloudflare-tunnel-config.yml with your tunnel ID
echo.
echo Starting tunnel...
echo.

cloudflared tunnel --config cloudflare-tunnel-config.yml run

pause

