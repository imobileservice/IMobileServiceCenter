@echo off
REM Batch script to start both servers for development

echo Starting iMobile E-Commerce Development Servers...
echo ===============================================
echo.

REM Check if node_modules exists
if not exist "node_modules\" (
    echo node_modules not found. Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo Failed to install dependencies. Please run 'npm install' manually.
        pause
        exit /b 1
    )
)

REM Check if .env file exists
if not exist ".env" (
    echo ERROR: .env file not found!
    echo Please create a .env file with your Supabase credentials.
    echo See .env.example for reference.
    pause
    exit /b 1
)

echo Starting servers...
echo.
echo Server 1: Express API Server ^(Port 4000^)
echo Server 2: Vite Dev Server ^(Port 3000^)
echo.
echo Press Ctrl+C in each window to stop the servers
echo ===============================================
echo.

REM Start Express API server in a new window
start "Express API Server - Port 4000" cmd /k npm run dev:server

REM Wait a bit for API server to start
timeout /t 3 /nobreak >nul

REM Start Vite dev server in a new window
start "Vite Dev Server - Port 3000" cmd /k npm run dev

echo.
echo Both servers are starting...
echo.
echo Once both servers are ready:
echo   - Frontend: http://localhost:3000
echo   - API:      http://localhost:4000
echo.
echo To stop servers: Close both command prompt windows that opened
echo.
pause

