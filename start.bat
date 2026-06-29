@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

REM Per-tree environment (PORT, NODE_ENV). Gitignored; differs dev vs prod.
if exist "%~dp0env.local.bat" call "%~dp0env.local.bat"

:restart
node server.js
timeout /t 5 /nobreak
goto restart
