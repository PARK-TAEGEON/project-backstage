@echo off
setlocal
cd /d "%~dp0"
title Backstage
where node >nul 2>nul
if errorlevel 1 (
  echo [Backstage] Node.js is not installed. Opening https://nodejs.org ...
  echo Install the LTS version, then double-click this file again.
  start "" https://nodejs.org/
  pause
  exit /b 1
)
for /f "tokens=1 delims=v." %%a in ('node -v') do set NODEMAJOR=%%a
if %NODEMAJOR% LSS 22 (
  echo [Backstage] Node.js 22 or newer is required.
  node -v
  start "" https://nodejs.org/
  pause
  exit /b 1
)
set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
if not exist node_modules (
  echo [Backstage] Installing packages - first run only, takes a minute...
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)
echo [Backstage] Building web app...
call npm run build
if errorlevel 1 ( pause & exit /b 1 )
echo [Backstage] Server: http://localhost:3001   Admin: http://localhost:3001/admin
echo [Backstage] Close this window to stop the server.
start "" cmd /c "timeout /t 6 /nobreak >nul & start http://localhost:3001"
call npm start
pause
