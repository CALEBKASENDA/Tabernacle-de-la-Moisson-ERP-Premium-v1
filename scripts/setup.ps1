# Configuration initiale — Tabernacle ERP Premium
# Usage : npm run setup

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function New-RandomSecret([int]$bytes = 32) {
  $buf = New-Object byte[] $bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($buf)
  return [Convert]::ToBase64String($buf)
}

Write-Host '=== Tabernacle ERP — configuration initiale ===' -ForegroundColor Cyan

if (-not (Test-Path 'node_modules')) {
  Write-Host 'Installation des dépendances npm…'
  npm install
}

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'Créé : .env'
}

if (-not (Test-Path 'data')) {
  New-Item -ItemType Directory -Path 'data' | Out-Null
  Write-Host 'Créé : data\'
}

$configDir = Join-Path $root 'config'
if (-not (Test-Path $configDir)) {
  New-Item -ItemType Directory -Path $configDir | Out-Null
}

$configEnv = Join-Path $configDir '.env'
$configExample = Join-Path $configDir 'env.example'
if (-not (Test-Path $configEnv)) {
  if (Test-Path $configExample) {
    Copy-Item $configExample $configEnv
  } else {
    @'
TABERNACLE_DATA_DIR=../data
'@ | Set-Content -Path $configEnv -Encoding UTF8
  }
  Write-Host 'Créé : config\.env'
}

function Set-EnvValue($file, $key, $value) {
  $lines = @()
  if (Test-Path $file) { $lines = Get-Content $file }
  $found = $false
  $out = foreach ($line in $lines) {
    if ($line -match "^$key=") {
      $found = $true
      "$key=$value"
    } else { $line }
  }
  if (-not $found) { $out += "$key=$value" }
  $out | Set-Content -Path $file -Encoding UTF8
}

$dbKey = New-RandomSecret
$syncToken = New-RandomSecret 24
$jwtSecret = New-RandomSecret

Set-EnvValue '.env' 'TABERNACLE_DB_KEY' $dbKey
Set-EnvValue '.env' 'TABERNACLE_SYNC_TOKEN' $syncToken
Set-EnvValue '.env' 'TABERNACLE_JWT_SECRET' $jwtSecret

if (-not (Select-String -Path '.env' -Pattern '^TABERNACLE_BOOTSTRAP_EMAIL=' -Quiet)) {
  Set-EnvValue '.env' 'TABERNACLE_BOOTSTRAP_EMAIL' 'admin@local.dev'
  Set-EnvValue '.env' 'TABERNACLE_BOOTSTRAP_PASSWORD' 'ChangeMe123!'
  Set-EnvValue '.env' 'TABERNACLE_BOOTSTRAP_NAME' 'Administrateur'
}

Write-Host ''
Write-Host 'Configuration terminée.' -ForegroundColor Green
Write-Host '  npm run dev                  — développement'
Write-Host '  npm run desktop:native:dev   — application Tauri'
Write-Host '  npm run installer:win        — installateur Windows'
Write-Host ''
Write-Host 'Éditez .env pour le compte admin et le déploiement VM (DOMAIN, ACME_EMAIL).'
