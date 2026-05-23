@echo off
echo.
echo  ================================
echo    Scan2BIM Tracker - Starting
echo  ================================
echo.
echo  Backend  → http://localhost:3001
echo  Frontend → http://localhost:5173
echo.
start "Scan2BIM API" cmd /k "cd /d "%~dp0" && node server/index.js"
timeout /t 2 /nobreak >nul
start "Scan2BIM UI" cmd /k "cd /d "%~dp0client" && npm run dev"
timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"
