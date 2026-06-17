# Staging minimal pour Inno (sans src-tauri recursif ni sources dev)
param(
    [string]$Root = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)),
    [string]$StagingName = 'staging_clean',
    [string]$ExeSource = ''
)

$ErrorActionPreference = 'Stop'
$Staging = Join-Path $Root "installer\$StagingName"
$Res = Join-Path $Staging 'resources'
$App = Join-Path $Res 'app'
$CacheNode = Join-Path $Root 'installer\cache\node-v24.16.0-win-x64.exe'

function Copy-Tree($src, $dest) {
    if (-not (Test-Path $src)) { return }
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    & robocopy $src $dest /E /XJ /R:1 /W:1 /NFL /NDL /NJH /NJS | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Copie echouee ($LASTEXITCODE): $src" }
}

if (Test-Path $Staging) {
    $empty = Join-Path $env:TEMP "tab-empty-$(Get-Random)"
    New-Item -ItemType Directory -Force -Path $empty | Out-Null
    cmd /c "robocopy `"$empty`" `"$Staging`" /MIR /R:1 /W:1 /NFL /NDL /NJH /NJS >nul"
    Remove-Item $empty -Force -Recurse -ErrorAction SilentlyContinue
    Remove-Item $Staging -Force -Recurse -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Force -Path "$Staging\data","$Staging\config","$Staging\assets","$Staging\scripts" | Out-Null
New-Item -ItemType Directory -Force -Path "$Res\node","$App\apps\api\dist","$App\apps\desktop\dist","$App\packages\db\dist","$App\packages\domain\dist" | Out-Null

if (-not $ExeSource) {
    $candidates = @(
        (Join-Path $Root 'apps\desktop\src-tauri\target\release\tabernacle-erp.exe'),
        (Join-Path $Root 'installer\output\TabernacleERP-Portable-1.6.4.zip')
    )
    if (Test-Path $candidates[0]) { $ExeSource = $candidates[0] }
    elseif (Test-Path $candidates[1]) {
        $tmp = Join-Path $env:TEMP "tabernacle-exe-$(Get-Random)"
        Expand-Archive $candidates[1] $tmp -Force
        $ExeSource = Join-Path $tmp 'TabernacleERP.exe'
    }
}
if (-not $ExeSource -or -not (Test-Path $ExeSource)) {
    throw 'Executable TabernacleERP introuvable pour le staging.'
}
Copy-Item $ExeSource (Join-Path $Staging 'TabernacleERP.exe') -Force

if (-not (Test-Path $CacheNode)) {
    throw "Node cache manquant : $CacheNode"
}
Copy-Item $CacheNode (Join-Path $Res 'node\node.exe') -Force

Copy-Tree (Join-Path $Root 'apps\api\dist') (Join-Path $App 'apps\api\dist')
Copy-Tree (Join-Path $Root 'apps\desktop\dist') (Join-Path $App 'apps\desktop\dist')
Copy-Tree (Join-Path $Root 'packages\db\dist') (Join-Path $App 'packages\db\dist')
Copy-Tree (Join-Path $Root 'packages\domain\dist') (Join-Path $App 'packages\domain\dist')

Copy-Item (Join-Path $Root 'package.json') $App
Copy-Item (Join-Path $Root 'package-lock.json') $App -ErrorAction SilentlyContinue
Copy-Item (Join-Path $Root 'tsconfig.base.json') $App

$nodeExclude = @(
    '.cache', '.vite', '@vitejs', 'vite', 'typescript', '@types', '@babel',
    'esbuild', '@esbuild', 'eslint', 'prettier', 'rollup', '@rollup',
    'lightningcss', 'postcss', 'tailwindcss', 'react-refresh', 'expo',
    '@expo', 'react-native', '@react-native', 'metro', '@react-native-community'
)
$xd = @()
foreach ($name in $nodeExclude) { if ($name) { $xd += '/XD'; $xd += $name } }
New-Item -ItemType Directory -Force -Path (Join-Path $App 'node_modules') | Out-Null
& robocopy (Join-Path $Root 'node_modules') (Join-Path $App 'node_modules') /E /XJ /R:1 /W:1 /NFL /NDL /NJH /NJS @xd | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Copie node_modules echouee ($LASTEXITCODE)" }

& (Join-Path $Root 'scripts\link-workspace-packages.ps1') -AppRoot $App

Copy-Item (Join-Path $Root 'installer\scripts\*') (Join-Path $Staging 'scripts') -Recurse -Force
Copy-Item (Join-Path $Root 'installer\config\*') (Join-Path $Staging 'config') -Recurse -Force
Copy-Item (Join-Path $Root 'installer\assets\tabernacle.ico') (Join-Path $Staging 'assets\tabernacle.ico') -Force
Set-Content (Join-Path $Staging 'data\.gitkeep') '' -Encoding ASCII

Write-Host "Staging minimal pret : $Staging" -ForegroundColor Green
