use crate::{
    acceleration::{unknown_playback, AccelerationRecord},
    error::AppError,
};
use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::{
    fs::{self, File},
    path::{Path, PathBuf},
    process::Command,
    sync::Mutex,
};
use tauri::Manager;
#[derive(Default)]
pub struct MediaState {
    pub current: Mutex<Option<CurrentMedia>>,
}
pub struct CurrentMedia {
    pub input: PathBuf,
    pub cache: PathBuf,
}
fn authorized_paths(input: &Path, thumbnails: &[String]) -> Vec<PathBuf> {
    std::iter::once(input.to_path_buf())
        .chain(thumbnails.iter().map(PathBuf::from))
        .collect()
}
fn replace_current<F>(current: &mut Option<CurrentMedia>, next: CurrentMedia, mut forbid: F)
where
    F: FnMut(&Path),
{
    if let Some(old) = current.take() {
        forbid(&old.input);
        let _ = fs::remove_dir_all(old.cache);
    }
    *current = Some(next);
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoMetadata {
    pub path: String,
    pub duration_micros: u64,
    pub width: u32,
    pub height: u32,
    pub codec: String,
    pub frame_rate: f64,
    pub has_audio: bool,
    pub thumbnails: Vec<String>,
    pub thumbnail_warning: Option<String>,
    pub playback_acceleration: Vec<AccelerationRecord>,
}
#[derive(Deserialize)]
struct Probe {
    streams: Vec<Stream>,
    format: Format,
}
#[derive(Deserialize)]
struct Stream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    avg_frame_rate: Option<String>,
    r_frame_rate: Option<String>,
    duration: Option<String>,
}
#[derive(Deserialize)]
struct Format {
    duration: Option<String>,
    format_name: Option<String>,
}
pub fn validate_input(raw: &Path) -> Result<PathBuf, AppError> {
    if raw
        .extension()
        .and_then(|v| v.to_str())
        .is_none_or(|v| !v.eq_ignore_ascii_case("mp4"))
    {
        return Err(AppError::UnsupportedInput(raw.display().to_string()));
    }
    if !raw.exists() {
        return Err(AppError::MissingInput(raw.display().to_string()));
    }
    let canonical = raw
        .canonicalize()
        .map_err(|_| AppError::UnreadableInput(raw.display().to_string()))?;
    if !canonical.is_file() || File::open(&canonical).is_err() {
        return Err(AppError::UnreadableInput(canonical.display().to_string()));
    }
    Ok(canonical)
}
fn parse_rate(s: Option<&str>) -> f64 {
    let Some(s) = s else { return 30.0 };
    let mut p = s.split('/');
    let a = p.next().and_then(|x| x.parse::<f64>().ok()).unwrap_or(30.0);
    let b = p.next().and_then(|x| x.parse::<f64>().ok()).unwrap_or(1.0);
    if b > 0.0 && a > 0.0 {
        a / b
    } else {
        30.0
    }
}
pub fn probe(path: &Path) -> Result<VideoMetadata, AppError> {
    let out = Command::new("ffprobe")
        .args([
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
        ])
        .arg(path)
        .output()
        .map_err(|e| AppError::Probe(format!("could not start ffprobe: {e}")))?;
    if !out.status.success() {
        return Err(AppError::Probe(
            String::from_utf8_lossy(&out.stderr).trim().to_owned(),
        ));
    }
    let p: Probe = serde_json::from_slice(&out.stdout)
        .map_err(|e| AppError::Probe(format!("invalid ffprobe JSON: {e}")))?;
    if !p
        .format
        .format_name
        .as_deref()
        .unwrap_or("")
        .split(',')
        .any(|v| v == "mov" || v == "mp4")
    {
        return Err(AppError::Probe("container is not recognized as MP4".into()));
    }
    let v = p
        .streams
        .iter()
        .find(|s| s.codec_type.as_deref() == Some("video"))
        .ok_or(AppError::NoVideo)?;
    let duration = v
        .duration
        .as_ref()
        .or(p.format.duration.as_ref())
        .and_then(|x| x.parse::<f64>().ok())
        .filter(|x| *x > 0.0)
        .ok_or_else(|| AppError::Probe("missing positive duration".into()))?;
    let rate = parse_rate(v.avg_frame_rate.as_deref().or(v.r_frame_rate.as_deref()));
    Ok(VideoMetadata {
        path: path.to_string_lossy().into_owned(),
        duration_micros: (duration * 1_000_000.0).round() as u64,
        width: v.width.unwrap_or(0),
        height: v.height.unwrap_or(0),
        codec: v.codec_name.clone().unwrap_or_else(|| "unknown".into()),
        frame_rate: rate,
        has_audio: p
            .streams
            .iter()
            .any(|s| s.codec_type.as_deref() == Some("audio")),
        thumbnails: vec![],
        thumbnail_warning: None,
        playback_acceleration: unknown_playback(),
    })
}
fn thumbnails(path: &Path, duration: u64) -> Result<(PathBuf, Vec<String>), String> {
    let root = ProjectDirs::from("com", "wochap", "video-trimmer")
        .ok_or("cannot resolve cache directory")?
        .cache_dir()
        .join(format!("preview-{}", std::process::id()));
    if root.exists() {
        fs::remove_dir_all(&root).map_err(|e| e.to_string())?
    }
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let count = 12u64.min((duration / 1_000_000).max(1));
    let interval = duration as f64 / 1_000_000.0 / count as f64;
    let pattern = root.join("frame-%02d.jpg");
    let status = Command::new("ffmpeg")
        .args(["-hide_banner", "-loglevel", "error", "-i"])
        .arg(path)
        .args([
            "-vf",
            &format!("fps=1/{interval:.6},scale=240:-2"),
            "-frames:v",
            &count.to_string(),
            "-q:v",
            "4",
            "-y",
        ])
        .arg(&pattern)
        .status()
        .map_err(|e| e.to_string())?;
    if !status.success() {
        let _ = fs::remove_dir_all(&root);
        return Err("FFmpeg could not generate timeline thumbnails".into());
    }
    let mut files = fs::read_dir(&root)
        .map_err(|e| e.to_string())?
        .flatten()
        .map(|e| e.path().to_string_lossy().into_owned())
        .collect::<Vec<_>>();
    files.sort();
    Ok((root, files))
}
#[tauri::command]
pub async fn load_input(
    app: tauri::AppHandle,
    state: tauri::State<'_, MediaState>,
    path: String,
) -> Result<VideoMetadata, AppError> {
    let canonical = validate_input(Path::new(&path))?;
    let mut metadata = probe(&canonical)?;
    let generated = thumbnails(&canonical, metadata.duration_micros);
    let (cache, files) = match generated {
        Ok(v) => v,
        Err(e) => {
            metadata.thumbnail_warning = Some(e);
            let fallback = ProjectDirs::from("com", "wochap", "video-trimmer")
                .map(|p| {
                    p.cache_dir()
                        .join(format!("preview-{}", std::process::id()))
                })
                .unwrap_or_default();
            (fallback, vec![])
        }
    };
    metadata.thumbnails = files;
    for path in authorized_paths(&canonical, &metadata.thumbnails) {
        app.asset_protocol_scope()
            .allow_file(path)
            .map_err(|e| AppError::Internal(e.to_string()))?;
    }
    let mut current = state
        .current
        .lock()
        .map_err(|_| AppError::Internal("media state poisoned".into()))?;
    replace_current(
        &mut current,
        CurrentMedia {
            input: canonical,
            cache,
        },
        |old| {
            let _ = app.asset_protocol_scope().forbid_file(old);
        },
    );
    Ok(metadata)
}
pub fn cleanup(state: &MediaState) {
    if let Ok(mut c) = state.current.lock() {
        if let Some(old) = c.take() {
            let _ = fs::remove_dir_all(old.cache);
        };
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_extension_before_probe() {
        assert!(matches!(
            validate_input(Path::new("x.mov")),
            Err(AppError::UnsupportedInput(_))
        ))
    }
    #[test]
    fn parses_fractional_rate() {
        assert!((parse_rate(Some("30000/1001")) - 29.970).abs() < 0.01);
        assert_eq!(parse_rate(Some("0/0")), 30.0)
    }
    #[test]
    fn probes_valid_silent_and_rejects_malformed_media() {
        let dir = tempfile::tempdir().unwrap();
        let valid = dir.path().join("silent.mp4");
        let status = Command::new("ffmpeg")
            .args([
                "-hide_banner",
                "-loglevel",
                "error",
                "-f",
                "lavfi",
                "-i",
                "color=c=blue:s=320x240:r=30:d=1",
                "-an",
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-y",
            ])
            .arg(&valid)
            .status()
            .unwrap();
        assert!(status.success());
        let metadata = probe(&valid).unwrap();
        assert_eq!((metadata.width, metadata.height), (320, 240));
        assert!(!metadata.has_audio);
        let malformed = dir.path().join("broken.mp4");
        fs::write(&malformed, b"not media").unwrap();
        assert!(matches!(probe(&malformed), Err(AppError::Probe(_))));
    }
    #[test]
    fn authorization_is_per_file_and_replacement_cleans_cache() {
        let dir = tempfile::tempdir().unwrap();
        let old_cache = dir.path().join("old-cache");
        fs::create_dir(&old_cache).unwrap();
        fs::write(old_cache.join("frame.jpg"), b"x").unwrap();
        let input = dir.path().join("new.mp4");
        let thumb = dir.path().join("frame.jpg").display().to_string();
        let authorized = authorized_paths(&input, std::slice::from_ref(&thumb));
        assert_eq!(authorized, vec![input.clone(), PathBuf::from(thumb)]);
        assert!(!authorized
            .iter()
            .any(|p| p == Path::new("/") || p.ends_with("home")));
        let mut current = Some(CurrentMedia {
            input: dir.path().join("old.mp4"),
            cache: old_cache.clone(),
        });
        let mut revoked = vec![];
        replace_current(
            &mut current,
            CurrentMedia {
                input: input.clone(),
                cache: dir.path().join("new-cache"),
            },
            |p| revoked.push(p.to_path_buf()),
        );
        assert_eq!(revoked, vec![dir.path().join("old.mp4")]);
        assert!(!old_cache.exists());
        assert_eq!(current.as_ref().unwrap().input, input);
        cleanup(&MediaState {
            current: Mutex::new(current),
        });
    }
}
