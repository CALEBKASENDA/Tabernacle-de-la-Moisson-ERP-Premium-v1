# Build installeur Windows - Tabernacle ERP Premium
# Usage :
#   npm run installer:win              # Desktop Tauri natif (sans localhost)
#   npm run installer:win -- -LegacyWeb   # Ancien mode Edge + Node (secours)

param(
    [string]$NodeVersion = '24.16.0',
    [switch]$SkipBuild,
    [switch]$PortableOnly,
    [switch]$LegacyWeb,
    [switch]$UseInno
)

$ErrorActionPreference = 'Stop'

$InstallerDir = $PSScriptRoot
$Root = Split-Path -Parent $InstallerDir
$Staging = Join-Path $InstallerDir 'staging'
$Output = Join-Path $InstallerDir 'output'
$Cache = Join-Path $InstallerDir 'cache'
$TauriDir = Join-Path $Root 'apps\desktop\src-tauri'
$TauriTarget = Join-Path $TauriDir 'target\release'

function Write-Step($msg) {
    Write-Host ''
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Get-AppVersion {
    $versionFile = Join-Path $Root 'packages\domain\src\appVersion.ts'
    if (-not (Test-Path $versionFile)) { return '1.6.0' }
    $line = Get-Content $versionFile -Raw
    if ($line -match "APP_VERSION\s*=\s*'([^']+)'") { return $Matches[1] }
    return '1.6.0'
}

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

function Test-StagingReadyLegacy($stagingRoot) {
    $required = @(
        (Join-Path $stagingRoot 'node\node.exe'),
        (Join-Path $stagingRoot 'scripts\start-tabernacle.ps1'),
        (Join-Path $stagingRoot 'app\apps\api\dist\server.js'),
        (Join-Path $stagingRoot 'app\apps\desktop\dist\index.html'),
        (Join-Path $stagingRoot 'app\packages\db\dist\index.js'),
        (Join-Path $stagingRoot 'app\packages\domain\dist\index.js'),
        (Join-Path $stagingRoot 'app\node_modules\better-sqlite3'),
        (Join-Path $stagingRoot 'app\node_modules\fastify')
    )
    $missing = $required | Where-Object { -not (Test-Path $_) }
    if ($missing) {
        throw "Staging incomplet. Fichiers manquants:`n$($missing -join "`n")"
    }
}

function Test-StagingReadyTauri($stagingRoot) {
    $required = @(
        (Join-Path $stagingRoot 'TabernacleERP.exe'),
        (Join-Path $stagingRoot 'resources\node\node.exe'),
        (Join-Path $stagingRoot 'resources\app\apps\api\dist\embedded.js'),
        (Join-Path $stagingRoot 'resources\app\apps\api\dist\appFactory.js'),
        (Join-Path $stagingRoot 'resources\app\apps\desktop\dist\index.html'),
        (Join-Path $stagingRoot 'resources\app\node_modules\@tabernacle\erp-premium-db\dist\index.js'),
        (Join-Path $stagingRoot 'resources\app\node_modules\@tabernacle\erp-premium-domain\dist\index.js')
    )
    $missing = $required | Where-Object { -not (Test-Path $_) }
    if ($missing) {
        throw "Staging Tauri incomplet. Fichiers manquants:`n$($missing -join "`n")"
    }
}

function Build-Application {
    if ($SkipBuild) { return }
    Write-Step 'Compilation de l application...'
    Push-Location $Root
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install a echoue ($LASTEXITCODE)" }
        npm run build:all
        if ($LASTEXITCODE -ne 0) { throw "build:all a echoue ($LASTEXITCODE)" }
        $nodeVer = (node -p "process.versions.modules")
        $expected = switch -Regex ($NodeVersion) {
            '^24\.' { '137' }
            '^22\.' { '127' }
            default { $null }
        }
        if ($expected -and $nodeVer -ne $expected) {
            throw "Node local (MODULE $nodeVer) incompatible avec NodeVersion $NodeVersion (MODULE $expected attendu)."
        }
    } finally {
        Pop-Location
    }
}

