@echo off
chcp 65001 >nul
cd /d "%~dp0"
node server\index.js --push-config
pause
