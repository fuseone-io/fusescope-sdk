#!/usr/bin/env bash
# Writes a CycloneDX SBOM of what `npm install @fusescope/<package>` installs:
# the packed tarball plus its production dependencies, nothing from dev.
# Usage: scripts/sbom.sh <package> [out]   e.g. scripts/sbom.sh browser
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
pkg=${1:?package directory under packages/, e.g. browser}
out=${2:-$root/sbom-$pkg.cdx.json}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

(cd "$root/packages/$pkg" && npx -y pnpm@10 pack --pack-destination "$work" >/dev/null)
cd "$work"
npm init -y >/dev/null && npm pkg set name="fusescope-$pkg-install"
npm install --omit=dev --ignore-scripts --no-audit --no-fund ./fusescope-"$pkg"-*.tgz >/dev/null
npx -y @cyclonedx/cyclonedx-npm@6.0.1 --omit dev --output-format JSON --output-file "$out"
echo "SBOM written to $out"
