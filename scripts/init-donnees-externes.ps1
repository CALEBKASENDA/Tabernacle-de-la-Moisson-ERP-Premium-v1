# Initialise les données ERP HORS du dossier Git (Documents\TabernacleERP-Donnees)
# Usage : npm run donnees:init

param(
    [string]$ExternalRoot = (Join-Path $env:USERPROFILE 'Documents\TabernacleERP-Donnees')
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$ProjectData = Join-Path $Root 'data'
$ProjectConfig = Join-Path $Root 'config'
$LocalEnv = Join-Path $ProjectConfig '.env'

$DataDir = Join-Path $ExternalRoot 'data'
$ConfigDir = Join-Path $ExternalRoot 'config'
$BackupDir = Join-Path $ExternalRoot 'backups'
$ExternalEnv = Join-Path $ConfigDir '.env'

Write-Host ''
Write-Host '==> Donnees Tabernacle ERP — hors GitHub' -ForegroundColor Cyan
Write-Host "Dossier externe : $ExternalRoot"

New-Item -ItemType Directory -Force -Path $DataDir, $ConfigDir, $BackupDir | Out-Null

$dbName = 'tabernacle-finance.sqlite'
$projectDb = Join-Path $ProjectData $dbName
$externalDb = Join-Path $DataDir $dbName

if ((Test-Path $projectDb) -and -not (Test-Path $externalDb)) {
    Write-Host 'Migration de la base depuis data\ du projet...' -ForegroundColor Yellow
    Copy-Item $projectDb $externalDb -Force
    foreach ($ext in @('-wal', '-shm')) {
        $src = "$projectDb$ext"
        if (Test-Path $src) { Copy-Item $src "$externalDb$ext" -Force }
    }
    if (Test-Path (Join-Path $ProjectData 'backups')) {
        Copy-Item (Join-Path $ProjectData 'backups') (Join-Path $DataDir 'backups') -Recurse -Force -ErrorAction SilentlyContinue
    }
    Write-Host 'Migration terminee.' -ForegroundColor Green
}

if (-not (Test-Path $ExternalEnv)) {
    $template = Join-Path $Root 'installer\config\env.template'
    if (Test-Path $template) {
        Copy-Item $template $ExternalEnv -Force
    } else {
        @"
TABERNACLE_CHURCH_ID=church_default
TABERNACLE_CHURCH_NAME=Tabernacle de la Moisson
TABERNACLE_BOOTSTRAP_EMAIL=admin@votre-eglise.local
TABERNACLE_BOOTSTRAP_PASSWORD=ChangezMoi-Tres-Fort-2026!
TABERNACLE_BOOTSTRAP_NAME=Administrateur
"@ | Set-Content $ExternalEnv -Encoding UTF8
    }
}

New-Item -ItemType Directory -Force -Path $ProjectConfig | Out-Null
@"
# Genere par init-donnees-externes.ps1 — donnees HORS du depot Git
TABERNACLE_DATA_DIR=$DataDir
TABERNACLE_ENV_FILE=$ExternalEnv
"@ | Set-Content $LocalEnv -Encoding UTF8

@"
Tabernacle de la Moisson ERP — DONNEES (hors GitHub)

Ce dossier contient vos donnees metier. Il n'est PAS sur GitHub.
Sauvegardez-le regulierement (cle USB, OneDrive, autre PC).

Structure :
  data\     — base SQLite tabernacle-finance.sqlite
  config\   — .env (secrets, mots de passe)
  backups\  — copies automatiques / manuelles

Pour restaurer sur un autre PC :
  1. Copiez tout ce dossier TabernacleERP-Donnees
  2. Installez l'ERP depuis GitHub
  3. npm run donnees:init  (ou indiquez ce chemin dans config\.env)

Initialise le : $(Get-Date -Format 'yyyy-MM-dd HH:mm')
"@ | Set-Content (Join-Path $ExternalRoot 'LISEZMOI.txt') -Encoding UTF8

Write-Host ''
Write-Host 'Configuration :' -ForegroundColor Green
Write-Host "  Donnees  : $DataDir"
Write-Host "  Config   : $ExternalEnv"
Write-Host "  Backups  : $BackupDir"
Write-Host "  Projet   : $LocalEnv"
Write-Host ''
Write-Host 'Vos donnees ne seront plus dans le dossier Git du projet.' -ForegroundColor Green
