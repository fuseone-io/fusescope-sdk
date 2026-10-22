#!/usr/bin/env bash
# Writes a CycloneDX SBOM of what `npm install @fusescope/browser` installs:
# the packed tarball plus its production dependencies, nothing from dev.
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
out=${1:-$root/sbom-browser.cdx.json}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

(cd "$root/packages/browser" && npx -y pnpm@10 pack --pack-destination "$work" >/dev/null)
cd "$work"
npm init -y >/dev/null && npm pkg set name=fusescope-browser-install
npm install --omit=dev --ignore-scripts --no-audit --no-fund ./fusescope-browser-*.tgz >/dev/null
npx -y @cyclonedx/cyclonedx-npm@6.0.1 --omit dev --output-format JSON --output-file "$out"
echo "SBOM written to $out"
