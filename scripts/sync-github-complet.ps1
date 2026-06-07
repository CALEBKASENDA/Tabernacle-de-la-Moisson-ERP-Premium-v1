# Synchronise les 2 depots GitHub : v1.3.1 (code + donnees) et Donnees (copie)
# Usage: npm run github:sync

param(
    [string]$GitHubUser = 'CALEBKASENDA',
    [string]$MainRepo = 'Tab.-de-la-Moisson-ERP-Premium-v1.3.1',
    [string]$DataRepo = 'Tabernacle-de-la-Moisson-ERP-Donnees'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & git @GitArgs 2>&1 | ForEach-Object { if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { $_ } }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) { throw "git $($GitArgs -join ' ') failed ($code)" }
}

Write-Host '=== 1/2 Depot Donnees ===' -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'sync-donnees-github.ps1') -GitHubUser $GitHubUser -DataRepo $DataRepo

Write-Host ''
Write-Host '=== 2/2 Depot principal v1.3.1 ===' -ForegroundColor Cyan
Push-Location $Root
try {
    $remote = git remote get-url origin 2>$null
    $expected = "https://github.com/$GitHubUser/$MainRepo.git"
    if ($remote -ne $expected) {
        Write-Host "Remote origin: $remote" -ForegroundColor Yellow
    }

    Invoke-Git add -A
    Invoke-Git add -f data/ config/.env

    $status = Invoke-Git status --porcelain
    if (-not $status) {
        Write-Host 'Depot v1.3.1 deja a jour.' -ForegroundColor Yellow
    } else {
        $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
        $msg = "Sync complet $stamp"
        Invoke-Git config user.name 'Tabernacle ERP'
        Invoke-Git config user.email 'sync@tabernacle.local'
        Invoke-Git commit -m $msg
        Invoke-Git push origin main
        Write-Host "Depot v1.3.1 en ligne: https://github.com/$GitHubUser/$MainRepo" -ForegroundColor Green
    }
} finally {
    Pop-Location
}

Write-Host ''
Write-Host 'Synchronisation terminee.' -ForegroundColor Green
