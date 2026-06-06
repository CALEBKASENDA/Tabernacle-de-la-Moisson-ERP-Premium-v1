# Sauvegarde des donnees ERP vers le dossier externe (hors Git)
# Usage : npm run donnees:backup

param(
    [string]$ExternalRoot = (Join-Path $env:USERPROFILE 'Documents\TabernacleERP-Donnees')
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$LocalEnv = Join-Path $Root 'config\.env'

function Read-EnvValue([string]$File, [string]$Key) {
    if (-not (Test-Path $File)) { return $null }
    foreach ($line in Get-Content $File) {
        if ($line -match "^\s*$Key=(.+)$") { return $Matches[1].Trim().Trim('"') }
    }
    return $null
}

$dataDir = Read-EnvValue $LocalEnv 'TABERNACLE_DATA_DIR'
if (-not $dataDir) { $dataDir = Join-Path $ExternalRoot 'data' }
if (-not (Test-Path $dataDir)) {
    Write-Host "Aucune donnee trouvee. Lancez d'abord : npm run donnees:init" -ForegroundColor Red
    exit 1
}

$backupRoot = Join-Path $ExternalRoot 'backups'
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
$dest = Join-Path $backupRoot "tabernacle-backup-$stamp"

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item $dataDir (Join-Path $dest 'data') -Recurse -Force

$configEnv = Read-EnvValue $LocalEnv 'TABERNACLE_ENV_FILE'
if ($configEnv -and (Test-Path $configEnv)) {
    New-Item -ItemType Directory -Force -Path (Join-Path $dest 'config') | Out-Null
    Copy-Item $configEnv (Join-Path $dest 'config\.env') -Force
}

@{
    format = 'tabernacle-backup-v1'
    exportedAt = (Get-Date).ToUniversalTime().ToString('o')
    dataDir = $dataDir
} | ConvertTo-Json | Set-Content (Join-Path $dest 'manifest.json') -Encoding UTF8

$sizeMb = [math]::Round(((Get-ChildItem $dest -Recurse -File | Measure-Object Length -Sum).Sum / 1MB), 1)
Write-Host ''
Write-Host "Sauvegarde creee : $dest" -ForegroundColor Green
Write-Host "Taille : $sizeMb Mo"
Write-Host ''
Write-Host 'Copiez ce dossier sur cle USB, OneDrive ou un autre PC.' -ForegroundColor Gray

# Garder les 10 dernieres sauvegardes
Get-ChildItem $backupRoot -Directory | Sort-Object Name -Descending | Select-Object -Skip 10 | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
