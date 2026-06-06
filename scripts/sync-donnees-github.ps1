# Push data\ + config\.env to a separate PRIVATE GitHub repo
# Usage: npm run donnees:push-github

param(
    [string]$GitHubUser = 'CALEBKASENDA',
    [string]$DataRepo = 'Tabernacle-de-la-Moisson-ERP-Donnees'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Gh = 'C:\Program Files\GitHub CLI\gh.exe'
if (-not (Test-Path $Gh)) { $Gh = 'gh' }

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & git @GitArgs 2>&1 | ForEach-Object { if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { $_ } }
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prev
    if ($code -ne 0) { throw "git $($GitArgs -join ' ') failed ($code)" }
}

& $Gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Connectez-vous: gh auth login' -ForegroundColor Red
    exit 1
}

$ProjectData = Join-Path $Root 'data'
$ProjectEnv = Join-Path $Root 'config\.env'
$db = Join-Path $ProjectData 'tabernacle-finance.sqlite'

if (-not (Test-Path $db)) {
    Write-Host "Base introuvable: $db" -ForegroundColor Red
    exit 1
}

$SyncDir = Join-Path $Root '.sync-donnees'
$RemoteUrl = "https://github.com/$GitHubUser/$DataRepo.git"

if (-not (Test-Path (Join-Path $SyncDir '.git'))) {
    if (Test-Path $SyncDir) { Remove-Item $SyncDir -Recurse -Force }
    $repoExists = $false
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $Gh repo view "$GitHubUser/$DataRepo" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { $repoExists = $true }
    $ErrorActionPreference = $prevEap
    if (-not $repoExists) {
        & $Gh repo create $DataRepo --private --description 'Donnees ERP Tabernacle PRIVES' 2>&1 | Out-Null
    }
    New-Item -ItemType Directory -Force -Path $SyncDir | Out-Null
    Push-Location $SyncDir
    try {
        Invoke-Git init
        Invoke-Git remote add origin $RemoteUrl
        Invoke-Git branch -M main
    } finally {
        Pop-Location
    }
}

Push-Location $SyncDir
try {
    $destData = Join-Path $SyncDir 'data'
    if (Test-Path $destData) { Remove-Item $destData -Recurse -Force }
    Copy-Item $ProjectData $destData -Recurse -Force

    if (Test-Path $ProjectEnv) {
        New-Item -ItemType Directory -Force -Path (Join-Path $SyncDir 'config') | Out-Null
        Copy-Item $ProjectEnv (Join-Path $SyncDir 'config\.env') -Force
    }

    @{
        format = 'tabernacle-donnees-v1'
        syncedAt = (Get-Date).ToUniversalTime().ToString('o')
        source = $Root
    } | ConvertTo-Json | Set-Content (Join-Path $SyncDir 'manifest.json') -Encoding UTF8

    Set-Content (Join-Path $SyncDir 'README.md') -Value '# Donnees Tabernacle ERP (PRIVE)' -Encoding UTF8

    Invoke-Git add .
    $status = Invoke-Git status --porcelain
    if (-not $status) {
        Write-Host 'Deja a jour sur GitHub.' -ForegroundColor Yellow
    } else {
        $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
        $msg = "Sync donnees $stamp"
        Invoke-Git config user.name 'Tabernacle ERP'
        Invoke-Git config user.email 'sync@tabernacle.local'
        Invoke-Git commit -m $msg
        try {
            Invoke-Git push origin main
        } catch {
            Invoke-Git push -u origin main
        }
        $url = "https://github.com/$GitHubUser/$DataRepo"
        Write-Host "Donnees en ligne: $url" -ForegroundColor Green
    }
} finally {
    Pop-Location
}
