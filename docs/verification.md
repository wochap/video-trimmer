# Verification matrix

Use generated, non-personal fixtures and compare the selected interval with `ffprobe -show_streams -show_format`.

| Fixture | Expected behavior |
| --- | --- |
| H.264 + AAC | Exact H.264/AAC output, zero-based timestamps |
| HEVC + AAC | Preview through the H.264 proxy; H.264/AAC export |
| Variable frame rate | Selection step uses probed average cadence; boundary tolerance is one source frame |
| Preview proxy | Proxy carries dense keyframes, a leading moov atom, and valid H.264 level; the original file is never modified |
| Silent MP4 | Video-only output succeeds |
| Odd dimensions | Output dimensions normalize down to even values; this is an accepted conversion warning |
| Corrupted/non-video MP4 | Inspection fails without enabling Trim or creating output |
| `mp4` at `high`/`small` | Output fits 1920x1080 / 1280x720 (rotated box for portrait), never upscaled |
| `webm` | VP9 video, Opus audio when the source has audio, duration within one frame |
| `gif` | GIF without audio; width capped at 720/480 for `high`/`small`; 15/12/10 fps |
| `copy` with a 2 s GOP | Starts at the keyframe at or before the selected start; the result reports it |

The automated Rust matrix generates and exports H.264, HEVC, variable-cadence, silent, odd-dimension, and corrupted MP4 fixtures. It verifies H.264 normalization, even output dimensions, silent-stream handling, exact-duration tolerance, rejection of malformed media, and that the preview proxy moves the moov atom ahead of mdat and densifies keyframes. The format suite also exports every format and quality tier from generated clips and checks codec, audio presence, dimensions, duration, and the copy-mode keyframe start. Config tests cover file location, precedence, and rejection of unknown keys; a binary test confirms that a bad config exits with status 2 before any window opens. These checks run with `cargo test`; live WebKitGTK preview remains part of the Hyprland smoke test.

Hyprland smoke testing must cover picker, one-file drag/drop, replacement, mouse and keyboard trimming, both acceleration detail states, normal/verbose logs, export cancellation, replacement of an existing destination, and refusal when the destination is the source. Run two instances simultaneously and confirm each retains its own window and terminal streams.

Manual checks for formats, quality, and on-done:

- [ ] `--format mp4` at each quality tier plays in a browser and `ffprobe` shows the expected size.
- [ ] `--format webm` plays in a browser with sound; progress and cancellation work during the slow VP9 encode.
- [ ] `--format gif` loops in an image viewer; `small` is visibly smaller than `original`.
- [ ] `--format copy` finishes quickly and starts at the keyframe before the selected start; the log shows the effective start.
- [ ] `-o clip.gif` without `--format` exports a GIF; `--format mp4 -o clip.gif` writes `clip.mp4`.
- [ ] Config file values preselect the export; a flag overrides them; an unknown key stops startup with a message naming the key.
- [ ] `--on-done stay`: two trims print two stdout lines, the editor stays loaded between them, and closing exits 0.
- [ ] `--on-done exit`: one trim prints one line and the app exits 0.
- [ ] `--force` is rejected with usage text.

HDR, 10-bit color, unusual color metadata, and VFR sources are converted to broadly compatible H.264/AAC and may not preserve every source characteristic. MP4 is the only supported input container.
