# Lance (ou arrete) le tracker en arriere-plan puis ouvre le navigateur.
#   tracker.ps1          -> demarre si besoin + ouvre http://localhost:5174
#   tracker.ps1 -Stop    -> arrete le serveur
param([switch]$Stop)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$port = if ($env:PORT) { $env:PORT } else { 5174 }
$url = "http://localhost:$port"
$logDir = Join-Path $root 'data'

Add-Type -AssemblyName System.Windows.Forms

function Show-Error($msg) {
  [System.Windows.Forms.MessageBox]::Show($msg, 'Candidatures Tracker', 'OK', 'Error') | Out-Null
}

function Test-Up {
  try { (Invoke-WebRequest "$url/api/inbox/count" -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $false }
}

function Get-ServerPids {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
}

if ($Stop) {
  $pids = Get-ServerPids
  foreach ($p in $pids) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
  $text = if ($pids) { 'Tracker arrete.' } else { "Le tracker n'etait pas lance." }
  [System.Windows.Forms.MessageBox]::Show($text, 'Candidatures Tracker') | Out-Null
  exit 0
}

try {
  if (-not (Test-Up)) {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
      Show-Error "Node.js est introuvable. Installe-le depuis https://nodejs.org puis relance."
      exit 1
    }
    Set-Location $root
    New-Item -ItemType Directory -Force $logDir | Out-Null
    $setupLog = Join-Path $logDir 'setup.log'

    if (-not (Test-Path (Join-Path $root 'node_modules'))) {
      & npm.cmd install *> $setupLog
      if ($LASTEXITCODE -ne 0) { throw "npm install a echoue (voir $setupLog)" }
    }

    # Recompile l'interface si le code a change depuis le dernier build
    $dist = Join-Path $root 'dist\index.html'
    $newest = Get-ChildItem (Join-Path $root 'client') -Recurse -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not (Test-Path $dist) -or $newest.LastWriteTime -gt (Get-Item $dist).LastWriteTime) {
      & npm.cmd run build *> $setupLog
      if ($LASTEXITCODE -ne 0) { throw "La compilation a echoue (voir $setupLog)" }
    }

    Start-Process node -ArgumentList '--disable-warning=ExperimentalWarning', 'server/index.js' `
      -WorkingDirectory $root -WindowStyle Hidden `
      -RedirectStandardOutput (Join-Path $logDir 'server.log') `
      -RedirectStandardError (Join-Path $logDir 'server-error.log')

    for ($i = 0; $i -lt 60 -and -not (Test-Up); $i++) { Start-Sleep -Milliseconds 250 }
    if (-not (Test-Up)) { throw "Le serveur ne repond pas (voir $(Join-Path $logDir 'server-error.log'))" }
  }
  Start-Process $url
} catch {
  Show-Error $_.Exception.Message
  exit 1
}
