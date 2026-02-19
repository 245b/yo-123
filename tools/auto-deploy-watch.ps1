param(
  [string]$RepoRoot = "",
  [int]$DebounceSeconds = 3,
  [string]$OperatorApp = "startnew-operator-exykvj",
  [string]$WorkspaceApp = "startnew-workspace-exykvj"
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$RepoRoot = (Resolve-Path $RepoRoot).Path
$StateDir = Join-Path $RepoRoot ".codex-debugger"
$LogPath = Join-Path $StateDir "auto-deploy.log"
$PidPath = Join-Path $StateDir "auto-deploy.pid"

New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

function Write-Log {
  param([string]$Message)
  $ts = Get-Date -Format "yyyy-MM-ddTHH:mm:ssK"
  "$ts $Message" | Tee-Object -FilePath $LogPath -Append
}

function Resolve-FlyCtl {
  $flyFromPath = Get-Command flyctl -ErrorAction SilentlyContinue
  if ($flyFromPath) {
    return $flyFromPath.Source
  }

  $fallback = Join-Path $env:USERPROFILE ".fly\bin\flyctl.exe"
  if (Test-Path $fallback) {
    return $fallback
  }

  throw "flyctl was not found in PATH or $fallback"
}

function To-RelPath {
  param([string]$FullPath)

  if (-not $FullPath) {
    return ""
  }

  $full = [System.IO.Path]::GetFullPath($FullPath)
  $root = [System.IO.Path]::GetFullPath($RepoRoot)

  if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
    return ""
  }

  $rel = $full.Substring($root.Length).TrimStart('\', '/')
  return $rel.Replace('/', '\')
}

$IgnorePrefixes = @(
  ".git\",
  "node_modules\",
  ".turbo\",
  ".codex-debugger\",
  ".codex-trash\",
  "data\",
  "Operator-web\node_modules\",
  "Operator-web\dist\",
  "Operator-web\test-results\",
  "hello\VNC\vnc-desktop\data\",
  "hello\VNC\vnc-desktop\workspace\"
)

function Is-IgnoredPath {
  param([string]$RelPath)

  if (-not $RelPath) {
    return $true
  }

  $rel = $RelPath.ToLowerInvariant()

  foreach ($prefix in $IgnorePrefixes) {
    $p = $prefix.ToLowerInvariant().TrimEnd('\', '/')

    if ($rel -eq $p) {
      return $true
    }

    if ($rel.StartsWith(($p + "\"))) {
      return $true
    }
  }

  if ($rel.EndsWith(".log")) {
    return $true
  }

  if ($rel.EndsWith(".tmp")) {
    return $true
  }

  return $false
}

function Invoke-FlyDeploy {
  param(
    [string]$FlyPath,
    [string]$WorkDir,
    [string[]]$Args
  )

  Push-Location $WorkDir
  try {
    & $FlyPath @Args
    if ($LASTEXITCODE -ne 0) {
      throw "flyctl exited with code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }
}

function Deploy-ForChanges {
  param(
    [string]$FlyPath,
    [string[]]$ChangedRelPaths
  )

  if (-not $ChangedRelPaths -or $ChangedRelPaths.Count -eq 0) {
    return
  }

  $needsWorkspace = $false

  foreach ($rel in $ChangedRelPaths) {
    if ($rel.ToLowerInvariant().StartsWith("hello\vnc\vnc-desktop\")) {
      $needsWorkspace = $true
      break
    }
  }

  if ($needsWorkspace) {
    Write-Log "Deploying workspace app ($WorkspaceApp)"
    Invoke-FlyDeploy -FlyPath $FlyPath -WorkDir (Join-Path $RepoRoot "hello\VNC\vnc-desktop") -Args @(
      "deploy",
      "-a", $WorkspaceApp,
      "-c", "fly.workspace.toml",
      "--remote-only"
    )
    Write-Log "Workspace deploy complete"
  }

  Write-Log "Deploying operator app ($OperatorApp)"
  Invoke-FlyDeploy -FlyPath $FlyPath -WorkDir $RepoRoot -Args @(
    "deploy",
    "-a", $OperatorApp,
    "-c", "fly.operator.toml",
    "--remote-only"
  )
  Write-Log "Operator deploy complete"
}

$fly = Resolve-FlyCtl
Set-Content -Path $PidPath -Value "$PID" -Encoding ascii
Write-Log "Auto deploy watcher started (pid=$PID, root=$RepoRoot, debounce=${DebounceSeconds}s)"

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $RepoRoot
$watcher.Filter = "*"
$watcher.IncludeSubdirectories = $true
$watcher.NotifyFilter = [System.IO.NotifyFilters]"FileName, DirectoryName, LastWrite, CreationTime, Size"
$watcher.EnableRaisingEvents = $true

$pending = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
$lastChangeUtc = [DateTime]::MinValue

while ($true) {
  $evt = $watcher.WaitForChanged([System.IO.WatcherChangeTypes]::All, 1000)

  if (-not $evt.TimedOut) {
    $full = Join-Path $RepoRoot $evt.Name
    $rel = To-RelPath $full

    if ($rel -and -not (Is-IgnoredPath $rel)) {
      [void]$pending.Add($rel)
      $lastChangeUtc = [DateTime]::UtcNow
      Write-Log "Queued change: $rel"
    }
  }

  if ($pending.Count -eq 0) {
    continue
  }

  $elapsed = ([DateTime]::UtcNow - $lastChangeUtc).TotalSeconds
  if ($elapsed -lt $DebounceSeconds) {
    continue
  }

  $batch = @($pending)
  $pending.Clear()

  try {
    Write-Log ("Deploy batch started (" + $batch.Count + " files)")
    Deploy-ForChanges -FlyPath $fly -ChangedRelPaths $batch
    Write-Log "Deploy batch finished"
  } catch {
    Write-Log ("Deploy batch failed: " + $_.Exception.Message)
  }
}
