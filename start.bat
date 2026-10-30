@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

REM Per-tree environment (PORT, NODE_ENV). Gitignored; differs dev vs prod.
if exist "%~dp0env.local.bat" call "%~dp0env.local.bat"

:restart
node server.js
REM Not "timeout": under wscript it has no console stdin and returns instantly. ping waits.
ping -n 6 127.0.0.1 >nul
goto restart
