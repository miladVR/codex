param([string]$Version = "")

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Remove-PartialInstaller {
    param([string]$Path)
    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    }
}

function Download-Installer {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)][hashtable]$Headers
    )

    Remove-PartialInstaller -Path $Destination

    $bits = Get-Command Start-BitsTransfer -ErrorAction SilentlyContinue
    if ($bits) {
        try {
            Write-Host "Downloading with Windows BITS (recommended for slow or unstable connections)..." -ForegroundColor Cyan
            Start-BitsTransfer -Source $Url -Destination $Destination -DisplayName "IMIDRO Fire Scoreboard" -Description "Downloading Windows installer" -TransferType Download -ErrorAction Stop
            return
        }
        catch {
            Write-Warning "BITS download did not finish. Switching to the fallback downloader."
            Remove-PartialInstaller -Path $Destination
        }
    }

    $maximumAttempts = 3
    for ($attempt = 1; $attempt -le $maximumAttempts; $attempt++) {
        try {
            Write-Host "Download attempt $attempt of $maximumAttempts (timeout: 30 minutes)..." -ForegroundColor Cyan
            Invoke-WebRequest -UseBasicParsing -Headers $Headers -Uri $Url -OutFile $Destination -TimeoutSec 1800
            return
        }
        catch {
            Remove-PartialInstaller -Path $Destination
            if ($attempt -eq $maximumAttempts) {
                throw "The installer could not be downloaded after $maximumAttempts attempts. Open the GitHub Release page and download the Setup file directly. Details: $($_.Exception.Message)"
            }
            Write-Warning "Download attempt $attempt failed. Retrying in 5 seconds..."
            Start-Sleep -Seconds 5
        }
    }
}

Write-Host "Finding the latest IMIDRO Fire Scoreboard release..." -ForegroundColor Cyan
$headers = @{ "User-Agent" = "IMIDRO-Fire-Scoreboard-Installer" }
$releases = Invoke-RestMethod -UseBasicParsing -Headers $headers -Uri "https://api.github.com/repos/miladVR/codex/releases?per_page=100" -TimeoutSec 60
$release = $releases |
    Where-Object { -not $_.draft -and -not $_.prerelease -and $_.tag_name -like "imidro-fire-v*" -and (-not $Version -or $_.tag_name -eq "imidro-fire-v$Version") } |
    Sort-Object published_at -Descending |
    Select-Object -First 1

if (-not $release) {
    throw "No matching published IMIDRO Fire Scoreboard release was found. Requested version: $Version"
}

$asset = $release.assets |
    Where-Object { $_.name -like "IMIDRO-Fire-Scoreboard-*-x64-setup.exe" } |
    Select-Object -First 1

if (-not $asset) {
    throw "The Windows setup file is missing from release $($release.tag_name)."
}

$installerPath = Join-Path $env:TEMP "IMIDRO-Fire-Scoreboard-Setup.exe"
Write-Host "Selected release: $($release.tag_name)" -ForegroundColor Green
Write-Host "Installer size: $([math]::Round($asset.size / 1MB, 1)) MB" -ForegroundColor Cyan

Download-Installer -Url $asset.browser_download_url -Destination $installerPath -Headers $headers

$downloadedFile = Get-Item -LiteralPath $installerPath -ErrorAction Stop
if ($downloadedFile.Length -ne [int64]$asset.size) {
    Remove-PartialInstaller -Path $installerPath
    throw "The downloaded file is incomplete. Expected $($asset.size) bytes but received $($downloadedFile.Length) bytes."
}

if ($asset.digest -and $asset.digest -like "sha256:*") {
    $expectedHash = $asset.digest.Substring(7)
    $actualHash = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash
    if ($actualHash -ne $expectedHash) {
        Remove-PartialInstaller -Path $installerPath
        throw "Installer SHA-256 does not match the published asset."
    }
}

Write-Host "Download completed successfully." -ForegroundColor Green
Write-Host "Starting the installer..." -ForegroundColor Green
Start-Process -FilePath $installerPath -Wait
