# Cree les raccourcis du bureau "Candidatures Tracker" et "Arreter le tracker" (avec icone).
$ErrorActionPreference = 'Stop'
$scripts = $PSScriptRoot
$icon = Join-Path $scripts 'tracker.ico'

# --- Icone : une cible dessinee en 256x256, enregistree en .ico (PNG embarque) ---
if (-not (Test-Path $icon)) {
  Add-Type -AssemblyName System.Drawing
  $size = 256
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $blue = [System.Drawing.Color]::FromArgb(255, 42, 120, 214)
  $white = [System.Drawing.Color]::White
  $rings = @(@(8, $blue), @(48, $white), @(80, $blue), @(112, $white), @(140, $blue))
  foreach ($r in $rings) {
    $inset = $r[0]
    $brush = New-Object System.Drawing.SolidBrush $r[1]
    $g.FillEllipse($brush, $inset, $inset, $size - 2 * $inset, $size - 2 * $inset)
    $brush.Dispose()
  }
  $g.Dispose()
  $png = New-Object System.IO.MemoryStream
  $bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $bytes = $png.ToArray()

  $fs = [System.IO.File]::Create($icon)
  $w = New-Object System.IO.BinaryWriter $fs
  $w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]1)        # en-tete ICO, 1 image
  $w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0) # 256x256, pas de palette
  $w.Write([UInt16]1); $w.Write([UInt16]32)                             # plans, bits par pixel
  $w.Write([UInt32]$bytes.Length); $w.Write([UInt32]22)                 # taille, offset
  $w.Write($bytes)
  $w.Close()
}

# --- Raccourcis ---
$desktop = [Environment]::GetFolderPath('Desktop')
$wsh = New-Object -ComObject WScript.Shell
$vbs = Join-Path $scripts 'launch.vbs'

function New-Shortcut($name, $arguments, $description) {
  $lnk = $wsh.CreateShortcut((Join-Path $desktop "$name.lnk"))
  $lnk.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
  $lnk.Arguments = "`"$vbs`" $arguments".Trim()
  $lnk.WorkingDirectory = Split-Path -Parent $scripts
  $lnk.IconLocation = "$icon,0"
  $lnk.Description = $description
  $lnk.Save()
}

New-Shortcut 'Candidatures Tracker' '' 'Ouvre le tracker de candidatures'
New-Shortcut "Arr$([char]0xEA)ter le tracker" 'stop' 'Arrete le serveur du tracker'
Write-Output "Raccourcis crees sur le bureau : $desktop"
