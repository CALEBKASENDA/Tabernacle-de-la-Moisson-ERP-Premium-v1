# Copie Node + application dans src-tauri/resources pour le bundle Tauri (mode embarque IPC)
param(
    [string]$NodeVersion = '24.16.0'
)

$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$TauriRes = Join-Path $Root 'apps\desktop\src-tauri\resources'
$AppDest = Join-Path $TauriRes 'app'
$NodeDest = Join-Path $TauriRes 'node'
$ScriptsDest = Join-Path $TauriRes 'scripts'
$InstallerScripts = Join-Path $Root 'installer\scripts'
$InstallerStaging = Join-Path $Root 'installer\staging'
$Cache = Join-Path $Root 'installer\cache'

function Copy-Tree($src, $dest, [string[]]$ExcludeDirs = @()) {
    if (-not (Test-Path $src)) { return }
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    $xd = @()
    foreach ($name in $ExcludeDirs) { if ($name) { $xd += '/XD'; $xd += $name } }
    & robocopy $src $dest /E /XJ /R:2 /W:2 /NFL /NDL /NJH /NJS /NC /NS /NP @xd | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw "Copie echouee ($LASTEXITCODE): $src -> $dest"
    }
}

function Test-StagingApp($appRoot) {
    @(
        (Join-Path $appRoot 'apps\api\dist\server.js'),
        (Join-Path $appRoot 'apps\api\dist\embedded.js'),
        (Join-Path $appRoot 'apps\api\dist\appFactory.js'),
        (Join-Path $appRoot 'apps\desktop\dist\index.html'),
        (Join-Path $appRoot 'packages\db\dist\index.js'),
        (Join-Path $appRoot 'packages\domain\dist\index.js'),
        (Join-Path $appRoot 'node_modules\better-sqlite3'),
        (Join-Path $appRoot 'node_modules\@tabernacle\erp-premium-db\dist\index.js'),
        (Join-Path $appRoot 'node_modules\@tabernacle\erp-premium-domain\dist\index.js')
    ) | ForEach-Object {
        if (-not (Test-Path $_)) { return $false }
    }
    return $true
}

Write-Host '==> Preparation ressources Tauri (API embarquee + Node)...'

$embeddedJs = Join-Path $Root 'apps\api\dist\embedded.js'
if (-not (Test-Path $embeddedJs)) {
    throw "API embarquee manquante : $embeddedJs - lancez npm run build -w @tabernacle/erp-premium-api"
}

