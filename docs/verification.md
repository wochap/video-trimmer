# Verification matrix

Use generated, non-personal fixtures and compare the selected interval with `ffprobe -show_streams -show_format`.

| Fixture | Expected behavior |
| --- | --- |
| H.264 + AAC | Exact H.264/AAC output, zero-based timestamps |
| HEVC + AAC | Preview when WebKit supports it; H.264/AAC export |
| Variable frame rate | Selection step uses probed average cadence; boundary tolerance is one source frame |
| Silent MP4 | Video-only output succeeds |
| Odd dimensions | Output dimensions normalize down to even values; this is an accepted conversion warning |
| Corrupted/non-video MP4 | Inspection fails without enabling Trim or creating output |

The automated Rust matrix generates and exports H.264, HEVC, variable-cadence, silent, odd-dimension, and corrupted MP4 fixtures. It verifies H.264 normalization, even output dimensions, silent-stream handling, exact-duration tolerance, and rejection of malformed media. These checks run with `cargo test`; live WebKitGTK preview remains part of the Hyprland smoke test.

Hyprland smoke testing must cover picker, one-file drag/drop, replacement, mouse and keyboard trimming, both acceleration detail states, normal/verbose logs, export cancellation, overwrite denial and authorized replacement. Run two instances simultaneously and confirm each retains its own window and terminal streams.

HDR, 10-bit color, unusual color metadata, and VFR sources are converted to broadly compatible H.264/AAC and may not preserve every source characteristic. MP4 is the only supported container.
