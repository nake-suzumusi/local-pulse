@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Local Pulse

echo Starting Local Pulse...

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js 22.13.0 or later is required.
  echo Download Node.js from https://nodejs.org/
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo.
  echo npm was not found. Reinstall Node.js from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "package.json" (
  echo.
  echo package.json was not found.
  echo Extract the complete ZIP before running this file.
  pause
  exit /b 1
)

if not exist "node_modules\vinext\dist\cli.js" (
  echo Installing dependencies for the first launch...
  call npm install
  if errorlevel 1 (
    echo.
    echo Installation failed. Check the messages above and your network connection.
    pause
    exit /b 1
  )
)

echo Opening http://localhost:3000 after the server starts...
call npm run local
set "LOCAL_PULSE_EXIT=%ERRORLEVEL%"

if not "%LOCAL_PULSE_EXIT%"=="0" (
  echo.
  echo Local Pulse could not start. Check the messages above.
  pause
)

exit /b %LOCAL_PULSE_EXIT%
