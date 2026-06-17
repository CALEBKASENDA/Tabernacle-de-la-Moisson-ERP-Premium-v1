# Applique le compte administrateur depuis config\env.template vers config\.env
param(
    [string]$InstallRoot = (Split-Path -Parent $PSScriptRoot),
    [switch]$ForceReset
)

$ErrorActionPreference = 'Stop'

$configDir = Join-Path $InstallRoot 'config'
$template = Join-Path $configDir 'env.template'
$envFile = Join-Path $configDir '.env'

if (-not (Test-Path $template)) {
    throw "Modele introuvable : $template"
}

New-Item -ItemType Directory -Force -Path $configDir | Out-Null

$templateLines = Get-Content $template -Encoding UTF8
$bootstrapKeys = @(
    'TABERNACLE_BOOTSTRAP_EMAIL',
    'TABERNACLE_BOOTSTRAP_PASSWORD',
    'TABERNACLE_BOOTSTRAP_NAME'
)

function Read-EnvMap([string]$path) {
    $map = @{}
    if (-not (Test-Path $path)) { return $map }
    foreach ($line in Get-Content $path -Encoding UTF8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        $eq = $trimmed.IndexOf('=')
        if ($eq -le 0) { continue }
        $key = $trimmed.Substring(0, $eq).Trim()
        $value = $trimmed.Substring($eq + 1).Trim()
        $map[$key] = $value
    }
    return $map
}

$templateMap = Read-EnvMap $template
$existingMap = Read-EnvMap $envFile

$changed = $false
foreach ($key in $bootstrapKeys) {
    if (-not $templateMap.ContainsKey($key)) { continue }
    if (-not $existingMap.ContainsKey($key) -or $existingMap[$key] -ne $templateMap[$key]) {
        $changed = $true
        break
    }
}

$placeholderEmails = @(
    'admin@votre-eglise.local',
    'admin@local.dev',
    'admin@tabernacle.local'
)
$needsBootstrap = -not (Test-Path $envFile)
if (-not $needsBootstrap -and $existingMap.ContainsKey('TABERNACLE_BOOTSTRAP_EMAIL')) {
    if ($placeholderEmails -contains $existingMap['TABERNACLE_BOOTSTRAP_EMAIL'].ToLower()) {
        $needsBootstrap = $true
        $changed = $true
    }
}

if (-not (Test-Path $envFile)) {
    Copy-Item $template $envFile -Force
    $existingMap = Read-EnvMap $envFile
    $changed = $true
    Write-Host "Fichier .env cree depuis env.template"
} else {
    $lines = Get-Content $envFile -Encoding UTF8
    $out = New-Object System.Collections.Generic.List[string]
    $seen = @{}

    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) {
            $out.Add($line)
            continue
        }
        $eq = $trimmed.IndexOf('=')
        if ($eq -le 0) {
            $out.Add($line)
            continue
        }
        $key = $trimmed.Substring(0, $eq).Trim()
        if ($bootstrapKeys -contains $key -and $templateMap.ContainsKey($key)) {
            $out.Add("$key=$($templateMap[$key])")
            $seen[$key] = $true
        } elseif ($key -eq 'TABERNACLE_DATA_DIR') {
            # Ne pas forcer un chemin de developpement dans l'installation
            continue
        } else {
            $out.Add($line)
            $seen[$key] = $true
        }
    }

    foreach ($key in $bootstrapKeys) {
        if (-not $seen.ContainsKey($key) -and $templateMap.ContainsKey($key)) {
            $out.Add("$key=$($templateMap[$key])")
        }
    }

    Set-Content -Path $envFile -Value $out -Encoding utf8NoBOM
}

if ($ForceReset -or $changed -or $needsBootstrap) {
    $content = Get-Content $envFile -Encoding UTF8
    $hasReset = $false
    $resetOut = New-Object System.Collections.Generic.List[string]
    foreach ($line in $content) {
        if ($line -match '^\s*TABERNACLE_BOOTSTRAP_RESET\s*=') {
            $resetOut.Add('TABERNACLE_BOOTSTRAP_RESET=true')
            $hasReset = $true
        } else {
            $resetOut.Add($line)
        }
    }
    if (-not $hasReset) {
        $resetOut.Add('TABERNACLE_BOOTSTRAP_RESET=true')
    }
    Set-Content -Path $envFile -Value $resetOut -Encoding utf8NoBOM
    Write-Host "Mot de passe administrateur sera synchronise au prochain demarrage."
}

Write-Host "Configuration administrateur appliquee : $($templateMap['TABERNACLE_BOOTSTRAP_EMAIL'])" -ForegroundColor Green
Write-Host "Relancez Tabernacle ERP, puis remettez TABERNACLE_BOOTSTRAP_RESET=false apres connexion."
