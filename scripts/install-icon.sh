#!/usr/bin/env bash
# Install the Clip icon into the user's hicolor theme as `video-trimmer`, the
# Wayland app id, so shells can resolve it for `tauri dev` windows.
# Installs no .desktop file; the packaged app ships its own.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
icons="$root/src-tauri/icons"
theme="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor"

install -Dm644 "$icons/32x32.png" "$theme/32x32/apps/video-trimmer.png"
install -Dm644 "$icons/128x128.png" "$theme/128x128/apps/video-trimmer.png"
install -Dm644 "$icons/128x128@2x.png" "$theme/256x256@2/apps/video-trimmer.png"
install -Dm644 "$icons/icon.svg" "$theme/scalable/apps/video-trimmer.svg"

if command -v gtk-update-icon-cache >/dev/null; then
  gtk-update-icon-cache -f -t "$theme" || true
fi
echo "Installed video-trimmer icons into $theme"
