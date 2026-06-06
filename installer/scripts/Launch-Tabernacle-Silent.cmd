@echo off
REM Lanceur sans console — fallback si le raccourci Bureau est casse
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0start-tabernacle.ps1"
exit /b %errorlevel%
