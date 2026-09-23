use crate::{cli::LaunchOptions, error::AppError, lifecycle, media::MediaState};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Mutex,
};
pub struct LaunchState {
    pub options: Mutex<Option<LaunchOptions>>,
    pub succeeded: AtomicBool,
}
impl LaunchState {
    pub fn new(options: LaunchOptions) -> Self {
        Self {
            options: Mutex::new(Some(options)),
            succeeded: AtomicBool::new(false),
        }
    }
}
pub struct LogGuard {
    pub _guard: tracing_appender::non_blocking::WorkerGuard,
}
#[tauri::command]
pub fn take_launch_options(
    state: tauri::State<'_, LaunchState>,
) -> Result<LaunchOptions, AppError> {
    state
        .options
        .lock()
        .map_err(|_| AppError::Internal("launch state poisoned".into()))?
        .take()
        .ok_or_else(|| AppError::Internal("launch options were already consumed".into()))
}
// Any successful export makes the session a success, so staying open and
// closing later still exits 0. Otherwise only cancellation keeps its code.
fn exit_code(requested: i32, succeeded: bool) -> i32 {
    if succeeded {
        0
    } else if requested == lifecycle::EXIT_CANCELLED {
        lifecycle::EXIT_CANCELLED
    } else {
        lifecycle::EXIT_FAILURE
    }
}
#[tauri::command]
pub fn exit_application(
    app: tauri::AppHandle,
    media: tauri::State<'_, MediaState>,
    launch: tauri::State<'_, LaunchState>,
    code: i32,
) {
    crate::media::cleanup(&media);
    app.exit(exit_code(code, launch.succeeded.load(Ordering::SeqCst)))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exit_code_is_zero_only_after_success() {
        assert_eq!(exit_code(0, true), 0);
        assert_eq!(exit_code(130, true), 0);
        assert_eq!(exit_code(1, true), 0);
        assert_eq!(exit_code(0, false), lifecycle::EXIT_FAILURE);
        assert_eq!(exit_code(130, false), lifecycle::EXIT_CANCELLED);
        assert_eq!(exit_code(1, false), lifecycle::EXIT_FAILURE);
    }
}
