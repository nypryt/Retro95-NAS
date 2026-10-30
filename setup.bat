@echo off
setlocal
title Win95 NAS Setup
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

python setup_gui.py
if errorlevel 2 goto done
if errorlevel 1 (
  echo.
  echo  Setup was cancelled or could not be saved.
  pause
)
:done
endlocal
