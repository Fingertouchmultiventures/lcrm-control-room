@echo off
title LCRM Relay (church network mode)
cd /d "%~dp0"

rem If your control room is hosted online, put its address here (no slash at the end).
set ALLOW_ORIGINS=https://lcrm-control-room.loveofchrist.workers.dev,https://lcrm-control-room.vercel.app

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download the LTS version from https://nodejs.org then run this again.
  pause
  exit /b
)

if exist "%~dp0ffmpeg.exe" (
  set FFMPEG=%~dp0ffmpeg.exe
) else (
  where ffmpeg >nul 2>nul
  if errorlevel 1 (
    echo FFmpeg was not found. Put ffmpeg.exe in this folder or add it to PATH. See SETUP.md step 2.
    pause
    exit /b
  )
)

set LAN=1
node server.js
pause
