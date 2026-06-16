@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title Exporter vers cle USB — Tabernacle ERP
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Export-Portable.ps1"
if errorlevel 1 pause
