@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0.."
if not exist "node\node.exe" (
  echo Node embarque introuvable.
  pause
  exit /b 1
)
"node\node.exe" "scripts\launch-tabernacle.mjs"
if errorlevel 1 (
  echo.
  echo Echec du lancement. Consultez config\logs\tabernacle-error.log
  pause
)
