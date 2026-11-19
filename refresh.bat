@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 需要 Node.js 18+ ：https://nodejs.org
  pause
  exit /b 1
)
node study-tracker.js
start "" "%~dp0report.html"
pause
