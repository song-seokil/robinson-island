# ============================================================
#  Robinson Island - dev toolchain bootstrap (NO admin needed)
#  Installs user-local copies of:
#    - Node.js LTS   (zip)        -> %USERPROFILE%\tools\node
#    - Git Portable  (7z SFX)     -> %USERPROFILE%\tools\git
#    - VS Code       (user setup) -> %LOCALAPPDATA%\Programs\Microsoft VS Code
#  Usage:  powershell -ExecutionPolicy Bypass -File tools\setup-env.ps1
# ============================================================
param(
  [switch]$SkipVSCode,
  [switch]$SkipGit
)
$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

$Root   = Join-Path $env:USERPROFILE 'tools'
$Dl     = Join-Path $env:TEMP 'robinson-boot'
$LogDir = Join-Path $Root 'logs'
New-Item -ItemType Directory -Force -Path $Root, $Dl, $LogDir | Out-Null

function Log([string]$m) {
  $t = (Get-Date).ToString('HH:mm:ss')
  $line = "[$t] $m"
  Write-Host $line
  Add-Content -Path (Join-Path $LogDir 'bootstrap.log') -Value $line -Encoding UTF8
}

function Add-UserPath([string]$dir) {
  $cur = [Environment]::GetEnvironmentVariable('Path', 'User')
  $parts = @()
  if ($cur) { $parts = $cur.Split(';') | Where-Object { $_ -and $_.Trim() } }
  if ($parts -notcontains $dir) {
    $new = (@($parts) + $dir) -join ';'
    [Environment]::SetEnvironmentVariable('Path', $new, 'User')
    Log "PATH(user) += $dir"
  }
  $env:Path = "$env:Path;$dir"
}

# ------------------------------------------------------------
# 1) Node.js LTS
# ------------------------------------------------------------
$NodeDir = Join-Path $Root 'node'
if (Test-Path (Join-Path $NodeDir 'node.exe')) {
  Log "Node already present: $NodeDir"
} else {
  Log 'Resolving latest Node.js LTS version...'
  $idx = Invoke-RestMethod 'https://nodejs.org/dist/index.json' -UseBasicParsing
  $ver = ($idx | Where-Object { $_.lts -ne $false } | Select-Object -First 1).version
  $zip = Join-Path $Dl "node-$ver-win-x64.zip"
  if (-not (Test-Path $zip)) {
    Log "Downloading Node $ver (~30 MB)..."
    Invoke-WebRequest "https://nodejs.org/dist/$ver/node-$ver-win-x64.zip" -OutFile $zip -UseBasicParsing
  } else { Log "Using cached $zip" }
  Log 'Extracting Node...'
  $staging = Join-Path $Dl 'node-staging'
  if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
  Expand-Archive -Path $zip -DestinationPath $staging -Force
  if (Test-Path $NodeDir) { Remove-Item $NodeDir -Recurse -Force }
  Move-Item (Join-Path $staging "node-$ver-win-x64") $NodeDir
  Log "Node installed: $NodeDir ($ver)"
}
Add-UserPath $NodeDir

# ------------------------------------------------------------
# 2) Git for Windows (PortableGit, self-extracting archive)
# ------------------------------------------------------------
if (-not $SkipGit) {
  $GitDir = Join-Path $Root 'git'
  if (Test-Path (Join-Path $GitDir 'cmd\git.exe')) {
    Log "Git already present: $GitDir"
  } else {
    Log 'Resolving latest PortableGit release...'
    $rel = Invoke-RestMethod 'https://api.github.com/repos/git-for-windows/git/releases/latest' -UseBasicParsing
    $asset = $rel.assets | Where-Object { $_.name -match '^PortableGit-.*-64-bit\.7z\.exe$' } | Select-Object -First 1
    if (-not $asset) { throw 'PortableGit asset not found in latest release.' }
    $exe = Join-Path $Dl $asset.name
    if (-not (Test-Path $exe)) {
      Log "Downloading $($asset.name) ($([math]::Round($asset.size/1MB)) MB)..."
      Invoke-WebRequest $asset.browser_download_url -OutFile $exe -UseBasicParsing
    } else { Log "Using cached $exe" }
    Log 'Extracting Git (7z SFX, silent)...'
    if (Test-Path $GitDir) { Remove-Item $GitDir -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $GitDir | Out-Null
    $p = Start-Process -FilePath $exe -ArgumentList @("-o`"$GitDir`"", '-y') -Wait -PassThru -NoNewWindow
    Log "Git SFX exit code: $($p.ExitCode)"
    if (-not (Test-Path (Join-Path $GitDir 'cmd\git.exe'))) { throw 'Git extraction failed.' }
    Log "Git installed: $GitDir"
  }
  Add-UserPath (Join-Path $GitDir 'cmd')
}

# ------------------------------------------------------------
# 3) VS Code (user-level installer, no admin)
# ------------------------------------------------------------
if (-not $SkipVSCode) {
  $CodeExe = Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\Code.exe'
  if (Test-Path $CodeExe) {
    Log "VS Code already present: $CodeExe"
  } else {
    $vc = Join-Path $Dl 'VSCodeUserSetup-x64.exe'
    if (-not (Test-Path $vc)) {
      Log 'Downloading VS Code user setup (~100 MB)...'
      Invoke-WebRequest 'https://update.code.visualstudio.com/latest/win32-x64-user/stable' -OutFile $vc -UseBasicParsing
    } else { Log "Using cached $vc" }
    Log 'Installing VS Code (silent, per-user)...'
    $p = Start-Process -FilePath $vc -ArgumentList '/VERYSILENT', '/SP-', '/NORESTART', '/MERGETASKS=!runcode' -Wait -PassThru
    Log "VS Code installer exit code: $($p.ExitCode)"
    if (-not (Test-Path $CodeExe)) { throw 'VS Code install failed.' }
  }
  Add-UserPath (Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\bin')
}

# ------------------------------------------------------------
# Summary
# ------------------------------------------------------------
Log '---------------------------------------------'
Log 'Toolchain ready. Verify in a NEW terminal:'
Log '  node -v ; npm -v ; git --version ; code -v'
Log '---------------------------------------------'
