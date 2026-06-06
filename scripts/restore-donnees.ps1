# Restaure une sauvegarde externe (hors Git)
# Usage : npm run donnees:restore -- -BackupPath "C:\...\backups\tabernacle-backup-2026-06-06_120000"

param(
    [Parameter(Mandatory = $true)]
    [string]$BackupPath,
    [string]$ExternalRoot = (Join-Path $env:USERPROFILE 'Documents\TabernacleERP-Donnees')
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path $BackupPath)) {
    Write-Host "Sauvegarde introuvable : $BackupPath" -ForegroundColor Red
    exit 1
}

$dataSrc = Join-Path $BackupPath 'data'
if (-not (Test-Path $dataSrc)) {
    Write-Host 'Dossier data\ manquant dans la sauvegarde.' -ForegroundColor Red
    exit 1
}

$DataDir = Join-Path $ExternalRoot 'data'
$ConfigDir = Join-Path $ExternalRoot 'config'
New-Item -ItemType Directory -Force -Path $DataDir, $ConfigDir | Out-Null

Write-Host "Restauration vers $DataDir ..." -ForegroundColor Cyan
Get-ChildItem $DataDir -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force
Copy-Item $dataSrc $DataDir -Recurse -Force

$envSrc = Join-Path $BackupPath 'config\.env'
if (Test-Path $envSrc) {
    Copy-Item $envSrc (Join-Path $ConfigDir '.env') -Force
}

Write-Host 'Restauration terminee. Relancez l ERP.' -ForegroundColor Green
