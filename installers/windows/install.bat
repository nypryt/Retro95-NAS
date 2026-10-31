@echo off
setlocal EnableExtensions
set "SRC=%~dp0"
set "DEST=%WIN95NAS_INSTALL_DIR%"
if not defined DEST set "DEST=%LOCALAPPDATA%\Programs\Win95NAS"

echo.
echo   Retro95 Setup
echo   -------------
echo   Installing to "%DEST%"
echo.

if not exist "%DEST%" mkdir "%DEST%" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%SRC%payload.zip' -DestinationPath '%DEST%' -Force"
if errorlevel 1 goto fail

if not defined WIN95NAS_NO_SHORTCUTS call :shortcuts
if defined WIN95NAS_NO_LAUNCH goto done

where python >nul 2>&1
if errorlevel 1 (
  echo   Python 3.11 or newer was not found on PATH.
  echo   Install it from https://www.python.org/downloads/ and run Win95 NAS again.
  if not defined WIN95NAS_SILENT pause
  goto done
)

set "PYW=pythonw.exe"
where pythonw >nul 2>&1 || set "PYW=python.exe"
start "" "%PYW%" "%DEST%\launcher.py"
goto done

:shortcuts
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $target = Join-Path $env:LOCALAPPDATA 'Programs\Win95NAS\start.bat'; foreach ($dir in @([Environment]::GetFolderPath('Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))) { $lnk = $ws.CreateShortcut((Join-Path $dir 'Win95 NAS.lnk')); $lnk.TargetPath = $target; $lnk.WorkingDirectory = (Split-Path $target); $lnk.Description = 'Win95 NAS - a 1995 network drive'; $lnk.Save() }"
exit /b 0

:done
echo.
echo   Done. Start it from the "Win95 NAS" shortcut.
echo.
if not defined WIN95NAS_SILENT pause
exit /b 0

:fail
echo.
echo   Setup failed. Nothing was changed.
echo.
if not defined WIN95NAS_SILENT pause
exit /b 1
