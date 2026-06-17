# Repare les liens @tabernacle manquants (API embarquee introuvable apres installation)
param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'
$appRoot = Join-Path $InstallRoot 'resources\app'
if (-not (Test-Path $appRoot)) {
    $appRoot = Join-Path $InstallRoot 'app'
}

if (-not (Test-Path (Join-Path $appRoot 'packages\db\dist\index.js'))) {
    throw "Dossier application introuvable : $appRoot"
}

$linkScript = Join-Path $PSScriptRoot 'link-workspace-packages.ps1'
if (-not (Test-Path $linkScript)) {
    $linkScript = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'scripts\link-workspace-packages.ps1'
}

& $linkScript -AppRoot $appRoot
Write-Host "Liens workspace repares. Relancez Tabernacle ERP." -ForegroundColor Green