function Build-TauriDesktop {
    param([switch]$SkipIfPresent)

    Write-Step 'Build desktop Tauri (API embarquee, sans localhost)...'
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        throw "Rust/Cargo introuvable. Installez https://rustup.rs/ ou utilisez -LegacyWeb."
    }

    $env:CARGO_TARGET_DIR = $TauriTarget
    $releaseExe = Join-Path $TauriTarget 'tabernacle-erp.exe'

    if ($SkipIfPresent -and (Test-Path $releaseExe)) {
        Write-Host "Binaire Tauri existant : $releaseExe" -ForegroundColor Gray
        return $releaseExe
    }

    & (Join-Path $Root 'scripts\prepare-tauri-resources.ps1') -NodeVersion $NodeVersion | Out-Host

    Push-Location (Join-Path $Root 'apps\desktop')
    try {
        $env:TAURI_SKIP_RESOURCE_PREP = '1'
        npm run tauri:build 2>&1 | Write-Host
        if ($LASTEXITCODE -ne 0) { throw "tauri:build a echoue ($LASTEXITCODE)" }
    } finally {
        Pop-Location
    }

    if (-not (Test-Path $releaseExe)) {
        throw "Binaire Tauri introuvable : $releaseExe"
    }
    return $releaseExe
}

function Prepare-TauriStaging($releaseExe) {
    Write-Step 'Preparation du staging Tauri pour Inno Setup...'
    foreach ($dirName in @('staging', 'staging_work')) {
        $dirPath = Join-Path $InstallerDir $dirName
        if (Test-Path $dirPath) { Remove-Item $dirPath -Recurse -Force -ErrorAction SilentlyContinue }
    }

    @('data', 'config', 'assets', 'scripts', 'resources') | ForEach-Object {
        New-Item -ItemType Directory -Force -Path (Join-Path $Staging $_) | Out-Null
    }

    Copy-Item $releaseExe (Join-Path $Staging 'TabernacleERP.exe') -Force
    Copy-Tree (Join-Path $TauriDir 'resources') (Join-Path $Staging 'resources')
    Copy-Item (Join-Path $InstallerDir 'scripts\*') (Join-Path $Staging 'scripts') -Recurse -Force
    Copy-Item (Join-Path $InstallerDir 'config\*') (Join-Path $Staging 'config') -Recurse -Force
    Copy-Item (Join-Path $InstallerDir 'assets\tabernacle.ico') (Join-Path $Staging 'assets\tabernacle.ico') -Force
    Set-Content -Path (Join-Path $Staging 'data\.gitkeep') -Value '' -Encoding ASCII

    & (Join-Path $Root 'scripts\link-workspace-packages.ps1') -AppRoot (Join-Path $Staging 'resources\app')

    Test-StagingReadyTauri $Staging
}

function Copy-TauriNsisInstaller($appVersion) {
    $nsisDir = Join-Path $TauriTarget 'bundle\nsis'
    if (-not (Test-Path $nsisDir)) { return $null }
    $setup = Get-ChildItem $nsisDir -Filter '*setup*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $setup) { return $null }

    New-Item -ItemType Directory -Force -Path $Output | Out-Null
    $dest = Join-Path $Output "TabernacleERP-Setup-$appVersion.exe"
    Copy-Item $setup.FullName $dest -Force
    return $dest
}

