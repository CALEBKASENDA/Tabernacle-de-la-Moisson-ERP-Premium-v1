# Liens node_modules/@tabernacle/* -> packages/* (indispensable hors monorepo developpeur)
param(
    [Parameter(Mandatory = $true)]
    [string]$AppRoot
)

$ErrorActionPreference = 'Stop'

$tabernacleDir = Join-Path $AppRoot 'node_modules\@tabernacle'
New-Item -ItemType Directory -Force -Path $tabernacleDir | Out-Null

$packages = @{
    'erp-premium-db'     = 'db'
    'erp-premium-domain' = 'domain'
}

foreach ($entry in $packages.GetEnumerator()) {
    $linkName = $entry.Key
    $pkgFolder = $entry.Value
    $link = Join-Path $tabernacleDir $linkName
    $target = Join-Path $AppRoot "packages\$pkgFolder"

    if (-not (Test-Path (Join-Path $target 'dist\index.js'))) {
        throw "Package workspace manquant : $target\dist\index.js"
    }

    if (Test-Path $link) {
        Remove-Item $link -Recurse -Force -ErrorAction SilentlyContinue
    }

    $targetResolved = (Resolve-Path $target).Path
    New-Item -ItemType Junction -Path $link -Target $targetResolved -Force | Out-Null

    $resolvedMain = Join-Path $link 'dist\index.js'
    if (-not (Test-Path $resolvedMain)) {
        throw "Lien workspace invalide : $linkName -> $targetResolved"
    }
}

Write-Host "Liens workspace @tabernacle prets dans $tabernacleDir"
