# Importe un paquet portable Tabernacle ERP (cle USB) dans le dossier d installation
param(
    [string]$SourcePath
)

$ErrorActionPreference = 'Stop'
$InstallRoot = Split-Path -Parent $PSScriptRoot
$DataDir = Join-Path $InstallRoot 'data'
$ConfigDir = Join-Path $InstallRoot 'config'

if (-not $SourcePath) {
    Write-Host ''
    Write-Host 'Import portable Tabernacle ERP' -ForegroundColor Cyan
    Write-Host 'Indiquez le dossier TabernacleERP-Portable sur la cle USB.' -ForegroundColor Gray
    $SourcePath = Read-Host 'Chemin source (ex. E:\TabernacleERP-Portable)'
}

$SourcePath = $SourcePath.Trim().Trim('"')
if (-not $SourcePath) {
    Write-Host 'Import annule.' -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path $SourcePath)) {
    Write-Host "Dossier introuvable : $SourcePath" -ForegroundColor Red
    exit 1
}

$manifestPath = Join-Path $SourcePath 'manifest.json'
if (-not (Test-Path $manifestPath)) {
    Write-Host 'manifest.json manquant — ce dossier ne semble pas etre un export Tabernacle valide.' -ForegroundColor Red
    exit 1
}

& (Join-Path $PSScriptRoot 'stop-tabernacle.ps1') | Out-Null
Start-Sleep -Seconds 2

Set-Content -Path (Join-Path $DataDir 'import-portable.pending') -Value $SourcePath -Encoding UTF8
& (Join-Path $PSScriptRoot 'start-tabernacle.ps1')

Write-Host ''
Write-Host 'Import portable termine.' -ForegroundColor Green
