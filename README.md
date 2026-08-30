# video-trimmer

A minimal, Wayland-only MP4 trimmer for Hyprland. It previews one clip, provides a QuickTime-like in/out timeline, and precisely re-encodes the chosen interval instead of cutting only at keyframes.

## Run

```sh
nix develop
bun install --frozen-lockfile
bun tauri dev -- [INPUT] [-o PATH] [-f] [-v]
```

`INPUT` is optional. `-o/--output` bypasses the save picker, `-f/--force` authorizes replacing an existing destination, and `-v/--verbose` retains detailed media logs. The process requires a reachable native Wayland display and deliberately refuses X11/XWayland fallback.

On success stdout contains exactly one canonical absolute output path. Diagnostics go to stderr and `$XDG_STATE_HOME/video-trimmer` (normally `~/.local/state/video-trimmer`). Cancellation exits with status 130 and prints no stdout path. Startup/validation/export failures are nonzero and also leave stdout empty.

## Controls

- Click the video or its visible play button: play/pause
- Click or drag the timeline: seek
- Drag or focus either labelled handle: change in/out
- `Space`: play/pause
- `Left` / `Right`: seek one source frame
- `Shift+Left` / `Shift+Right`: seek one second
- `I` / `O`: set in/out at the playhead
- `Enter`: trim; `Escape`: cancel; `Ctrl+O`: open another MP4

## Export and acceleration

Exports are H.264 with optional AAC audio, begin at timestamp zero, and use a temporary file beside the destination. Existing output is preserved on failure or cancellation. Attempts run in this order: VA-API decode/encode, software decode with VA-API encode, then software decode/libx264. The badge reports playback decode/render and export decode/encode independently; `unknown` means WebKitGTK did not provide enough evidence, not that hardware is inactive.

Runtime dependencies are GTK3, WebKitGTK 4.1 with GStreamer codecs, FFmpeg/ffprobe, and optionally an accessible `/dev/dri/renderD*` node. The Nix flake supplies these and wraps the program with `GDK_BACKEND=wayland`.

Only local MP4 input and one temporal range are supported. There is no X11 mode, stream-copy mode, spatial crop, joining, multiple ranges, batch/headless mode, or cross-platform package. See [docs/verification.md](docs/verification.md) for fixture coverage and accepted conversion limitations.

## Checks

```sh
bun run build
bun run test
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
openspec validate build-video-trimmer --strict
nix build
```
