@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install the LTS version from https://nodejs.org and run this again.
  echo Or in PowerShell: winget install OpenJS.NodeJS.LTS
  pause
  exit /b 1
)
node scripts\setup-hub.js
if errorlevel 1 (
  pause
  exit /b 1
)
node server\index.js --hub --open
pause
