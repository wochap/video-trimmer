# video-trimmer

A minimal Wayland-only MP4 trimmer for Hyprland. Select an in/out range, preview it, and export a precise H.264 cut with optional VA-API acceleration.

## Features

- QuickTime-style timeline with mouse and keyboard controls
- Precise cuts through re-encoding instead of keyframe-only splitting
- Hardware-accelerated export with an automatic software fallback
- File picker, drag and drop, and command-line input/output paths

## Install

Requires an x86_64 Linux system running native Wayland and [Nix](https://nixos.org/) with flakes enabled.

```sh
nix profile install github:wochap/video-trimmer
```

Run without installing:

```sh
nix run github:wochap/video-trimmer -- video.mp4
```

## Usage

```sh
video-trimmer [INPUT] [-o PATH] [-f] [-v]
```

```sh
video-trimmer recording.mp4
video-trimmer recording.mp4 -o clip.mp4
video-trimmer recording.mp4 -o clip.mp4 --force
```

`--force` allows an existing output file to be replaced. `--verbose` enables detailed media logs.

Useful controls:

- `Space` — play or pause
- `Left` / `Right` — seek one frame
- `Shift+Left` / `Shift+Right` — seek one second
- `I` / `O` — set the in/out point
- `Enter` — export
- `Escape` — cancel
- `Ctrl+O` — open another MP4

## Development

```sh
git clone https://github.com/wochap/video-trimmer.git
cd video-trimmer
nix develop
npm ci
npm run tauri -- dev -- [INPUT]
```

Run the main checks with:

```sh
npm run build
npm test
cargo test --manifest-path src-tauri/Cargo.toml
nix build
```

## Tech stack

- [Tauri 2](https://tauri.app/) and Rust
- React, TypeScript, Vite, and Tailwind CSS
- FFmpeg/ffprobe, GTK3, WebKitGTK, and GStreamer
- Nix for development and packaging

## Notes

Only local MP4 files and one continuous time range are supported. Exports use H.264 with optional AAC audio and may normalize unusual formats for compatibility. The app requires native Wayland and does not fall back to X11/XWayland.

On success, stdout contains only the absolute output path. Logs are written to stderr and `$XDG_STATE_HOME/video-trimmer` (usually `~/.local/state/video-trimmer`). See [docs/verification.md](docs/verification.md) for supported media scenarios.

## License

[MIT](LICENSE)
