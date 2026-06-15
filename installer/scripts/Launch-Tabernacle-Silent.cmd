@echo off
REM Lanceur silencieux — VBS (sans console)
wscript.exe //B "%~dp0Launch-Tabernacle.vbs"
exit /b %errorlevel%
