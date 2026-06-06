# Genere installer/assets/tabernacle.ico depuis tabernacle-icon.png
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pngPath = Join-Path $dir 'assets\tabernacle-icon.png'
$icoPath = Join-Path $dir 'assets\tabernacle.ico'

if (-not (Test-Path $pngPath)) {
    Write-Error "PNG introuvable : $pngPath"
}

$src = [System.Drawing.Image]::FromFile($pngPath)
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($src, 0, 0, 256, 256)
$g.Dispose()
$src.Dispose()

$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$fs = [System.IO.File]::Create($icoPath)
$icon.Save($fs)
$fs.Close()
$icon.Dispose()
$bmp.Dispose()

Write-Host "Icone : $icoPath"
