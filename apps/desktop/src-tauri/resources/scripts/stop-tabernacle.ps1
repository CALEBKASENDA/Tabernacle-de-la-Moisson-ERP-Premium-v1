# Arrête Tabernacle ERP (desktop Tauri + ancien mode Node/Edge)
$ErrorActionPreference = 'SilentlyContinue'

$InstallRoot = Split-Path -Parent $PSScriptRoot
$ConfigDir = Join-Path $InstallRoot 'config'
$LegacyConfigDir = Join-Path $env:LOCALAPPDATA 'Tabernacle ERP'

foreach ($dir in @($ConfigDir, $LegacyConfigDir)) {
    $PidFile = Join-Path $dir 'tabernacle.pid'
    if (Test-Path $PidFile) {
        $processId = [int](Get-Content $PidFile)
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        Remove-Item $PidFile -Force
    }
}

@('TabernacleERP', 'tabernacle-erp', 'Tabernacle de la Moisson ERP') | ForEach-Object {
    Get-Process -Name $_ -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}

Get-NetTCPConnection -LocalPort 3847 -State Listen -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }

Write-Host "Tabernacle de la Moisson ERP arrete."
