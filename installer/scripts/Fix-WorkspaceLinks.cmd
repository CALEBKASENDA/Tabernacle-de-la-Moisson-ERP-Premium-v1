@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Fix-WorkspaceLinks.ps1" %*
endlocal