if (Test-Path $TauriRes) {
    Remove-Item $TauriRes -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $AppDest, $NodeDest, $ScriptsDest | Out-Null

$stagingApp = Join-Path $InstallerStaging 'app'
$stagingTauriApp = Join-Path $InstallerStaging 'resources\app'
$stagingNode = Join-Path $InstallerStaging 'node\node.exe'
$stagingTauriNode = Join-Path $InstallerStaging 'resources\node\node.exe'
if ((Test-Path $stagingTauriApp) -and (Test-Path $stagingTauriNode) -and (Test-StagingApp $stagingTauriApp) -and -not (Test-Path (Join-Path $stagingTauriApp 'apps\desktop\src-tauri\resources'))) {
    Write-Host 'Reutilisation de installer/staging/resources (rapide)...'
    Copy-Tree $stagingTauriApp $AppDest
    Copy-Item $stagingTauriNode (Join-Path $NodeDest 'node.exe') -Force
} elseif ((Test-Path $stagingApp) -and (Test-Path $stagingNode) -and (Test-StagingApp $stagingApp)) {
    Write-Host 'Reutilisation de installer/staging (rapide)...'
    Copy-Tree $stagingApp $AppDest
    Copy-Item $stagingNode (Join-Path $NodeDest 'node.exe') -Force
} else {
    Write-Host 'Construction ressources depuis le monorepo...'
    Copy-Item (Join-Path $Root 'package.json') $AppDest
    Copy-Item (Join-Path $Root 'package-lock.json') $AppDest
    Copy-Item (Join-Path $Root 'tsconfig.base.json') $AppDest
    Copy-Tree (Join-Path $Root 'packages') (Join-Path $AppDest 'packages')
    Copy-Tree (Join-Path $Root 'apps') (Join-Path $AppDest 'apps') @(
        'mobile', 'src-tauri\target', 'src-tauri\resources', 'src-tauri\gen'
    )
    $nodeExclude = @(
        '.cache', '.vite', '@vitejs', 'vite', 'typescript', '@types', '@babel',
        'esbuild', '@esbuild', 'eslint', 'prettier', 'rollup', '@rollup',
        'lightningcss', 'postcss', 'tailwindcss', 'react-refresh', 'expo',
        '@expo', 'react-native', '@react-native', 'metro', '@react-native-community'
    )
    Copy-Tree (Join-Path $Root 'node_modules') (Join-Path $AppDest 'node_modules') $nodeExclude
    @(
        (Join-Path $AppDest 'apps\api\src'),
        (Join-Path $AppDest 'apps\desktop\src'),
        (Join-Path $AppDest 'apps\mobile'),
        (Join-Path $AppDest 'apps\desktop\src-tauri'),
        (Join-Path $AppDest 'packages\domain\src'),
        (Join-Path $AppDest 'packages\db\src')
    ) | ForEach-Object {
        if (Test-Path $_) { Remove-Item $_ -Recurse -Force }
    }
    New-Item -ItemType Directory -Force -Path $Cache | Out-Null
    $nodeCache = Join-Path $Cache "node-v$NodeVersion-win-x64.exe"
    if (-not (Test-Path $nodeCache)) {
        Invoke-WebRequest -Uri "https://nodejs.org/dist/v$NodeVersion/win-x64/node.exe" -OutFile $nodeCache -UseBasicParsing
    }
    Copy-Item $nodeCache (Join-Path $NodeDest 'node.exe') -Force
}

# Toujours aligner API + UI + packages compiles sur la version courante
$apiDist = Join-Path $Root 'apps\api\dist'
if (-not (Test-Path (Join-Path $apiDist 'appFactory.js'))) {
    throw "appFactory.js manquant : lancez npm run build -w @tabernacle/erp-premium-api"
}
Copy-Tree $apiDist (Join-Path $AppDest 'apps\api\dist')

foreach ($pkg in @('domain', 'db')) {
    $pkgDist = Join-Path $Root "packages\$pkg\dist"
    if (Test-Path $pkgDist) {
        Copy-Tree $pkgDist (Join-Path $AppDest "packages\$pkg\dist")
    }
}

$desktopDist = Join-Path $Root 'apps\desktop\dist'
if (Test-Path $desktopDist) {
    Copy-Tree $desktopDist (Join-Path $AppDest 'apps\desktop\dist')
}

$required = @(
    (Join-Path $AppDest 'apps\api\dist\embedded.js'),
    (Join-Path $AppDest 'apps\api\dist\appFactory.js'),
    (Join-Path $AppDest 'apps\desktop\dist\index.html')
)
$missing = $required | Where-Object { -not (Test-Path $_) }
if ($missing) {
    throw "Ressources Tauri incompletes :`n$($missing -join "`n")"
}

& (Join-Path $Root 'scripts\link-workspace-packages.ps1') -AppRoot $AppDest

$required += @(
    (Join-Path $AppDest 'node_modules\@tabernacle\erp-premium-db\dist\index.js'),
    (Join-Path $AppDest 'node_modules\@tabernacle\erp-premium-domain\dist\index.js')
)
$missing = $required | Where-Object { -not (Test-Path $_) }
if ($missing) {
    throw "Ressources Tauri incompletes (workspace) :`n$($missing -join "`n")"
}

@(
    'Export-Portable.cmd', 'Export-Portable.ps1',
    'Import-Portable.cmd', 'Import-Portable.ps1',
    'Stop-Tabernacle.cmd', 'stop-tabernacle.ps1'
) | ForEach-Object {
    $src = Join-Path $InstallerScripts $_
    if (Test-Path $src) { Copy-Item $src (Join-Path $ScriptsDest $_) -Force }
}

$envTemplate = Join-Path $Root 'installer\config\env.template'
if (Test-Path $envTemplate) {
    New-Item -ItemType Directory -Force -Path (Join-Path $TauriRes 'config') | Out-Null
    Copy-Item $envTemplate (Join-Path $TauriRes 'config\env.template') -Force
}

Write-Host "Ressources Tauri pretes : $TauriRes"
