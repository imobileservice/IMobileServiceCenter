@echo off
echo Deleting old diagnostic and deploy markdown/bat files...

del "CATEGORIES_DIAGNOSIS.md"
del "CATEGORIES_TROUBLESHOOTING.md"
del "CHECK_BACKEND.md"
del "CLOUDFLARE_BACKEND_DEPLOY.md"
del "CLOUDFLARE_DEPLOY.md"
del "CLOUDFLARE_ENV_FIX.md"
del "CLOUDFLARE_ENV_SETUP.md"
del "CLOUDFLARE_PAGES_FIX.md"
del "DEBUG_ADD_TO_CART.md"
del "FIXES_SUMMARY.md"
del "FIX_CART_VARIANT_ERROR.md"
del "FIX_PORT_4000.md"
del "GOOGLE_OAUTH_DUPLICATE_FIX.md"
del "GOOGLE_OAUTH_TROUBLESHOOTING.md"
del "INSTALL_CLOUDFLARE_TUNNEL.md"
del "MIGRATION_EXECUTION_ORDER.md"
del "NEXT_STEPS_TUNNEL.md"
del "OAUTH_AND_DUPLICATE_ACCOUNT_FIX.md"
del "QUICK_TUNNEL_SETUP.md"
del "RUN_CATEGORIES_MIGRATION.md"
del "START_BACKEND.md"
del "TUNNEL_NO_DOMAIN.md"
del "start-backend-tunnel.bat"
del "start-cloudflare-tunnel.bat"

echo.
echo Cleanup complete! You can delete this bat file now.
pause