function Build-LegacyStaging {
    Write-Step 'Preparation du staging legacy (Edge + Node)...'
    foreach ($dirName in @('staging', 'staging_work')) {
        $dirPath = Join-Path $InstallerDir $dirName
        if (Test-Path $dirPath) { Remove-Item $dirPath -Recurse -Force -ErrorAction SilentlyContinue }
    }
    @('node', 'app', 'scripts', 'config', 'assets', 'data') | ForEach-Object {
        New-Item -ItemType Directory -Force -Path (Join-Path $Staging $_) | Out-Null
    }
    Set-Content -Path (Join-Path $Staging 'data\.gitkeep') -Value '' -Encoding ASCII

    $appDest = Join-Path $Staging 'app'
    Copy-Item (Join-Path $Root 'package.json') $appDest
    Copy-Item (Join-Path $Root 'package-lock.json') $appDest
    Copy-Item (Join-Path $Root 'tsconfig.base.json') $appDest
    Copy-Tree (Join-Path $Root 'packages') (Join-Path $appDest 'packages')
    Copy-Tree (Join-Path $Root 'apps') (Join-Path $appDest 'apps') @('mobile', 'src-tauri\target', 'src-tauri\resources', 'src-tauri\gen')
    $nodeExclude = @('.cache', '.vite', '@vitejs', 'vite', 'typescript', '@types', '@babel', 'esbuild', '@esbuild', 'eslint', 'prettier', 'rollup', '@rollup', 'lightningcss', 'postcss', 'tailwindcss', 'react-refresh', 'expo', '@expo', 'react-native', '@react-native', 'metro', '@react-native-community')
    Copy-Tree (Join-Path $Root 'node_modules') (Join-Path $appDest 'node_modules') $nodeExclude

    @(
        (Join-Path $appDest 'apps\api\src'),
        (Join-Path $appDest 'apps\desktop\src'),
        (Join-Path $appDest 'packages\domain\src'),
        (Join-Path $appDest 'packages\db\src')
    ) | ForEach-Object { if (Test-Path $_) { Remove-Item $_ -Recurse -Force } }

    Copy-Item (Join-Path $InstallerDir 'scripts\*') (Join-Path $Staging 'scripts') -Recurse
    Copy-Item (Join-Path $InstallerDir 'config\*') (Join-Path $Staging 'config') -Recurse
    Copy-Item (Join-Path $InstallerDir 'assets\tabernacle.ico') (Join-Path $Staging 'assets\tabernacle.ico') -Force
    Copy-Item (Join-Path $InstallerDir 'assets\boot.html') (Join-Path $Staging 'assets\boot.html') -Force

    & (Join-Path $Root 'scripts\link-workspace-packages.ps1') -AppRoot $appDest

    New-Item -ItemType Directory -Force -Path $Cache | Out-Null
    $nodeCache = Join-Path $Cache "node-v$NodeVersion-win-x64.exe"
    if (-not (Test-Path $nodeCache)) {
        Invoke-WebRequest -Uri "https://nodejs.org/dist/v$NodeVersion/win-x64/node.exe" -OutFile $nodeCache -UseBasicParsing
    }
    Copy-Item $nodeCache (Join-Path $Staging 'node\node.exe') -Force
    Test-StagingReadyLegacy $Staging
}

function Invoke-InnoCompile($tauriMode, $appVersion) {
    $isccCandidates = @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
    )
    $iscc = $isccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $iscc) { return $null }

    Write-Step 'Compilation Inno Setup...'
    $defines = @("/DStagingDir=staging", "/DMyAppVersion=$appVersion")
    if ($tauriMode) { $defines += '/DTauriMode=1' } else { $defines += '/DLegacyWeb=1' }
    & $iscc @defines (Join-Path $InstallerDir 'TabernacleERP.iss')
    if ($LASTEXITCODE -ne 0) { throw "Compilation Inno Setup echouee ($LASTEXITCODE)" }

    return Get-ChildItem $Output -Filter 'TabernacleERP-Setup-*.exe' |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

$AppVersion = Get-AppVersion
Write-Step "Tabernacle ERP - build installeur Windows v$AppVersion"

& (Join-Path $InstallerDir 'build-icon.ps1')
Build-Application

New-Item -ItemType Directory -Force -Path $Output | Out-Null

if ($LegacyWeb) {
    Build-LegacyStaging
} else {
    $releaseExe = Build-TauriDesktop -SkipIfPresent:$SkipBuild
    Prepare-TauriStaging $releaseExe
    $nsisPath = Copy-TauriNsisInstaller $AppVersion
    if ($nsisPath) {
        Write-Host ''
        Write-Host "Installeur Tauri NSIS : $nsisPath" -ForegroundColor Green
    }
}

if (-not $PortableOnly) {
  if ($UseInno -or $LegacyWeb -or -not (Test-Path (Join-Path $Output "TabernacleERP-Setup-$AppVersion.exe"))) {
    $setupExe = Invoke-InnoCompile (-not $LegacyWeb) $AppVersion
    if ($setupExe) {
        Write-Host ''
        Write-Host "Installeur Inno Setup : $($setupExe.FullName)" -ForegroundColor Green
    } elseif (-not $LegacyWeb) {
        Write-Host ''
        Write-Host 'Inno Setup non trouve — installeur NSIS Tauri utilise si disponible.' -ForegroundColor Yellow
    } else {
        throw 'Inno Setup 6 requis pour le mode legacy.'
    }
  }
}

if ($PortableOnly) {
    Write-Step 'Creation archive portable...'
    $zipPath = Join-Path $Output "TabernacleERP-Portable-$AppVersion.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Compress-Archive -Path (Join-Path $Staging '*') -DestinationPath $zipPath -CompressionLevel Optimal
    Write-Host ''
    Write-Host "Archive portable : $zipPath" -ForegroundColor Green
}

$stagingSize = (Get-ChildItem $Staging -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ''
Write-Host ('Taille staging : {0:N1} Mo' -f $stagingSize) -ForegroundColor Gray
