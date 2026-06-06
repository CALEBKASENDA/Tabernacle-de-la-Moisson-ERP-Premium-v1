# Publie le projet sur GitHub (compte CALEBKASENDA)
# Usage : powershell -File scripts/publish-github.ps1

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$gh = 'C:\Program Files\GitHub CLI\gh.exe'
if (-not (Test-Path $gh)) { $gh = 'gh' }

Set-Location $Root

& $gh auth status | Out-Null

$repo = 'Tabernacle-de-la-Moisson-ERP'
$exists = & $gh repo view "CALEBKASENDA/$repo" 2>$null
if (-not $exists) {
  Write-Host "Creation du depot prive $repo..."
  & $gh repo create $repo --private --description 'ERP finance Tabernacle de la Moisson' --source . --remote origin --push
} else {
  Write-Host "Depot existant — push vers origin/main..."
  git push -u origin main
}

Write-Host ''
Write-Host 'Termine ! URL :' -ForegroundColor Green
& $gh repo view --web --json url -q .url
