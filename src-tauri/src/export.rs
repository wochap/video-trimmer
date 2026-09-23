use crate::{
    acceleration::{render_nodes, AccelerationRecord, AccelerationState},
    config::{Format, Quality},
    error::AppError,
    logging::LogPaths,
    media,
};
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, OpenOptions},
    path::{Path, PathBuf},
    process::Stdio,
    sync::atomic::{AtomicBool, AtomicI32, Ordering},
};
use tauri::{Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
#[derive(Default)]
pub struct ExportState {
    active: AtomicBool,
    cancel: AtomicBool,
    pid: AtomicI32,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    input: String,
    output: String,
    start_micros: u64,
    end_micros: u64,
    #[serde(default)]
    format: Format,
    #[serde(default)]
    quality: Quality,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportProgress {
    fraction: f64,
    out_time_micros: u64,
    attempt: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    output: String,
    acceleration: Vec<AccelerationRecord>,
    effective_start_micros: Option<u64>,
}
struct ActiveGuard<'a>(&'a ExportState);
impl Drop for ActiveGuard<'_> {
    fn drop(&mut self) {
        self.0.active.store(false, Ordering::SeqCst);
        self.0.pid.store(0, Ordering::SeqCst);
        self.0.cancel.store(false, Ordering::SeqCst)
    }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AttemptKind {
    FullVaapi,
    VaapiEncode,
    Software,
}
impl AttemptKind {
    fn label(&self, format: Format) -> &'static str {
        match (self, format) {
            (Self::FullVaapi, _) => "VA-API decode + encode",
            (Self::VaapiEncode, _) => "Software decode + VA-API encode",
            (Self::Software, Format::Mp4) => "Software decode + libx264",
            (Self::Software, Format::Webm) => "Software decode + libvpx-vp9",
            (Self::Software, Format::Gif) => "Software decode + GIF palette",
            (Self::Software, Format::Copy) => "Stream copy",
        }
    }
}
struct ExportPlan<'a> {
    format: Format,
    quality: Quality,
    input: &'a Path,
    temp: &'a Path,
    start: u64,
    duration: u64,
}
fn attempts(format: Format) -> Vec<AttemptKind> {
    match format {
        Format::Mp4 => vec![
            AttemptKind::FullVaapi,
            AttemptKind::VaapiEncode,
            AttemptKind::Software,
        ],
        Format::Webm | Format::Gif | Format::Copy => vec![AttemptKind::Software],
    }
}
fn progress_micros(line: &str) -> Option<u64> {
    line.strip_prefix("out_time_us=")?.parse().ok()
}
fn destination(input: &Path, output: &Path, format: Format) -> Result<PathBuf, AppError> {
    let input = input.canonicalize()?;
    let parent = output
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let parent = parent
        .canonicalize()
        .map_err(|e| AppError::Destination(format!("destination directory: {e}")))?;
    let name = output
        .file_name()
        .ok_or_else(|| AppError::Destination("missing filename".into()))?;
    let required = format.extension();
    if Path::new(name)
        .extension()
        .and_then(|x| x.to_str())
        .is_none_or(|x| !x.eq_ignore_ascii_case(required))
    {
        return Err(AppError::Destination(format!(
            "output must end in .{required}"
        )));
    }
    let full = parent.join(name);
    if full.exists() && full.canonicalize()? == input {
        return Err(AppError::Destination(
            "source and destination are the same file".into(),
        ));
    }
    Ok(full)
}
// Bounding box for the longer and shorter side of each re-encoding tier.
fn video_cap(quality: Quality) -> Option<(u32, u32)> {
    match quality {
        Quality::Original => None,
        Quality::High => Some((1920, 1080)),
        Quality::Small => Some((1280, 720)),
    }
}
fn gif_settings(quality: Quality) -> (u32, Option<u32>) {
    match quality {
        Quality::Original => (15, None),
        Quality::High => (12, Some(720)),
        Quality::Small => (10, Some(480)),
    }
}
// Fits the frame inside the tier's box (orientation aware), never upscales,
// and keeps even dimensions for 4:2:0 encoders.
fn scale_filter(filter: &str, quality: Quality) -> String {
    match video_cap(quality) {
        None => format!("{filter}=w=trunc(iw/2)*2:h=trunc(ih/2)*2"),
        Some((long, short)) => format!(
            "{filter}=w='min(iw,if(gte(iw,ih),{long},{short}))':h='min(ih,if(gte(iw,ih),{short},{long}))':force_original_aspect_ratio=decrease:force_divisible_by=2"
        ),
    }
}
fn video_args(plan: &ExportPlan, kind: AttemptKind) -> Vec<String> {
    let q = plan.quality;
    let (crf, qp) = match q {
        Quality::Original => ("18", "20"),
        Quality::High => ("23", "24"),
        Quality::Small => ("28", "28"),
    };
    match (plan.format, kind) {
        (Format::Copy, _) => vec!["-c".into(), "copy".into()],
        (Format::Gif, _) => {
            let (fps, width) = gif_settings(q);
            let scale = width.map_or(String::new(), |w| {
                format!(",scale='min(iw,{w})':-1:flags=lanczos")
            });
            vec![
                "-vf".into(),
                format!("setpts=PTS-STARTPTS,fps={fps}{scale},split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5"),
                "-c:v".into(),
                "gif".into(),
            ]
        }
        (Format::Webm, _) => vec![
            "-vf".into(),
            format!("setpts=PTS-STARTPTS,{}", scale_filter("scale", q)),
            "-c:v".into(),
            "libvpx-vp9".into(),
            "-crf".into(),
            match q {
                Quality::Original => "31",
                Quality::High => "33",
                Quality::Small => "36",
            }
            .into(),
            "-b:v".into(),
            "0".into(),
            "-row-mt".into(),
            "1".into(),
            "-deadline".into(),
            "good".into(),
            "-cpu-used".into(),
            "4".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
        ],
        (Format::Mp4, AttemptKind::FullVaapi) => vec![
            "-vf".into(),
            format!("setpts=PTS-STARTPTS,{}", scale_filter("scale_vaapi", q)),
            "-c:v".into(),
            "h264_vaapi".into(),
            "-qp".into(),
            qp.into(),
        ],
        (Format::Mp4, AttemptKind::VaapiEncode) => vec![
            "-vf".into(),
            format!(
                "setpts=PTS-STARTPTS,{},format=nv12,hwupload",
                scale_filter("scale", q)
            ),
            "-c:v".into(),
            "h264_vaapi".into(),
            "-qp".into(),
            qp.into(),
        ],
        (Format::Mp4, AttemptKind::Software) => vec![
            "-vf".into(),
            format!("setpts=PTS-STARTPTS,{}", scale_filter("scale", q)),
            "-c:v".into(),
            "libx264".into(),
            "-crf".into(),
            crf.into(),
            "-preset".into(),
            "medium".into(),
        ],
    }
}
fn audio_args(format: Format) -> Vec<String> {
    match format {
        Format::Mp4 => vec!["-c:a", "aac", "-b:a", "192k", "-af", "asetpts=PTS-STARTPTS"],
        Format::Webm => vec![
            "-c:a",
            "libopus",
            "-b:a",
            "128k",
            "-af",
            "asetpts=PTS-STARTPTS",
        ],
        Format::Gif => vec!["-an"],
        Format::Copy => vec![],
    }
    .into_iter()
    .map(String::from)
    .collect()
}
fn args(plan: &ExportPlan, kind: AttemptKind, node: Option<&Path>) -> Vec<String> {
    let mut a = vec!["-hide_banner", "-nostdin", "-y", "-loglevel", "warning"]
        .into_iter()
        .map(String::from)
        .collect::<Vec<_>>();
    if let Some(n) = node {
        match kind {
            AttemptKind::FullVaapi => a.extend(
                [
                    "-hwaccel",
                    "vaapi",
                    "-hwaccel_device",
                    &n.to_string_lossy(),
                    "-hwaccel_output_format",
                    "vaapi",
                ]
                .map(String::from),
            ),
            AttemptKind::VaapiEncode => a.extend(
                [
                    "-init_hw_device",
                    &format!("vaapi=va:{}", n.display()),
                    "-filter_hw_device",
                    "va",
                ]
                .map(String::from),
            ),
            AttemptKind::Software => {}
        }
    }
    let start = format!("{:.6}", plan.start as f64 / 1e6);
    let duration = format!("{:.6}", plan.duration as f64 / 1e6);
    let input = plan.input.to_string_lossy().into_owned();
    // Stream copy seeks on the input so the demuxer lands on the keyframe at
    // or before the start; an output-side seek would drop packets until the
    // next keyframe instead. Re-encoding seeks on the output for exact frames.
    if plan.format == Format::Copy {
        a.extend([
            "-ss".into(),
            start,
            "-i".into(),
            input,
            "-t".into(),
            duration,
        ]);
    } else {
        a.extend([
            "-i".into(),
            input,
            "-ss".into(),
            start,
            "-t".into(),
            duration,
        ]);
    }
    a.extend(["-map", "0:v:0"].map(String::from));
    if plan.format != Format::Gif {
        a.extend(["-map", "0:a?"].map(String::from));
    }
    a.extend(video_args(plan, kind));
    a.extend(audio_args(plan.format));
    if matches!(plan.format, Format::Mp4 | Format::Copy) {
        a.extend(["-movflags", "+faststart"].map(String::from));
    }
    if plan.format != Format::Gif {
        a.extend(["-avoid_negative_ts", "make_zero"].map(String::from));
    }
    a.extend(
        [
            "-progress",
            "pipe:1",
            "-nostats",
            &plan.temp.to_string_lossy(),
        ]
        .map(String::from),
    );
    a
}
async fn attempt(
    app: &tauri::AppHandle,
    state: &ExportState,
    logs: &LogPaths,
    plan: &ExportPlan<'_>,
    kind: AttemptKind,
    node: Option<&Path>,
) -> Result<(), String> {
    let temp = plan.temp;
    let duration = plan.duration;
    let label = kind.label(plan.format);
    let _ = fs::remove_file(temp);
    let stderr = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&logs.ffmpeg)
        .map_err(|e| e.to_string())?;
    let mut ffmpeg_args = args(plan, kind, node);
    if logs.verbose {
        if let Some(level) = ffmpeg_args
            .iter_mut()
            .skip_while(|value| value.as_str() != "-loglevel")
            .nth(1)
        {
            *level = "verbose".into();
        }
    }
    let mut command = tokio::process::Command::new("ffmpeg");
    command
        .args(ffmpeg_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::from(stderr));
    command.process_group(0);
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    state
        .pid
        .store(child.id().unwrap_or(0) as i32, Ordering::SeqCst);
    let stdout = child
        .stdout
        .take()
        .ok_or("FFmpeg progress pipe unavailable")?;
    let mut lines = BufReader::new(stdout).lines();
    loop {
        tokio::select! {line=lines.next_line()=>match line.map_err(|e|e.to_string())?{Some(line)=>{if let Some(v)=progress_micros(&line){let _=app.emit("export-progress",ExportProgress{fraction:(v as f64/duration as f64).clamp(0.0,1.0),out_time_micros:v,attempt:label.into()});}},None=>break},_=tokio::time::sleep(std::time::Duration::from_millis(100))=>{if state.cancel.load(Ordering::SeqCst){let pid=state.pid.load(Ordering::SeqCst);if pid>0{unsafe{libc::kill(-pid,libc::SIGTERM);}}let _=child.wait().await;let _=fs::remove_file(temp);return Err("cancelled".into())}}}
    }
    let status = child.wait().await.map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        let _ = fs::remove_file(temp);
        Err(format!("{label} exited with {status}"))
    }
}
fn records(kind: AttemptKind, format: Format, node: Option<&Path>) -> Vec<AccelerationRecord> {
    let device = node.map(|p| p.display().to_string());
    let software = |encoder: &str, reason: &str| {
        [
            ("export_decode", "FFmpeg software decoder"),
            ("export_encode", encoder),
        ]
        .into_iter()
        .map(|(c, i)| AccelerationRecord {
            component: c.into(),
            state: AccelerationState::Software,
            implementation: Some(i.into()),
            api: None,
            device: None,
            reason: Some(reason.into()),
        })
        .collect()
    };
    match (format, kind) {
        (Format::Copy, _) => vec![],
        (Format::Webm, _) => software("libvpx-vp9", "WebM export always uses software encoding"),
        (Format::Gif, _) => software("gif", "GIF export always uses software encoding"),
        (Format::Mp4, AttemptKind::Software) => {
            software("libx264", "VA-API attempts unavailable or failed")
        }
        (Format::Mp4, AttemptKind::FullVaapi) => vec![
            ("export_decode", "VA-API decoder"),
            ("export_encode", "h264_vaapi"),
        ]
        .into_iter()
        .map(|(c, i)| AccelerationRecord {
            component: c.into(),
            state: AccelerationState::Active,
            implementation: Some(i.into()),
            api: Some("VA-API".into()),
            device: device.clone(),
            reason: None,
        })
        .collect(),
        (Format::Mp4, AttemptKind::VaapiEncode) => vec![
            AccelerationRecord {
                component: "export_decode".into(),
                state: AccelerationState::Software,
                implementation: Some("FFmpeg software decoder".into()),
                api: None,
                device: None,
                reason: None,
            },
            AccelerationRecord {
                component: "export_encode".into(),
                state: AccelerationState::Active,
                implementation: Some("h264_vaapi".into()),
                api: Some("VA-API".into()),
                device,
                reason: None,
            },
        ],
    }
}
#[tauri::command]
pub async fn start_export(
    app: tauri::AppHandle,
    state: tauri::State<'_, ExportState>,
    logs: tauri::State<'_, LogPaths>,
    request: ExportRequest,
) -> Result<ExportResult, AppError> {
    if state.active.swap(true, Ordering::SeqCst) {
        return Err(AppError::ExportBusy);
    }
    let _guard = ActiveGuard(&state);
    if request.start_micros >= request.end_micros {
        return Err(AppError::InvalidTrim("start must be before end".into()));
    }
    let format = request.format;
    let input = media::validate_input(Path::new(&request.input))?;
    let output = destination(&input, Path::new(&request.output), format)?;
    let temp = tempfile::Builder::new()
        .prefix(".video-trimmer-")
        .suffix(&format!(".{}", format.extension()))
        .tempfile_in(output.parent().unwrap())
        .map_err(|e| AppError::Destination(e.to_string()))?;
    let temp_path = temp.path().to_path_buf();
    drop(temp);
    let mut effective_start = Some(request.start_micros);
    if format == Format::Copy {
        effective_start = match media::keyframes(&input) {
            Ok(k) => media::keyframe_at_or_before(&k, request.start_micros),
            Err(e) => {
                tracing::warn!(reason=%e,"keyframe index unavailable; effective start known after export");
                None
            }
        };
    }
    let plan = ExportPlan {
        format,
        quality: request.quality,
        input: &input,
        temp: &temp_path,
        start: request.start_micros,
        duration: request.end_micros - request.start_micros,
    };
    let nodes = render_nodes();
    let mut selected = None;
    let mut failures = vec![];
    for kind in attempts(format) {
        if kind != AttemptKind::Software && nodes.is_empty() {
            continue;
        }
        let node = if kind == AttemptKind::Software {
            None
        } else {
            nodes.first().map(PathBuf::as_path)
        };
        tracing::info!(attempt=kind.label(format),format=?format,quality=?request.quality,device=?node,"starting export attempt");
        match attempt(&app, &state, &logs, &plan, kind, node).await {
            Ok(()) => {
                selected = Some((kind, node.map(Path::to_path_buf)));
                break;
            }
            Err(e) if e == "cancelled" => return Err(AppError::Cancelled),
            Err(e) => {
                tracing::warn!(attempt=kind.label(format),reason=%e,"export attempt failed; trying fallback");
                failures.push(e)
            }
        }
    }
    let (kind, node) = selected.ok_or_else(|| {
        AppError::Export(format!(
            "{}. Detailed diagnostics: {}",
            failures.join("; "),
            logs.ffmpeg.display()
        ))
    })?;
    let validated = media::probe_any(&temp_path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        AppError::Export(format!("output validation failed: {e}"))
    })?;
    if format == Format::Copy && effective_start.is_none() {
        effective_start = Some(request.end_micros.saturating_sub(validated.duration_micros));
    }
    OpenOptions::new()
        .write(true)
        .open(&temp_path)?
        .sync_all()?;
    fs::rename(&temp_path, &output).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        AppError::Destination(format!("could not finalize output: {e}"))
    })?;
    let canonical = output.canonicalize()?;
    let acceleration = records(kind, format, node.as_deref());
    let _ = app.emit("acceleration-update", &acceleration);
    tracing::info!(output=%canonical.display(),attempt=kind.label(format),effective_start_micros=?effective_start,"export completed");
    crate::lifecycle::write_success(&canonical)?;
    app.state::<crate::app::LaunchState>()
        .succeeded
        .store(true, Ordering::SeqCst);
    Ok(ExportResult {
        output: canonical.display().to_string(),
        acceleration,
        effective_start_micros: effective_start,
    })
}
#[tauri::command]
pub fn cancel_export(state: tauri::State<'_, ExportState>) -> Result<(), AppError> {
    if state.active.load(Ordering::SeqCst) {
        state.cancel.store(true, Ordering::SeqCst)
    }
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn plan<'a>(
        format: Format,
        quality: Quality,
        input: &'a Path,
        temp: &'a Path,
        start: u64,
        duration: u64,
    ) -> ExportPlan<'a> {
        ExportPlan {
            format,
            quality,
            input,
            temp,
            start,
            duration,
        }
    }
    fn generate(path: &Path, args: &[&str]) {
        let status = std::process::Command::new("ffmpeg")
            .args(["-hide_banner", "-loglevel", "error"])
            .args(args)
            .args(["-y"])
            .arg(path)
            .status()
            .unwrap();
        assert!(status.success(), "failed to generate {}", path.display());
    }
    fn run(plan: &ExportPlan) {
        let status = std::process::Command::new("ffmpeg")
            .args(args(plan, AttemptKind::Software, None))
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap();
        assert!(
            status.success(),
            "export failed: {:?}",
            args(plan, AttemptKind::Software, None)
        );
    }
    fn stream_codecs(path: &Path) -> Vec<String> {
        let out = std::process::Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-show_entries",
                "stream=codec_type,codec_name",
                "-of",
                "csv=p=0",
            ])
            .arg(path)
            .output()
            .unwrap();
        String::from_utf8_lossy(&out.stdout)
            .lines()
            .map(str::to_owned)
            .collect()
    }
    #[test]
    fn destination_requires_format_extension_and_refuses_source() {
        let d = tempfile::tempdir().unwrap();
        let input = d.path().join("in.mp4");
        fs::write(&input, b"x").unwrap();
        for (format, good, bad) in [
            (Format::Mp4, "out.mp4", "out.mov"),
            (Format::Copy, "out.MP4", "out.webm"),
            (Format::Webm, "out.webm", "out.mp4"),
            (Format::Gif, "out.gif", "out"),
        ] {
            assert!(destination(&input, &d.path().join(good), format).is_ok());
            let e = destination(&input, &d.path().join(bad), format).unwrap_err();
            assert!(
                e.to_string().contains(&format!(".{}", format.extension())),
                "{e}"
            );
        }
        let existing = d.path().join("existing.mp4");
        fs::write(&existing, b"old").unwrap();
        assert_eq!(
            destination(&input, &existing, Format::Mp4).unwrap(),
            existing
        );
        let e = destination(&input, &input, Format::Mp4).unwrap_err();
        assert!(e.to_string().contains("same file"));
    }
    #[test]
    fn ffmpeg_args_are_discrete_and_exact() {
        let p = plan(
            Format::Mp4,
            Quality::Original,
            Path::new("a;echo.mp4"),
            Path::new("out.mp4"),
            1_000_000,
            2_000_000,
        );
        let a = args(&p, AttemptKind::Software, None);
        assert!(a.contains(&"a;echo.mp4".into()));
        assert!(a.contains(&"libx264".into()));
        assert!(a.contains(&"18".into()));
        assert!(!a.contains(&"copy".into()));
        let input = a.iter().position(|v| v == "-i").unwrap();
        assert!(a.iter().position(|v| v == "-ss").unwrap() > input);
        let copy = args(
            &plan(
                Format::Copy,
                Quality::Small,
                p.input,
                p.temp,
                1_000_000,
                2_000_000,
            ),
            AttemptKind::Software,
            None,
        );
        assert!(copy.iter().position(|v| v == "-ss") < copy.iter().position(|v| v == "-i"));
        assert!(copy.contains(&"copy".into()));
        assert!(!copy.iter().any(|v| v == "-vf" || v.contains("scale")));
    }
    #[test]
    fn attempts_and_records_follow_format() {
        assert_eq!(
            attempts(Format::Mp4),
            vec![
                AttemptKind::FullVaapi,
                AttemptKind::VaapiEncode,
                AttemptKind::Software
            ]
        );
        for format in [Format::Webm, Format::Gif, Format::Copy] {
            assert_eq!(attempts(format), vec![AttemptKind::Software]);
            let a = args(
                &plan(
                    format,
                    Quality::Original,
                    Path::new("in.mp4"),
                    Path::new("t"),
                    0,
                    1,
                ),
                AttemptKind::Software,
                None,
            );
            assert!(!a.iter().any(|v| v.contains("vaapi")));
        }
        assert!(records(AttemptKind::Software, Format::Copy, None).is_empty());
        let webm = records(AttemptKind::Software, Format::Webm, None);
        assert!(webm.iter().all(|r| r.state == AccelerationState::Software));
        assert_eq!(webm[1].implementation.as_deref(), Some("libvpx-vp9"));
        let gif = records(AttemptKind::Software, Format::Gif, None);
        assert_eq!(gif[1].implementation.as_deref(), Some("gif"));
    }
    #[test]
    fn software_attempt_produces_exact_silent_interval() {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("source.mp4");
        let output = dir.path().join("trim.mp4");
        generate(
            &input,
            &[
                "-f",
                "lavfi",
                "-i",
                "testsrc2=s=320x240:r=30:d=3",
                "-an",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
            ],
        );
        run(&plan(
            Format::Mp4,
            Quality::Original,
            &input,
            &output,
            1_000_000,
            1_000_000,
        ));
        let result = media::probe(&output).unwrap();
        assert!(!result.has_audio);
        assert!((result.duration_micros as i64 - 1_000_000).abs() <= 34_000);
    }
    #[test]
    fn progress_fallback_overwrite_validation_and_cleanup_are_transactional() {
        assert_eq!(progress_micros("out_time_us=750000"), Some(750_000));
        assert_eq!(progress_micros("progress=continue"), None);
        let software = records(AttemptKind::Software, Format::Mp4, None);
        assert!(software
            .iter()
            .all(|r| r.state == AccelerationState::Software));
        assert_eq!(software[1].implementation.as_deref(), Some("libx264"));
        let hardware = records(
            AttemptKind::FullVaapi,
            Format::Mp4,
            Some(Path::new("/dev/dri/renderD128")),
        );
        assert!(hardware
            .iter()
            .all(|r| r.state == AccelerationState::Active));
        assert_eq!(hardware[0].device.as_deref(), Some("/dev/dri/renderD128"));
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("input.mp4");
        let output = dir.path().join("output.mp4");
        fs::write(&input, b"source").unwrap();
        fs::write(&output, b"existing").unwrap();
        assert_eq!(destination(&input, &output, Format::Mp4).unwrap(), output);
        let partial = dir.path().join(".partial.mp4");
        fs::write(&partial, b"invalid").unwrap();
        assert!(media::probe_any(&partial).is_err());
        fs::remove_file(&partial).unwrap();
        assert!(!partial.exists());
        assert_eq!(fs::read(&output).unwrap(), b"existing");
    }
    #[test]
    fn mp4_quality_tiers_cap_resolution_without_upscaling() {
        let dir = tempfile::tempdir().unwrap();
        let landscape = dir.path().join("landscape.mp4");
        let portrait = dir.path().join("portrait.mp4");
        for (path, size) in [(&landscape, "1920x1080"), (&portrait, "1080x1920")] {
            generate(
                path,
                &[
                    "-f",
                    "lavfi",
                    "-i",
                    &format!("testsrc2=s={size}:r=10:d=0.5"),
                    "-an",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "ultrafast",
                    "-pix_fmt",
                    "yuv420p",
                ],
            );
        }
        for (input, quality, expected) in [
            (&landscape, Quality::Small, (1280, 720)),
            (&landscape, Quality::High, (1920, 1080)),
            (&portrait, Quality::Small, (720, 1280)),
        ] {
            let output = dir.path().join(format!(
                "{quality:?}-{}",
                input.file_name().unwrap().to_string_lossy()
            ));
            let a = args(
                &plan(Format::Mp4, quality, input, &output, 0, 500_000),
                AttemptKind::Software,
                None,
            );
            assert!(a.contains(
                &if quality == Quality::Small {
                    "28"
                } else {
                    "23"
                }
                .into()
            ));
            run(&plan(Format::Mp4, quality, input, &output, 0, 500_000));
            let probed = media::probe_any(&output).unwrap();
            assert_eq!((probed.width, probed.height), expected, "{quality:?}");
        }
    }
    #[test]
    fn webm_export_is_vp9_opus_with_exact_duration() {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("source.mp4");
        let output = dir.path().join("trim.webm");
        generate(
            &input,
            &[
                "-f",
                "lavfi",
                "-i",
                "testsrc2=s=320x240:r=30:d=3",
                "-f",
                "lavfi",
                "-i",
                "sine=d=3",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-shortest",
            ],
        );
        run(&plan(
            Format::Webm,
            Quality::Original,
            &input,
            &output,
            1_000_000,
            1_000_000,
        ));
        let probed = media::probe_any(&output).unwrap();
        assert_eq!(probed.codec, "vp9");
        assert!(probed.has_audio);
        assert!(stream_codecs(&output).contains(&"opus,audio".to_owned()));
        let video_duration = std::process::Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-count_frames",
                "-show_entries",
                "stream=nb_read_frames",
                "-of",
                "csv=p=0",
            ])
            .arg(&output)
            .output()
            .unwrap();
        let frames: i64 = String::from_utf8_lossy(&video_duration.stdout)
            .trim()
            .parse()
            .unwrap();
        assert!((frames - 30).abs() <= 1, "{frames} frames");
    }
    #[test]
    fn gif_export_has_no_audio_and_tier_width() {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("source.mp4");
        generate(
            &input,
            &[
                "-f",
                "lavfi",
                "-i",
                "testsrc2=s=1280x720:r=30:d=2",
                "-f",
                "lavfi",
                "-i",
                "sine=d=2",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-pix_fmt",
                "yuv420p",
                "-c:a",
                "aac",
                "-shortest",
            ],
        );
        for (quality, width) in [
            (Quality::Small, 480),
            (Quality::High, 720),
            (Quality::Original, 1280),
        ] {
            let output = dir.path().join(format!("{quality:?}.gif"));
            run(&plan(
                Format::Gif,
                quality,
                &input,
                &output,
                500_000,
                1_000_000,
            ));
            let probed = media::probe_any(&output).unwrap();
            assert_eq!(probed.codec, "gif");
            assert!(!probed.has_audio);
            assert_eq!(probed.width, width, "{quality:?}");
            assert!(
                (probed.duration_micros as i64 - 1_000_000).abs() <= 100_000,
                "{}",
                probed.duration_micros
            );
        }
    }
    #[test]
    fn copy_export_starts_at_preceding_keyframe() {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("gop.mp4");
        let output = dir.path().join("copy.mp4");
        generate(
            &input,
            &[
                "-f",
                "lavfi",
                "-i",
                "testsrc2=s=320x240:r=30:d=6",
                "-c:v",
                "libx264",
                "-g",
                "60",
                "-keyint_min",
                "60",
                "-sc_threshold",
                "0",
                "-pix_fmt",
                "yuv420p",
            ],
        );
        let index = media::probe(&input).unwrap().keyframes_micros;
        let effective = media::keyframe_at_or_before(&index, 2_500_000);
        assert_eq!(effective, Some(2_000_000));
        run(&plan(
            Format::Copy,
            Quality::Small,
            &input,
            &output,
            2_500_000,
            2_000_000,
        ));
        let probed = media::probe(&output).unwrap();
        assert_eq!(probed.codec, "h264");
        assert_eq!(probed.width, 320);
        // Output spans the 2 s keyframe to the 4.5 s end. Stream copy cannot
        // drop the trailing anchor frame B-frames depend on, so the end may
        // overshoot by the encoder's reorder delay (two frames for x264).
        assert!(
            (2_500_000..=2_600_000).contains(&probed.duration_micros),
            "{}",
            probed.duration_micros
        );
        // First packet is the copied keyframe (shifted only by B-frame delay).
        assert!(probed
            .keyframes_micros
            .first()
            .is_some_and(|k| *k < 100_000));
    }
    #[test]
    fn cancellation_terminates_the_ffmpeg_process_group() {
        use std::os::unix::process::CommandExt;
        let mut command = std::process::Command::new("ffmpeg");
        command
            .args([
                "-hide_banner",
                "-loglevel",
                "quiet",
                "-re",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=s=64x64:r=30",
                "-f",
                "null",
                "-",
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        command.process_group(0);
        let mut child = command.spawn().unwrap();
        let pid = child.id() as i32;
        std::thread::sleep(std::time::Duration::from_millis(100));
        unsafe {
            libc::kill(-pid, libc::SIGTERM);
        }
        let status = child.wait().unwrap();
        assert!(!status.success());
    }
    #[test]
    fn representative_codec_cadence_and_dimension_matrix_exports() {
        fn make(path: &Path, source: &str, codec: &str, extra: &[&str]) {
            let mut command = std::process::Command::new("ffmpeg");
            command.args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                source,
                "-an",
                "-c:v",
                codec,
            ]);
            command.args(extra).args(["-y"]).arg(path);
            assert!(
                command.status().unwrap().success(),
                "failed to generate {}",
                path.display()
            );
        }
        let dir = tempfile::tempdir().unwrap();
        let h264 = dir.path().join("h264.mp4");
        let hevc = dir.path().join("hevc.mp4");
        let vfr = dir.path().join("vfr.mp4");
        let odd = dir.path().join("odd.mp4");
        make(&h264, "testsrc2=s=320x240:r=30:d=1", "libx264", &[]);
        make(
            &hevc,
            "testsrc2=s=320x240:r=30:d=1",
            "libx265",
            &["-x265-params", "pools=1:frame-threads=1"],
        );
        make(&odd, "testsrc=s=321x241:r=25:d=1", "libx264rgb", &[]);
        let vfr_status = std::process::Command::new("ffmpeg")
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=s=320x240:r=30:d=2",
                "-vf",
                r"select=not(mod(n\,3))+not(mod(n\,5))",
                "-fps_mode",
                "vfr",
                "-an",
                "-c:v",
                "libx264",
                "-y",
            ])
            .arg(&vfr)
            .status()
            .unwrap();
        assert!(vfr_status.success());
        for (index, input) in [&h264, &hevc, &vfr, &odd].into_iter().enumerate() {
            let inspected = media::probe(input).unwrap();
            let output = dir.path().join(format!("matrix-{index}.mp4"));
            let status = std::process::Command::new("ffmpeg")
                .args(args(
                    &plan(
                        Format::Mp4,
                        Quality::Original,
                        input,
                        &output,
                        0,
                        inspected.duration_micros,
                    ),
                    AttemptKind::Software,
                    None,
                ))
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .unwrap();
            assert!(status.success(), "failed to export {}", input.display());
            let exported = media::probe(&output).unwrap();
            assert_eq!(exported.codec, "h264");
            assert_eq!(exported.width % 2, 0);
            assert_eq!(exported.height % 2, 0);
        }
    }
}
