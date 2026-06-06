@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title Importer depuis cle USB — Tabernacle ERP
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Import-Portable.ps1"
if errorlevel 1 pause
