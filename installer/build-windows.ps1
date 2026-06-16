# Build installeur Windows - Tabernacle ERP Premium
# Usage : npm run installer:win

param(
    [string]$NodeVersion = '24.16.0',
    [switch]$SkipBuild,
    [switch]$PortableOnly
)

$ErrorActionPreference = 'Stop'

$InstallerDir = $PSScriptRoot
$Root = Split-Path -Parent $InstallerDir
$Staging = Join-Path $InstallerDir 'staging'
$Output = Join-Path $InstallerDir 'output'
$Cache = Join-Path $InstallerDir 'cache'

function Write-Step($msg) {
    Write-Host ''
    Write-Host "==> $msg" -ForegroundColor Cyan
}

function Copy-Tree($src, $dest, [string[]]$ExcludeDirs = @()) {
    if (-not (Test-Path $src)) { return }
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    $xd = @()
  foreach ($name in $ExcludeDirs) { if ($name) { $xd += "/XD"; $xd += $name } }
    & robocopy $src $dest /E /XJ /R:2 /W:2 /NFL /NDL /NJH /NJS /NC /NS /NP @xd | Out-Null
    if ($LASTEXITCODE -ge 8) {
        throw "Copie echouee ($LASTEXITCODE): $src -> $dest"
    }
}

function Test-StagingReady($stagingRoot) {
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

Write-Step 'Tabernacle ERP - build installeur Windows'

if (-not $SkipBuild) {
    Write-Step 'Compilation de l application...'
    Push-Location $Root
    try {
        # npm ci / prune break npm workspaces (workspace:*); install + build only.
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install a echoue ($LASTEXITCODE)" }
        npm run build:all
        if ($LASTEXITCODE -ne 0) { throw "build:all a echoue ($LASTEXITCODE)" }
        # Modules natifs (better-sqlite3) : aligner la version Node du build avec NodeVersion ci-dessus.
        $nodeVer = (node -p "process.versions.modules")
        $expected = switch -Regex ($NodeVersion) {
            '^24\.' { '137' }
            '^22\.' { '127' }
            default { $null }
        }
        if ($expected -and $nodeVer -ne $expected) {
            throw "Node local (MODULE $nodeVer) incompatible avec NodeVersion $NodeVersion (MODULE $expected attendu). Utilisez la meme version majeure."
        }
    } finally {
        Pop-Location
    }
}

Write-Step 'Icone application...'
& (Join-Path $InstallerDir 'build-icon.ps1')

Write-Step 'Preparation du dossier staging...'
$stagingDirName = 'staging'
$Staging = Join-Path $InstallerDir $stagingDirName
foreach ($dirName in @('staging', 'staging_work')) {
    $dirPath = Join-Path $InstallerDir $dirName
    if (Test-Path $dirPath) {
        Remove-Item $dirPath -Recurse -Force -ErrorAction SilentlyContinue
    }
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
Copy-Tree (Join-Path $Root 'apps') (Join-Path $appDest 'apps') @(
    'mobile',
    'src-tauri\target',
    'src-tauri\resources',
    'src-tauri\gen'
)
$nodeExclude = @(
    '.cache', '.vite', '@vitejs', 'vite', 'typescript', '@types', '@babel',
    'esbuild', '@esbuild', 'eslint', 'prettier', 'rollup', '@rollup',
    'lightningcss', 'postcss', 'tailwindcss', 'react-refresh', 'expo',
    '@expo', 'react-native', '@react-native', 'metro', '@react-native-community'
)
Copy-Tree (Join-Path $Root 'node_modules') (Join-Path $appDest 'node_modules') $nodeExclude

$apiDataStaging = Join-Path $appDest 'apps\api\data'
if (Test-Path $apiDataStaging) { Remove-Item $apiDataStaging -Recurse -Force }

Write-Step 'Exclusion des artefacts inutiles (Tauri, mobile, caches)...'
@(
    (Join-Path $appDest 'apps\mobile'),
    (Join-Path $appDest 'apps\desktop\src-tauri\target'),
    (Join-Path $appDest 'apps\desktop\src-tauri\resources'),
    (Join-Path $appDest 'apps\desktop\src-tauri\gen'),
    (Join-Path $appDest 'apps\desktop\node_modules\.vite')
) | ForEach-Object {
    if (Test-Path $_) { Remove-Item $_ -Recurse -Force -ErrorAction SilentlyContinue }
}

Write-Step 'Nettoyage des sources TypeScript...'
@(
    (Join-Path $appDest 'apps\api\src'),
    (Join-Path $appDest 'apps\desktop\src'),
    (Join-Path $appDest 'packages\domain\src'),
    (Join-Path $appDest 'packages\db\src')
) | ForEach-Object {
    if (Test-Path $_) { Remove-Item $_ -Recurse -Force }
}

Get-ChildItem $appDest -Recurse -Directory -Filter 'src' -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' } |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Write-Step 'Copie des scripts de lancement...'
Copy-Item (Join-Path $InstallerDir 'scripts\*') (Join-Path $Staging 'scripts') -Recurse
Copy-Item (Join-Path $InstallerDir 'config\*') (Join-Path $Staging 'config') -Recurse
$projectEnv = Join-Path $Root 'config\.env'
if (Test-Path $projectEnv) {
    Copy-Item $projectEnv (Join-Path $Staging 'config\.env') -Force
}
Copy-Item (Join-Path $InstallerDir 'assets\tabernacle.ico') (Join-Path $Staging 'assets\tabernacle.ico') -Force
Copy-Item (Join-Path $InstallerDir 'assets\boot.html') (Join-Path $Staging 'assets\boot.html') -Force

Write-Step "Telechargement Node.js $NodeVersion (Windows x64)..."
New-Item -ItemType Directory -Force -Path $Cache | Out-Null
$nodeCache = Join-Path $Cache "node-v$NodeVersion-win-x64.exe"
$nodeDest = Join-Path $Staging 'node\node.exe'
if (-not (Test-Path $nodeCache)) {
    $nodeUrl = "https://nodejs.org/dist/v$NodeVersion/win-x64/node.exe"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeCache -UseBasicParsing
}
Copy-Item $nodeCache $nodeDest -Force

Write-Step 'Validation du staging...'
Test-StagingReady $Staging

New-Item -ItemType Directory -Force -Path $Output | Out-Null

if (-not $PortableOnly) {
    $isccCandidates = @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
        "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
    )
    $iscc = $isccCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

    if ($iscc) {
        Write-Step 'Compilation Inno Setup...'
        & $iscc "/DStagingDir=$stagingDirName" (Join-Path $InstallerDir 'TabernacleERP.iss')
        if ($LASTEXITCODE -ne 0) {
            throw "Compilation Inno Setup echouee ($LASTEXITCODE). Verifiez l installation Inno Setup 6."
        }
        $setupExe = Get-ChildItem $Output -Filter 'TabernacleERP-Setup-*.exe' |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($setupExe) {
            Write-Host ''
            Write-Host "Installeur cree : $($setupExe.FullName)" -ForegroundColor Green
        } else {
            throw 'Aucun installeur TabernacleERP-Setup-*.exe dans output/.'
        }
    } else {
        Write-Host ''
        Write-Host 'Inno Setup 6 non trouve - creation archive portable.' -ForegroundColor Yellow
        Write-Host 'Installez Inno Setup : https://jrsoftware.org/isinfo.php' -ForegroundColor Yellow
        $PortableOnly = $true
    }
}

if ($PortableOnly) {
    Write-Step 'Creation archive portable...'
    $zipPath = Join-Path $Output "TabernacleERP-Portable-$NodeVersion.zip"
    if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
    Compress-Archive -Path (Join-Path $Staging '*') -DestinationPath $zipPath -CompressionLevel Optimal
    Write-Host ''
    Write-Host "Archive portable : $zipPath" -ForegroundColor Green
    Write-Host 'Extrayez puis lancez scripts\Launch-Tabernacle.vbs' -ForegroundColor Green
}

$stagingSize = (Get-ChildItem $Staging -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ''
Write-Host ('Taille staging : {0:N1} Mo' -f $stagingSize) -ForegroundColor Gray
