# Copie Node + application dans src-tauri/resources pour le bundle Tauri
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
$TauriRes = Join-Path $Root 'apps\desktop\src-tauri\resources'
$AppDest = Join-Path $TauriRes 'app'
$NodeDest = Join-Path $TauriRes 'node'

Write-Host '==> Préparation ressources Tauri...'

if (Test-Path $TauriRes) {
    Remove-Item $TauriRes -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $AppDest, $NodeDest | Out-Null

Copy-Item (Join-Path $Root 'package.json') $AppDest
Copy-Item (Join-Path $Root 'package-lock.json') $AppDest
Copy-Item (Join-Path $Root 'tsconfig.base.json') $AppDest
Copy-Item (Join-Path $Root 'packages') (Join-Path $AppDest 'packages') -Recurse
Copy-Item (Join-Path $Root 'apps') (Join-Path $AppDest 'apps') -Recurse
Copy-Item (Join-Path $Root 'node_modules') (Join-Path $AppDest 'node_modules') -Recurse

@(
    (Join-Path $AppDest 'apps\api\src'),
    (Join-Path $AppDest 'apps\desktop\src'),
    (Join-Path $AppDest 'packages\domain\src'),
    (Join-Path $AppDest 'packages\db\src')
) | ForEach-Object {
    if (Test-Path $_) { Remove-Item $_ -Recurse -Force }
}

$NodeVersion = '22.16.0'
$Cache = Join-Path $Root "installer\cache\node-v$NodeVersion-win-x64.exe"
$NodeUrl = "https://nodejs.org/dist/v$NodeVersion/win-x64/node.exe"

if (-not (Test-Path $Cache)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $Cache) | Out-Null
    Invoke-WebRequest -Uri $NodeUrl -OutFile $Cache -UseBasicParsing
}
Copy-Item $Cache (Join-Path $NodeDest 'node.exe') -Force

Write-Host "Ressources Tauri prêtes : $TauriRes"
