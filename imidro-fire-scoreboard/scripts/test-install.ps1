$ErrorActionPreference = 'Stop'
$originalTemp = $env:TEMP
$testDir = Join-Path $originalTemp ([guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $testDir | Out-Null
$fixture = Join-Path $testDir 'fixture.exe'
[IO.File]::WriteAllBytes($fixture, [byte[]](77,90,1,2,3,4,5,6))
$hash = (Get-FileHash $fixture -Algorithm SHA256).Hash
$global:InstallerTest = @{ Fixture=$fixture; Hash=$hash; Requests=@(); Downloads=@(); Launches=0; Corrupt=$false; BitsFail=$false; ManifestFail=$false }
$env:TEMP = $testDir
function global:Invoke-RestMethod {
    param([switch]$UseBasicParsing,$Headers,$Uri,$TimeoutSec)
    $global:InstallerTest.Requests += $Uri
    if ($Uri -like '*api.github.com*') { throw 'API rate limit exceeded' }
    if ($global:InstallerTest.ManifestFail) { throw 'manifest unavailable' }
    return ('{"latest":"1.3.0","releases":{"1.3.0":{"size":8,"sha256":"'+$global:InstallerTest.Hash+'"}}}') | ConvertFrom-Json
}
function global:Start-BitsTransfer {
    param($Source,$Destination,$DisplayName,$Description,$TransferType,$ErrorAction)
    if ($global:InstallerTest.BitsFail) { throw 'BITS unavailable' }
    $global:InstallerTest.Downloads += $Source
    Copy-Item $global:InstallerTest.Fixture $Destination
    if ($global:InstallerTest.Corrupt) { [IO.File]::WriteAllBytes($Destination,[byte[]](77,90,9,9,9,9,9,9)) }
}
function global:Invoke-WebRequest {
    param([switch]$UseBasicParsing,$Headers,$Uri,$OutFile,$TimeoutSec)
    $global:InstallerTest.Downloads += $Uri
    Copy-Item $global:InstallerTest.Fixture $OutFile
}
function global:Start-Process { param($FilePath,[switch]$Wait) $global:InstallerTest.Launches++ }
function Assert-True($Condition,$Message) { if (-not $Condition) { throw $Message } }
function Expect-Failure($Action,$Pattern) {
    try { & $Action; throw 'Expected failure did not happen' }
    catch { Assert-True ($_.Exception.Message -match $Pattern) $_.Exception.Message }
}
try {
    & "$PSScriptRoot/install.ps1" -Version '1.3.0'
    Assert-True ($global:InstallerTest.Launches -eq 1) 'Pinned version did not launch after verification'
    Assert-True ($global:InstallerTest.Requests.Count -eq 1 -and $global:InstallerTest.Requests[0] -like '*raw.githubusercontent.com*/scripts/releases.json') 'Pinned install queried GitHub API'
    Assert-True ($global:InstallerTest.Downloads[0] -eq 'https://github.com/miladVR/codex/releases/download/imidro-fire-v1.3.0/IMIDRO-Fire-Scoreboard-1.3.0-x64-setup.exe') 'Incorrect direct asset URL'
    $global:InstallerTest.BitsFail=$true
    & "$PSScriptRoot/install.ps1"
    Assert-True ($global:InstallerTest.Launches -eq 2) 'Latest version or fallback download failed'
    Expect-Failure { & "$PSScriptRoot/install.ps1" -Version '9.9.9' } 'metadata was not found'
    Expect-Failure { & "$PSScriptRoot/install.ps1" -Version '../bad' } 'X.Y.Z'
    $global:InstallerTest.BitsFail=$false; $global:InstallerTest.Corrupt=$true
    Expect-Failure { & "$PSScriptRoot/install.ps1" -Version '1.3.0' } 'SHA-256'
    Assert-True (-not (Test-Path (Join-Path $testDir 'IMIDRO-Fire-Scoreboard-Setup.exe'))) 'Corrupt file was retained'
    Assert-True ($global:InstallerTest.Launches -eq 2) 'Corrupt or unknown version was launched'
    $global:InstallerTest.ManifestFail=$true
    Expect-Failure { & "$PSScriptRoot/install.ps1" } 'manifest unavailable'
    Assert-True (($global:InstallerTest.Requests | Where-Object { $_ -like '*api.github.com*' } | Measure-Object | Select-Object -ExpandProperty Count) -eq 0) 'API request occurred'
    Write-Host 'PASS: pinned/latest install without API, BITS fallback, unknown/invalid version, corrupt SHA-256 and metadata outage.'
} finally {
    $env:TEMP=$originalTemp
    foreach ($name in @('Invoke-RestMethod','Start-BitsTransfer','Invoke-WebRequest','Start-Process')) { Remove-Item "Function:global:$name" -ErrorAction SilentlyContinue }
    Remove-Variable InstallerTest -Scope Global -ErrorAction SilentlyContinue
    Remove-Item $testDir -Recurse -Force
}
