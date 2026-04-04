@echo off
title PLC Browser IO - Web Server Launcher
color 0A

echo ===================================================
echo   PLC Browser IO - Local Web Server Launcher
echo ===================================================
echo.
echo This script starts a local web server to bypass CORS
echo restrictions so that JSON configs load automatically.
echo.
echo Please select your preferred runtime:
echo.
echo [1] Python (python -m http.server 3000)
echo [2] Node.js (npx serve -p 3000)
echo [3] Exit
echo.

set /p choice="Type 1, 2, or 3 and press Enter: "

if "%choice%"=="1" goto python
if "%choice%"=="2" goto nodejs
if "%choice%"=="3" goto exit

echo Invalid choice.
pause
goto exit

:python
echo.
echo Starting Python HTTP Server on port 3000...
start http://localhost:3000
cd webpage
python -m http.server 3000
echo Server stopped.
pause
goto exit

:nodejs
echo.
echo Starting Node.js HTTP Server on port 3000...
start http://localhost:3000
cd webpage
call npx serve -p 3000
echo Server stopped.
pause
goto exit

:exit
