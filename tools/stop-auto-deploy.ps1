param(
  [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$RepoRoot = (Resolve-Path $RepoRoot).Path
$PidPath = Join-Path (Join-Path $RepoRoot ".codex-debugger") "auto-deploy.pid"

if (-not (Test-Path $PidPath)) {
  Write-Output "Auto deploy watcher is not running"
  exit 0
}

$pidRaw = (Get-Content $PidPath -ErrorAction SilentlyContinue | Select-Object -First 1)
$pidText = ("" + $pidRaw).Trim()

if (-not $pidText) {
  Remove-Item $PidPath -Force -ErrorAction SilentlyContinue
  Write-Output "Auto deploy watcher pid file cleared"
  exit 0
}

$pidNum = 0
if (-not [int]::TryParse($pidText, [ref]$pidNum)) {
  Remove-Item $PidPath -Force -ErrorAction SilentlyContinue
  Write-Output "Auto deploy watcher pid file was invalid and has been cleared"
  exit 0
}

$proc = Get-Process -Id $pidNum -ErrorAction SilentlyContinue

if ($proc) {
  Stop-Process -Id $pidNum -Force
}

Remove-Item $PidPath -Force -ErrorAction SilentlyContinue
Write-Output ("Auto deploy watcher stopped (pid=" + $pidNum + ")")
