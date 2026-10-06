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

# Resolve only published, verified installers from a small public file.
# raw.githubusercontent.com is not subject to GitHub REST API rate limits.
if ($Version -and $Version -notmatch '^\d+\.\d+\.\d+$') {
    throw "Version must be in X.Y.Z format."
}
Write-Host "Finding the published IMIDRO installer (no GitHub API required)..." -ForegroundColor Cyan
$headers = @{ "User-Agent" = "IMIDRO-Fire-Scoreboard-Installer" }
$manifest = Invoke-RestMethod -UseBasicParsing -Headers $headers -Uri "https://raw.githubusercontent.com/miladVR/codex/main/imidro-fire-scoreboard/scripts/releases.json" -TimeoutSec 60
if (-not $Version) { $Version = [string]$manifest.latest }
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw "The published installer version is invalid." }
$entry = $manifest.releases.PSObject.Properties[$Version]
if (-not $entry) { throw "Published installer metadata was not found for version $Version. Download it from the GitHub Release page." }
$metadata = $entry.Value
if ([int64]$metadata.size -le 0 -or [string]$metadata.sha256 -notmatch '^[a-fA-F0-9]{64}$') {
    throw "The installer verification metadata is invalid."
}
$release = [pscustomobject]@{ tag_name = "imidro-fire-v$Version" }
$asset = [pscustomobject]@{
    name = "IMIDRO-Fire-Scoreboard-$Version-x64-setup.exe"
    browser_download_url = "https://github.com/miladVR/codex/releases/download/imidro-fire-v$Version/IMIDRO-Fire-Scoreboard-$Version-x64-setup.exe"
    size = [int64]$metadata.size
    digest = "sha256:$($metadata.sha256)"
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
