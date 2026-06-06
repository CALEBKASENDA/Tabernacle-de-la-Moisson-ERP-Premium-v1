# Build installeur Windows - Tabernacle ERP Premium
# Usage : npm run installer:win

param(
    [string]$NodeVersion = '22.16.0',
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

Write-Step 'Tabernacle ERP - build installeur Windows'

if (-not $SkipBuild) {
    Write-Step 'Compilation de l application...'
    Push-Location $Root
    try {
        npm ci
        npm run build:all
        npm prune --omit=dev
    } finally {
        Pop-Location
    }
}

Write-Step 'Icone application...'
& (Join-Path $InstallerDir 'build-icon.ps1')

Write-Step 'Preparation du dossier staging...'
$stagingDirName = 'staging'
$Staging = Join-Path $InstallerDir $stagingDirName
if (Test-Path $Staging) {
    try {
        Remove-Item $Staging -Recurse -Force -ErrorAction Stop
    } catch {
        $stagingDirName = 'staging_work'
        $Staging = Join-Path $InstallerDir $stagingDirName
        Write-Host "Dossier staging verrouille - utilisation de $stagingDirName" -ForegroundColor Yellow
        if (Test-Path $Staging) {
            Remove-Item $Staging -Recurse -Force -ErrorAction SilentlyContinue
        }
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
Copy-Item (Join-Path $Root 'packages') (Join-Path $appDest 'packages') -Recurse
Copy-Item (Join-Path $Root 'apps') (Join-Path $appDest 'apps') -Recurse
Copy-Item (Join-Path $Root 'node_modules') (Join-Path $appDest 'node_modules') -Recurse

$apiDataStaging = Join-Path $appDest 'apps\api\data'
if (Test-Path $apiDataStaging) { Remove-Item $apiDataStaging -Recurse -Force }

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
Copy-Item (Join-Path $InstallerDir 'assets\tabernacle.ico') (Join-Path $Staging 'assets\tabernacle.ico') -Force

Write-Step "Telechargement Node.js $NodeVersion (Windows x64)..."
New-Item -ItemType Directory -Force -Path $Cache | Out-Null
$nodeCache = Join-Path $Cache "node-v$NodeVersion-win-x64.exe"
$nodeDest = Join-Path $Staging 'node\node.exe'
if (-not (Test-Path $nodeCache)) {
    $nodeUrl = "https://nodejs.org/dist/v$NodeVersion/win-x64/node.exe"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeCache -UseBasicParsing
}
Copy-Item $nodeCache $nodeDest -Force

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
        $setupExe = Get-ChildItem $Output -Filter 'TabernacleERP-Setup-*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        if ($setupExe) {
            Write-Host ''
            Write-Host "Installeur cree : $($setupExe.FullName)" -ForegroundColor Green
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
