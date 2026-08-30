use directories::BaseDirs;
use std::{fs, path::PathBuf};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
pub struct LogPaths {
    pub state_dir: PathBuf,
    pub application: PathBuf,
    pub ffmpeg: PathBuf,
    pub gstreamer: PathBuf,
    pub verbose: bool,
}
pub fn init(
    verbose: bool,
) -> Result<(LogPaths, tracing_appender::non_blocking::WorkerGuard), String> {
    let base = std::env::var_os("XDG_STATE_HOME")
        .map(PathBuf::from)
        .or_else(|| BaseDirs::new().map(|b| b.home_dir().join(".local/state")))
        .ok_or("cannot resolve state directory")?;
    let dir = base.join("video-trimmer");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let app = dir.join("video-trimmer.log");
    let ffmpeg = dir.join("ffmpeg.log");
    let gst = dir.join("gstreamer.log");
    if verbose {
        std::env::set_var("GST_DEBUG", "2,webkit*:4,va*:4,dmabuf*:4");
        std::env::set_var("GST_DEBUG_FILE", &gst);
        std::env::set_var("WEBKIT_DEBUG", "Media")
    }
    let file = tracing_appender::rolling::never(&dir, "video-trimmer.log");
    let (non_blocking, guard) = tracing_appender::non_blocking(file);
    let filter = if verbose {
        "video_trimmer=debug"
    } else {
        "video_trimmer=info"
    };
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(filter))
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(std::io::stderr)
                .without_time()
                .with_target(false),
        )
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(non_blocking)
                .with_ansi(false),
        )
        .try_init()
        .map_err(|e| e.to_string())?;
    Ok((
        LogPaths {
            state_dir: dir,
            application: app,
            ffmpeg,
            gstreamer: gst,
            verbose,
        },
        guard,
    ))
}
