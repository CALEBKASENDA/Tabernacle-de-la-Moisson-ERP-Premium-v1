# Lance Tabernacle ERP (serveur + navigateur)
param(
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$InstallRoot = Split-Path -Parent $PSScriptRoot
$NodeExe = Join-Path $InstallRoot 'node\node.exe'
$ServerJs = Join-Path $InstallRoot 'app\apps\api\dist\server.js'
$WebDist = Join-Path $InstallRoot 'app\apps\desktop\dist'
$ConfigDir = Join-Path $InstallRoot 'config'
$DataDir = Join-Path $InstallRoot 'data'
$LogsDir = Join-Path $ConfigDir 'logs'
$EnvFile = Join-Path $ConfigDir '.env'
$PidFile = Join-Path $ConfigDir 'tabernacle.pid'
$LogOut = Join-Path $LogsDir 'tabernacle.log'
$LogErr = Join-Path $LogsDir 'tabernacle-error.log'
$EnvTemplate = Join-Path $InstallRoot 'config\env.template'
$ApiCwd = Join-Path $InstallRoot 'app\apps\api'
$ImportFlag = Join-Path $DataDir 'import-portable.pending'

$LegacyConfigDir = Join-Path $env:LOCALAPPDATA 'Tabernacle ERP'
$LegacyDataDir = Join-Path $LegacyConfigDir 'data'
$LegacyEnvFile = Join-Path $LegacyConfigDir '.env'

function Test-PortListening([int]$Port) {
    try {
        return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)
    } catch {
        return [bool](netstat -ano 2>$null | Select-String ":$Port\s+.*LISTENING")
    }
}

function Open-AppBrowser {
    if (-not $NoBrowser) {
        Start-Process 'http://127.0.0.1:3847/'
    }
}

function Test-ServerReady {
    try {
        $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3847/health' -TimeoutSec 1
        return ($r.status -eq 'ok')
    } catch {
        return $false
    }
}

function Wait-ServerReady([System.Diagnostics.Process]$Process) {
    for ($i = 0; $i -lt 80; $i++) {
        if ($Process.HasExited) {
            $err = ''
            if (Test-Path $LogErr) { $err = Get-Content $LogErr -Raw -ErrorAction SilentlyContinue }
            $out = ''
            if (Test-Path $LogOut) { $out = Get-Content $LogOut -Raw -ErrorAction SilentlyContinue }
            throw "Le serveur s'est arrete (code $($Process.ExitCode)).`n$err`n$out"
        }
        if (Test-ServerReady) { return }
        $delay = if ($i -lt 20) { 100 } elseif ($i -lt 40) { 200 } else { 400 }
        Start-Sleep -Milliseconds $delay
    }
    throw "Le serveur n'a pas repondu a temps. Consultez :`n  $LogOut`n  $LogErr"
}

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

function Migrate-LegacyDataIfNeeded {
    $newDb = Join-Path $DataDir 'tabernacle-finance.sqlite'
    if (Test-Path $newDb) { return }

    $legacyDb = Join-Path $LegacyDataDir 'tabernacle-finance.sqlite'
    if (-not (Test-Path $legacyDb)) { return }

    Write-Host 'Migration des donnees depuis AppData vers le dossier d installation...' -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
    Copy-Tree $LegacyDataDir $DataDir @('backups')

    if ((Test-Path $LegacyEnvFile) -and -not (Test-Path $EnvFile)) {
        New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
        Copy-Item $LegacyEnvFile $EnvFile -Force
    }

    $stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
    Add-Content -Path $LogOut -Value "[$(Get-Date -Format o)] Migration AppData -> $DataDir ($stamp)"
}

