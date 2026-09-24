$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

Write-Host "Finding the latest IMIDRO Fire Scoreboard release..." -ForegroundColor Cyan
$headers = @{ "User-Agent" = "IMIDRO-Fire-Scoreboard-Installer" }
$releases = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/miladVR/codex/releases?per_page=100"
$release = $releases |
  Where-Object { -not $_.draft -and -not $_.prerelease -and $_.tag_name -like "imidro-fire-v*" } |
  Sort-Object published_at -Descending |
  Select-Object -First 1

if (-not $release) { throw "No published IMIDRO Fire Scoreboard release was found." }
$asset = $release.assets | Where-Object { $_.name -like "IMIDRO-Fire-Scoreboard-*-x64-setup.exe" } | Select-Object -First 1
if (-not $asset) { throw "The Windows setup file is missing from release $($release.tag_name)." }

$installerPath = Join-Path $env:TEMP "IMIDRO-Fire-Scoreboard-Setup.exe"
Write-Host "Downloading $($asset.name)..." -ForegroundColor Cyan
Invoke-WebRequest -Headers $headers -Uri $asset.browser_download_url -OutFile $installerPath
Write-Host "Starting the installer..." -ForegroundColor Green
Start-Process -FilePath $installerPath -Wait
