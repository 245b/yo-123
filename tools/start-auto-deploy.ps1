param(
  [string]$RepoRoot = "",
  [int]$DebounceSeconds = 3
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$RepoRoot = (Resolve-Path $RepoRoot).Path
$StateDir = Join-Path $RepoRoot ".codex-debugger"
$PidPath = Join-Path $StateDir "auto-deploy.pid"
$WatchScript = Join-Path $PSScriptRoot "auto-deploy-watch.ps1"

New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

if (Test-Path $PidPath) {
  $pidRaw = (Get-Content $PidPath -ErrorAction SilentlyContinue | Select-Object -First 1)
  $pidText = ("" + $pidRaw).Trim()

  if ($pidText) {
    $pidNum = 0
    if ([int]::TryParse($pidText, [ref]$pidNum)) {
      $proc = Get-Process -Id $pidNum -ErrorAction SilentlyContinue
      if ($proc) {
        Write-Output ("Auto deploy watcher already running (pid=" + $pidNum + ")")
        exit 0
      }
    }
  }
}

$args = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", $WatchScript,
  "-RepoRoot", $RepoRoot,
  "-DebounceSeconds", "$DebounceSeconds"
)

$proc = Start-Process -FilePath "powershell.exe" -ArgumentList $args -WindowStyle Hidden -PassThru
Start-Sleep -Seconds 1

if (-not $proc -or $proc.HasExited) {
  throw "Failed to start auto deploy watcher process"
}

Write-Output ("Auto deploy watcher started (pid=" + $proc.Id + ")")