function Apply-PendingPortableImport {
    if (-not (Test-Path $ImportFlag)) { return }

    $sourceDir = (Get-Content $ImportFlag -Raw).Trim()
    Remove-Item $ImportFlag -Force -ErrorAction SilentlyContinue

    if (-not (Test-Path $sourceDir)) {
        throw "Import portable : dossier introuvable : $sourceDir"
    }

    $manifestPath = Join-Path $sourceDir 'manifest.json'
    if (-not (Test-Path $manifestPath)) {
        throw "Import portable : manifest.json manquant dans $sourceDir"
    }

    $packageData = Join-Path $sourceDir 'data'
    $srcData = if (Test-Path $packageData) { $packageData } else { $sourceDir }

    Write-Host "Import portable depuis $sourceDir ..." -ForegroundColor Cyan

    $backupRoot = Join-Path $DataDir 'backups'
    $stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
    $preBackup = Join-Path $backupRoot "pre-import-$stamp"
    if (Test-Path (Join-Path $DataDir 'tabernacle-finance.sqlite')) {
        New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
        Copy-Tree $DataDir $preBackup @('backups', 'import-portable.pending')
    }

    Get-ChildItem -LiteralPath $DataDir -Force | ForEach-Object {
        if ($_.Name -in @('backups', 'import-portable.pending')) { return }
        Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }

    Copy-Tree $srcData $DataDir @('backups', 'import-portable.pending')

    $portableEnv = Join-Path $sourceDir 'config\.env'
    if (Test-Path $portableEnv) {
        New-Item -ItemType Directory -Force -Path $ConfigDir | Out-Null
        Copy-Item $portableEnv $EnvFile -Force
    }

    Add-Content -Path $LogOut -Value "[$(Get-Date -Format o)] Import portable applique depuis $sourceDir"
}

try {
    if (-not (Test-Path $NodeExe)) { throw "Node embarque introuvable : $NodeExe" }
    if (-not (Test-Path $ServerJs)) { throw "Application introuvable : $ServerJs" }
    if (-not (Test-Path $WebDist)) { throw "Interface web introuvable : $WebDist" }

    New-Item -ItemType Directory -Force -Path $ConfigDir, $DataDir, $LogsDir | Out-Null

    Migrate-LegacyDataIfNeeded
    Apply-PendingPortableImport

    if (-not (Test-Path $EnvFile)) {
        if (Test-Path $EnvTemplate) {
            Copy-Item $EnvTemplate $EnvFile
        } else {
            @"
TABERNACLE_CHURCH_ID=church_default
TABERNACLE_CHURCH_NAME=Tabernacle de la Moisson
TABERNACLE_BOOTSTRAP_EMAIL=tresorkasenda5@gmail.com
TABERNACLE_BOOTSTRAP_PASSWORD=1958MSensei1234!
TABERNACLE_BOOTSTRAP_NAME=Mister Sensei5
"@ | Set-Content -Path $EnvFile -Encoding UTF8
        }
    } elseif (Test-Path $EnvTemplate) {
        $existing = Get-Content $EnvFile -Raw
        if ($existing -match 'TABERNACLE_BOOTSTRAP_EMAIL=admin@local\.dev' -and $existing -match 'ChangeMe123!') {
            Copy-Item $EnvTemplate $EnvFile -Force
            Add-Content -Path $LogOut -Value "[$(Get-Date -Format o)] Compte bootstrap mis a jour depuis le modele d'installation."
        }
    }

    if (Test-Path $PidFile) {
        $oldPid = Get-Content $PidFile -ErrorAction SilentlyContinue
        if ($oldPid -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) {
            Open-AppBrowser
            exit 0
        }
    }

    if (Test-PortListening 3847) {
        Open-AppBrowser
        exit 0
    }

    $env:TABERNACLE_INSTALL_ROOT = $InstallRoot
    $env:TABERNACLE_ENV_FILE = $EnvFile
    $env:TABERNACLE_DATA_DIR = $DataDir
    $env:WEB_DIST_DIR = $WebDist
    $env:HOST = '127.0.0.1'
    $env:PORT = '3847'
    $env:TABERNACLE_APP_VERSION = '1.3.0'

    $proc = Start-Process -FilePath $NodeExe `
        -ArgumentList "`"$ServerJs`"" `
        -WorkingDirectory $ApiCwd `
        -WindowStyle Hidden `
        -RedirectStandardOutput $LogOut `
        -RedirectStandardError $LogErr `
        -PassThru

    $proc.Id | Set-Content -Path $PidFile -Encoding ASCII

    Wait-ServerReady -Process $proc

    Open-AppBrowser
    exit 0
} catch {
    Write-Host ''
    Write-Host 'ERREUR Tabernacle de la Moisson ERP' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ''
    Write-Host "Installation : $InstallRoot"
    Write-Host "Donnees      : $DataDir"
    Write-Host "Config       : $ConfigDir"
    exit 1
}
