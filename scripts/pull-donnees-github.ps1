# Récupère les données depuis le dépôt GitHub privé vers data\ et config\.env
# Usage : npm run donnees:pull-github

param(
    [string]$GitHubUser = 'CALEBKASENDA',
    [string]$DataRepo = 'Tabernacle-de-la-Moisson-ERP-Donnees'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Gh = 'C:\Program Files\GitHub CLI\gh.exe'
if (-not (Test-Path $Gh)) { $Gh = 'gh' }

& $Gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Connectez-vous : gh auth login' -ForegroundColor Red
    exit 1
}

$SyncDir = Join-Path $Root '.sync-donnees'
$RemoteUrl = "https://github.com/$GitHubUser/$DataRepo.git"
$ProjectData = Join-Path $Root 'data'
$ProjectConfig = Join-Path $Root 'config'

if (Test-Path (Join-Path $SyncDir '.git')) {
    Push-Location $SyncDir
    git pull origin main 2>&1
    Pop-Location
} else {
    if (Test-Path $SyncDir) { Remove-Item $SyncDir -Recurse -Force }
    git clone $RemoteUrl $SyncDir 2>&1
}

$srcData = Join-Path $SyncDir 'data'
if (-not (Test-Path $srcData)) {
    Write-Host 'Aucune donnee dans le depot GitHub.' -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Force -Path $ProjectData, $ProjectConfig | Out-Null
if (Test-Path $ProjectData) {
    Get-ChildItem $ProjectData -Force | Where-Object { $_.Name -ne '.gitkeep' } | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
}
Copy-Item $srcData\* $ProjectData -Recurse -Force

$srcEnv = Join-Path $SyncDir 'config\.env'
if (Test-Path $srcEnv) {
    Copy-Item $srcEnv (Join-Path $ProjectConfig '.env') -Force
}

Write-Host ''
Write-Host 'Donnees restaurees dans :' -ForegroundColor Green
Write-Host "  $ProjectData"
Write-Host "  $(Join-Path $ProjectConfig '.env')"
Write-Host ''
Write-Host 'Relancez l ERP (npm run dev ou installateur).' -ForegroundColor Gray
