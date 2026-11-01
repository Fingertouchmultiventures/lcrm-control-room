@echo off
title LCRM Control Room window
rem Opens the control room in its own window with Chrome's "background throttling" switched off, so the picture keeps
rem flowing to Facebook even if you minimise or cover the window. It uses its own Chrome profile (allow the camera/mic once).
set "URL=http://localhost:8787/control.html"
set "CH="
for %%P in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe") do (
  if exist %%P if not defined CH set "CH=%%~P"
)
if not defined CH (
  echo Chrome or Edge was not found.
  pause
  exit /b
)
start "" "%CH%" --user-data-dir="%LocalAppData%\LCRM-ControlRoom" --app=%URL% --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --autoplay-policy=no-user-gesture-required
