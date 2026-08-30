use crate::{cli::LaunchOptions, error::AppError, media::MediaState};
use std::sync::Mutex;
pub struct LaunchState(pub Mutex<Option<LaunchOptions>>);
pub struct LogGuard {
    pub _guard: tracing_appender::non_blocking::WorkerGuard,
}
#[tauri::command]
pub fn take_launch_options(
    state: tauri::State<'_, LaunchState>,
) -> Result<LaunchOptions, AppError> {
    state
        .0
        .lock()
        .map_err(|_| AppError::Internal("launch state poisoned".into()))?
        .take()
        .ok_or_else(|| AppError::Internal("launch options were already consumed".into()))
}
#[tauri::command]
pub fn exit_application(app: tauri::AppHandle, media: tauri::State<'_, MediaState>, code: i32) {
    crate::media::cleanup(&media);
    let exit_code = if code == crate::lifecycle::EXIT_CANCELLED {
        crate::lifecycle::EXIT_CANCELLED
    } else {
        crate::lifecycle::EXIT_FAILURE
    };
    app.exit(exit_code)
}
