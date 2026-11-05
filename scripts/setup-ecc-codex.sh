#!/usr/bin/env bash
# Install the official ECC native plugin in the ACTIVE Codex environment.
set -euo pipefail

if ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI not found. Install a version that supports 'codex plugin'." >&2
  exit 1
fi

if ! codex plugin --help >/dev/null 2>&1; then
  echo "Codex CLI does not support native plugin management." >&2
  exit 1
fi

if [[ "${1:-}" == "--check" ]]; then
  codex plugin list --json
  exit 0
fi
if [[ $# -ne 0 ]]; then
  echo "Usage: bash scripts/setup-ecc-codex.sh [--check]" >&2
  exit 2
fi

echo "Official source: https://github.com/affaan-m/ECC"
echo "This installs ecc@ecc into the ACTIVE Codex environment."
printf "Type INSTALL to continue: "
IFS= read -r confirmation
if [[ "$confirmation" != "INSTALL" ]]; then
  echo "Cancelled. No installation attempted."
  exit 0
fi

codex plugin marketplace add affaan-m/ECC
codex plugin add ecc@ecc
echo "Verify ecc@ecc is enabled in this list:"
codex plugin list --json
echo "Restart Codex; review any hook trust prompts before approving."
