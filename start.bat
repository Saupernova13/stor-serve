@echo off
setlocal enabledelayedexpansion

set PROJECT_DIR=C:\utils\stor-serve
cd /d %PROJECT_DIR%

:restart
node server.js
timeout /t 5 /nobreak
goto restart
