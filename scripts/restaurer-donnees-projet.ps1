# Remet les donnees dans le dossier du projet (data\) — configuration locale standard
# Usage : npm run donnees:restaurer-projet

param(
    [string]$ExternalRoot = (Join-Path $env:USERPROFILE 'Documents\TabernacleERP-Donnees')
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$ProjectData = Join-Path $Root 'data'
$ProjectConfig = Join-Path $Root 'config'
$LocalEnv = Join-Path $ProjectConfig '.env'

New-Item -ItemType Directory -Force -Path $ProjectData, $ProjectConfig | Out-Null

$externalData = Join-Path $ExternalRoot 'data'
$externalEnv = Join-Path $ExternalRoot 'config\.env'
$dbName = 'tabernacle-finance.sqlite'

function Copy-DbFiles($SourceDir, $DestDir) {
    New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
    foreach ($name in @($dbName, "$dbName-wal", "$dbName-shm")) {
        $src = Join-Path $SourceDir $name
        if (Test-Path $src) {
            Copy-Item $src (Join-Path $DestDir $name) -Force
        }
    }
    $backups = Join-Path $SourceDir 'backups'
    if (Test-Path $backups) {
        Copy-Item $backups (Join-Path $DestDir 'backups') -Recurse -Force -ErrorAction SilentlyContinue
    }
}

$extDb = Join-Path $externalData $dbName
$projDb = Join-Path $ProjectData $dbName

if (Test-Path $extDb) {
    $extSize = (Get-Item $extDb).Length
    $projSize = if (Test-Path $projDb) { (Get-Item $projDb).Length } else { 0 }
    $extWal = Join-Path $externalData "$dbName-wal"
    if ((Test-Path $extWal) -and (Get-Item $extWal).Length -gt $extSize) { $extSize = (Get-Item $extWal).Length }

    if ($extSize -ge $projSize) {
        Write-Host 'Copie des donnees depuis Documents\TabernacleERP-Donnees...' -ForegroundColor Cyan
        Copy-DbFiles $externalData $ProjectData
    }
}

if (Test-Path $externalEnv) {
    Copy-Item $externalEnv $LocalEnv -Force
} elseif (-not (Test-Path $LocalEnv)) {
    $template = Join-Path $Root 'installer\config\env.template'
    if (Test-Path $template) { Copy-Item $template $LocalEnv -Force }
}

# Repointe explicitement vers data\ du projet (plus de dossier externe)
$lines = @()
if (Test-Path $LocalEnv) {
    $lines = Get-Content $LocalEnv | Where-Object { $_ -notmatch '^\s*TABERNACLE_DATA_DIR=' -and $_ -notmatch '^\s*TABERNACLE_ENV_FILE=' }
}
$lines = @("TABERNACLE_DATA_DIR=$ProjectData") + $lines
$lines | Set-Content $LocalEnv -Encoding UTF8

Write-Host ''
Write-Host 'Donnees remises dans le projet :' -ForegroundColor Green
Write-Host "  $ProjectData"
Write-Host "  Config : $LocalEnv"
Write-Host ''
Write-Host 'Note : data\ et .env ne sont PAS envoyes sur GitHub (securite).' -ForegroundColor Yellow
Write-Host 'Vos operations restent sur ce PC dans le dossier du projet.' -ForegroundColor Gray
