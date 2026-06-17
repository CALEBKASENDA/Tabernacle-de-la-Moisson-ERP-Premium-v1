@echo off
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0apply-bootstrap-config.ps1" -InstallRoot "%CD%" -ForceReset
pause
