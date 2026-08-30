use crate::{
    acceleration::{render_nodes, AccelerationRecord, AccelerationState},
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
use tauri::Emitter;
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
    force: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportProgress {
    fraction: f64,
    out_time_micros: u64,
    attempt: String,
}
#[derive(Serialize)]
pub struct ExportResult {
    output: String,
    acceleration: Vec<AccelerationRecord>,
}
struct ActiveGuard<'a>(&'a ExportState);
impl Drop for ActiveGuard<'_> {
    fn drop(&mut self) {
        self.0.active.store(false, Ordering::SeqCst);
        self.0.pid.store(0, Ordering::SeqCst);
        self.0.cancel.store(false, Ordering::SeqCst)
    }
}
enum AttemptKind {
    FullVaapi,
    VaapiEncode,
    Software,
}
impl AttemptKind {
    fn label(&self) -> &'static str {
        match self {
            Self::FullVaapi => "VA-API decode + encode",
            Self::VaapiEncode => "Software decode + VA-API encode",
            Self::Software => "Software decode + libx264",
        }
    }
}
fn progress_micros(line: &str) -> Option<u64> {
    line.strip_prefix("out_time_us=")?.parse().ok()
}
fn destination(input: &Path, output: &Path, force: bool) -> Result<PathBuf, AppError> {
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
    if Path::new(name)
        .extension()
        .and_then(|x| x.to_str())
        .is_none_or(|x| !x.eq_ignore_ascii_case("mp4"))
    {
        return Err(AppError::Destination("output must end in .mp4".into()));
    }
    let full = parent.join(name);
    if full.exists() {
        if full.canonicalize()? == input {
            return Err(AppError::Destination(
                "source and destination are the same file".into(),
            ));
        }
        if !force {
            return Err(AppError::Destination(
                "destination exists; choose another path or authorize overwrite".into(),
            ));
        }
    }
    Ok(full)
}
fn args(
    kind: &AttemptKind,
    node: Option<&Path>,
    input: &Path,
    temp: &Path,
    start: u64,
    duration: u64,
) -> Vec<String> {
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
    a.extend(
        [
            "-i",
            &input.to_string_lossy(),
            "-ss",
            &format!("{:.6}", start as f64 / 1e6),
            "-t",
            &format!("{:.6}", duration as f64 / 1e6),
            "-map",
            "0:v:0",
            "-map",
            "0:a?",
        ]
        .map(String::from),
    );
    match kind {
        AttemptKind::FullVaapi => a.extend(
            [
                "-vf",
                "setpts=PTS-STARTPTS,scale_vaapi=w=trunc(iw/2)*2:h=trunc(ih/2)*2",
                "-c:v",
                "h264_vaapi",
                "-qp",
                "20",
            ]
            .map(String::from),
        ),
        AttemptKind::VaapiEncode => a.extend(
            [
                "-vf",
                "setpts=PTS-STARTPTS,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=nv12,hwupload",
                "-c:v",
                "h264_vaapi",
                "-qp",
                "20",
            ]
            .map(String::from),
        ),
        AttemptKind::Software => a.extend(
            [
                "-vf",
                "setpts=PTS-STARTPTS,scale=trunc(iw/2)*2:trunc(ih/2)*2",
                "-c:v",
                "libx264",
                "-crf",
                "18",
                "-preset",
                "medium",
            ]
            .map(String::from),
        ),
    }
    a.extend(
        [
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-af",
            "asetpts=PTS-STARTPTS",
            "-movflags",
            "+faststart",
            "-avoid_negative_ts",
            "make_zero",
            "-progress",
            "pipe:1",
            "-nostats",
            &temp.to_string_lossy(),
        ]
        .map(String::from),
    );
    a
}
#[allow(clippy::too_many_arguments)]
async fn attempt(
    app: &tauri::AppHandle,
    state: &ExportState,
    logs: &LogPaths,
    kind: &AttemptKind,
    node: Option<&Path>,
    input: &Path,
    temp: &Path,
    start: u64,
    duration: u64,
) -> Result<(), String> {
    let _ = fs::remove_file(temp);
    let stderr = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&logs.ffmpeg)
        .map_err(|e| e.to_string())?;
    let mut ffmpeg_args = args(kind, node, input, temp, start, duration);
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
        tokio::select! {line=lines.next_line()=>match line.map_err(|e|e.to_string())?{Some(line)=>{if let Some(v)=progress_micros(&line){let _=app.emit("export-progress",ExportProgress{fraction:(v as f64/duration as f64).clamp(0.0,1.0),out_time_micros:v,attempt:kind.label().into()});}},None=>break},_=tokio::time::sleep(std::time::Duration::from_millis(100))=>{if state.cancel.load(Ordering::SeqCst){let pid=state.pid.load(Ordering::SeqCst);if pid>0{unsafe{libc::kill(-pid,libc::SIGTERM);}}let _=child.wait().await;let _=fs::remove_file(temp);return Err("cancelled".into())}}}
    }
    let status = child.wait().await.map_err(|e| e.to_string())?;
    if status.success() {
        Ok(())
    } else {
        let _ = fs::remove_file(temp);
        Err(format!("{} exited with {status}", kind.label()))
    }
}
fn records(kind: &AttemptKind, node: Option<&Path>) -> Vec<AccelerationRecord> {
    let device = node.map(|p| p.display().to_string());
    match kind {
        AttemptKind::FullVaapi => vec![
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
        AttemptKind::VaapiEncode => vec![
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
        AttemptKind::Software => vec![
            ("export_decode", "FFmpeg software decoder"),
            ("export_encode", "libx264"),
        ]
        .into_iter()
        .map(|(c, i)| AccelerationRecord {
            component: c.into(),
            state: AccelerationState::Software,
            implementation: Some(i.into()),
            api: None,
            device: None,
            reason: Some("VA-API attempts unavailable or failed".into()),
        })
        .collect(),
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
    let input = media::validate_input(Path::new(&request.input))?;
    let output = destination(&input, Path::new(&request.output), request.force)?;
    let temp = tempfile::Builder::new()
        .prefix(".video-trimmer-")
        .suffix(".mp4")
        .tempfile_in(output.parent().unwrap())
        .map_err(|e| AppError::Destination(e.to_string()))?;
    let temp_path = temp.path().to_path_buf();
    drop(temp);
    let nodes = render_nodes();
    let mut selected = None;
    let mut failures = vec![];
    for kind in [
        AttemptKind::FullVaapi,
        AttemptKind::VaapiEncode,
        AttemptKind::Software,
    ] {
        if !matches!(kind, AttemptKind::Software) && nodes.is_empty() {
            continue;
        }
        let node = nodes.first().map(PathBuf::as_path);
        tracing::info!(attempt=kind.label(),device=?node,"starting export attempt");
        match attempt(
            &app,
            &state,
            &logs,
            &kind,
            node,
            &input,
            &temp_path,
            request.start_micros,
            request.end_micros - request.start_micros,
        )
        .await
        {
            Ok(()) => {
                selected = Some((kind, node.map(Path::to_path_buf)));
                break;
            }
            Err(e) if e == "cancelled" => return Err(AppError::Cancelled),
            Err(e) => {
                tracing::warn!(attempt=kind.label(),reason=%e,"export attempt failed; trying fallback");
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
    media::probe(&temp_path).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        AppError::Export(format!("output validation failed: {e}"))
    })?;
    OpenOptions::new()
        .write(true)
        .open(&temp_path)?
        .sync_all()?;
    fs::rename(&temp_path, &output).map_err(|e| {
        let _ = fs::remove_file(&temp_path);
        AppError::Destination(format!("could not finalize output: {e}"))
    })?;
    let canonical = output.canonicalize()?;
    let acceleration = records(&kind, node.as_deref());
    let _ = app.emit("acceleration-update", &acceleration);
    tracing::info!(output=%canonical.display(),attempt=kind.label(),"export completed");
    crate::lifecycle::write_success(&canonical)?;
    app.exit(0);
    Ok(ExportResult {
        output: canonical.display().to_string(),
        acceleration,
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
    #[test]
    fn output_must_be_mp4() {
        let d = tempfile::tempdir().unwrap();
        let input = d.path().join("in.mp4");
        fs::write(&input, b"x").unwrap();
        assert!(matches!(
            destination(&input, &d.path().join("out.mov"), false),
            Err(AppError::Destination(_))
        ))
    }
    #[test]
    fn ffmpeg_args_are_discrete_and_exact() {
        let a = args(
            &AttemptKind::Software,
            None,
            Path::new("a;echo.mp4"),
            Path::new("out.mp4"),
            1_000_000,
            2_000_000,
        );
        assert!(a.contains(&"a;echo.mp4".into()));
        assert!(a.contains(&"libx264".into()));
        assert!(!a.contains(&"-c copy".into()))
    }
    #[test]
    fn software_attempt_produces_exact_silent_interval() {
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("source.mp4");
        let output = dir.path().join("trim.mp4");
        let made = std::process::Command::new("ffmpeg")
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "testsrc2=s=320x240:r=30:d=3",
                "-an",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-y",
            ])
            .arg(&input)
            .status()
            .unwrap();
        assert!(made.success());
        let status = std::process::Command::new("ffmpeg")
            .args(args(
                &AttemptKind::Software,
                None,
                &input,
                &output,
                1_000_000,
                1_000_000,
            ))
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .unwrap();
        assert!(status.success());
        let result = media::probe(&output).unwrap();
        assert!(!result.has_audio);
        assert!((result.duration_micros as i64 - 1_000_000).abs() <= 34_000);
    }
    #[test]
    fn progress_fallback_overwrite_validation_and_cleanup_are_transactional() {
        assert_eq!(progress_micros("out_time_us=750000"), Some(750_000));
        assert_eq!(progress_micros("progress=continue"), None);
        let software = records(&AttemptKind::Software, None);
        assert!(software
            .iter()
            .all(|r| r.state == AccelerationState::Software));
        assert_eq!(software[1].implementation.as_deref(), Some("libx264"));
        let hardware = records(
            &AttemptKind::FullVaapi,
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
        assert!(matches!(
            destination(&input, &output, false),
            Err(AppError::Destination(_))
        ));
        assert_eq!(destination(&input, &output, true).unwrap(), output);
        let partial = dir.path().join(".partial.mp4");
        fs::write(&partial, b"invalid").unwrap();
        assert!(media::probe(&partial).is_err());
        fs::remove_file(&partial).unwrap();
        assert!(!partial.exists());
        assert_eq!(fs::read(&output).unwrap(), b"existing");
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
                    &AttemptKind::Software,
                    None,
                    input,
                    &output,
                    0,
                    inspected.duration_micros,
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
