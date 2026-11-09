# Installs the official ECC native plugin in the ACTIVE Codex environment.
# Review https://github.com/affaan-m/ECC before accepting the plugin.
[CmdletBinding()]
param([switch]$CheckOnly)

$ErrorActionPreference = "Stop"

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    Write-Error "Codex CLI was not found. Install a Codex version supporting 'codex plugin' and try again."
    exit 1
}

Write-Host "Checking Codex plugin availability..."
& codex plugin --help
if ($LASTEXITCODE -ne 0) {
    Write-Error "This Codex CLI does not support native plugin management."
    exit 1
}

if ($CheckOnly) {
    Write-Host "Current installed plugins (read-only):"
    & codex plugin list --json
    exit $LASTEXITCODE
}

Write-Host "Official ECC source: https://github.com/affaan-m/ECC"
Write-Host "This will add a marketplace and install ecc@ecc into the active Codex environment."
Write-Host "It will NOT edit application source code, deploy, or merge a GitHub branch."
$answer = Read-Host "Type INSTALL to continue"
if ($answer -cne "INSTALL") {
    Write-Host "Cancelled. No installation attempted."
    exit 0
}

& codex plugin marketplace add affaan-m/ECC
if ($LASTEXITCODE -ne 0) { throw "ECC marketplace installation failed." }

& codex plugin add ecc@ecc
if ($LASTEXITCODE -ne 0) { throw "ECC plugin installation failed." }

Write-Host "Inspect this plugin list for enabled ecc@ecc:"
& codex plugin list --json
if ($LASTEXITCODE -ne 0) { throw "Plugin verification command failed." }
Write-Host "Restart Codex. Review any native hook trust prompts before approving."
