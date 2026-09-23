#!/usr/bin/env bash
# Regenerate every raster under src-tauri/icons/ from src-tauri/icons/icon.svg.
# Needs rsvg-convert (provided by the Nix dev shell via librsvg).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
icons="$root/src-tauri/icons"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

rsvg-convert -w 1024 -h 1024 "$icons/icon.svg" -o "$tmp/icon-1024.png"
cd "$root"
npx tauri icon "$tmp/icon-1024.png" -o "$icons"

# Desktop-only app: drop the mobile sets `tauri icon` always emits.
rm -rf "$icons/android" "$icons/ios"
