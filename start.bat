@echo off
setlocal
title Win95 NAS
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Python was not found on PATH.
  echo  Install Python 3.11 or newer from https://www.python.org/downloads/
  echo  and tick "Add python.exe to PATH" during setup.
  echo.
  pause
  exit /b 1
)

REM The launcher shows a Windows 95-style setup wizard the first time,
REM then starts the server with the chosen storage folder and options.
python launcher.py %*
if errorlevel 1 (
  echo.
  echo  The server stopped with an error. See the messages above.
  pause
)
endlocal
