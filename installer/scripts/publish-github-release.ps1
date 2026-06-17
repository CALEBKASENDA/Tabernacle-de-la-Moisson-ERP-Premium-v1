# Publie la release v1.6.4 sur les 3 depots GitHub (installateur + archive portable)
param(
    [string]$Version = '',
    [string]$Root = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
)

$ErrorActionPreference = 'Stop'

if (-not $Version) {
    $versionFile = Join-Path $Root 'packages\domain\src\appVersion.ts'
    $raw = Get-Content $versionFile -Raw
    if ($raw -match "APP_VERSION\s*=\s*'([^']+)'") { $Version = $Matches[1] }
    else { $Version = '1.6.6' }
}

$setup = Join-Path $Root "installer\output\TabernacleERP-Setup-$Version.exe"
$portable = Join-Path $Root "installer\output\TabernacleERP-Portable-$Version.zip"
$notes = Join-Path $Root "installer\RELEASE-v$Version.md"

foreach ($file in @($setup, $notes)) {
    if (-not (Test-Path $file)) { throw "Fichier manquant : $file" }
}

gh auth status | Out-Host

$repos = @(
    'CALEBKASENDA/Tab.-de-la-Moisson-ERP-Premium-v1.3.1',
    'CALEBKASENDA/Tab-de-la-Moisson-ERP-Premium-AIO',
    'CALEBKASENDA/Tabernacle-de-la-Moisson-ERP-Premium-v1'
)

$assets = @($setup)
if (Test-Path $portable) { $assets += $portable }

foreach ($repo in $repos) {
    Write-Host "==> Release $Version sur $repo" -ForegroundColor Cyan
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    gh release delete "v$Version" --repo $repo --yes 2>&1 | Out-Null
    $ErrorActionPreference = $prev
    gh release create "v$Version" --repo $repo --title "Tabernacle ERP Premium v$Version" --notes-file $notes @assets
}

Write-Host "Releases publiees sur les 3 depots." -ForegroundColor Green
