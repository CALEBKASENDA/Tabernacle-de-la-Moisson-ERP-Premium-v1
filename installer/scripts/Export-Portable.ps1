# Exporte les donnees Tabernacle ERP vers une cle USB ou un dossier externe
param(
    [string]$TargetPath
)

$ErrorActionPreference = 'Stop'
$InstallRoot = Split-Path -Parent $PSScriptRoot
$DataDir = Join-Path $InstallRoot 'data'
$ConfigDir = Join-Path $InstallRoot 'config'
$PortableName = 'TabernacleERP-Portable'

if (-not $TargetPath) {
    Write-Host ''
    Write-Host 'Export portable Tabernacle ERP' -ForegroundColor Cyan
    Write-Host 'Exemple : E:\  ou  E:\MaCleUSB' -ForegroundColor Gray
    $TargetPath = Read-Host 'Chemin de destination (lecteur USB)'
}

if (-not $TargetPath.Trim()) {
    Write-Host 'Chemin annule.' -ForegroundColor Yellow
    exit 1
}

$TargetPath = $TargetPath.Trim()
if ($TargetPath -notmatch '^[a-zA-Z]:\\' -and $TargetPath -notmatch '^\\\\') {
    Write-Host 'Indiquez un chemin Windows complet (ex. E:\)' -ForegroundColor Red
    exit 1
}

& (Join-Path $PSScriptRoot 'stop-tabernacle.ps1') | Out-Null
Start-Sleep -Seconds 2

$destRoot = Join-Path $TargetPath $PortableName
if (Test-Path $destRoot) {
    Remove-Item $destRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path (Join-Path $destRoot 'data') | Out-Null

function Copy-Tree($Source, $Destination, [string[]]$SkipNames = @()) {
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
        if ($SkipNames -contains $_.Name) { return }
        $destPath = Join-Path $Destination $_.Name
        if ($_.PSIsContainer) {
            Copy-Tree $_.FullName $destPath $SkipNames
        } else {
            Copy-Item -LiteralPath $_.FullName -Destination $destPath -Force
        }
    }
}

Copy-Tree $DataDir (Join-Path $destRoot 'data') @('import-portable.pending')

$manifest = @{
    format = 'tabernacle-portable-v1'
    exportedAt = (Get-Date).ToUniversalTime().ToString('o')
    appVersion = '1.2.0'
} | ConvertTo-Json
Set-Content -Path (Join-Path $destRoot 'manifest.json') -Value $manifest -Encoding UTF8

$envFile = Join-Path $ConfigDir '.env'
if (Test-Path $envFile) {
    New-Item -ItemType Directory -Force -Path (Join-Path $destRoot 'config') | Out-Null
    Copy-Item $envFile (Join-Path $destRoot 'config\.env') -Force
}

@"
Tabernacle de la Moisson ERP — paquet portable

1. Installez Tabernacle ERP sur l'autre PC.
2. Arrêtez l'application sur les deux PC.
3. Menu Démarrer → Importer données portables (clé USB)
   et indiquez ce dossier : $destRoot

Exporté le : $(Get-Date -Format 'yyyy-MM-dd HH:mm')
"@ | Set-Content -Path (Join-Path $destRoot 'LISEZMOI.txt') -Encoding UTF8

Write-Host ''
Write-Host "Export termine : $destRoot" -ForegroundColor Green
Write-Host 'Vous pouvez retirer la cle USB en toute securite apres l ejection Windows.' -ForegroundColor Gray
Write-Host ''
Read-Host 'Appuyez sur Entree pour relancer Tabernacle ERP'

& (Join-Path $PSScriptRoot 'start-tabernacle.ps1') -NoBrowser
