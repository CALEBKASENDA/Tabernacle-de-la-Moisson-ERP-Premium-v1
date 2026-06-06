@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title Tabernacle de la Moisson ERP (debug)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-tabernacle.ps1"
if errorlevel 1 (
    echo.
    echo Appuyez sur une touche pour fermer...
    pause >nul
)
