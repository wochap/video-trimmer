use serde::Serialize;
use thiserror::Error;
#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "snake_case")]
pub enum AppError {
    #[error("Input does not exist: {0}")]
    MissingInput(String),
    #[error("Input is not a readable regular file: {0}")]
    UnreadableInput(String),
    #[error("Only .mp4 input files are supported: {0}")]
    UnsupportedInput(String),
    #[error("Media inspection failed: {0}")]
    Probe(String),
    #[error("The MP4 contains no video stream")]
    NoVideo,
    #[error("Invalid trim request: {0}")]
    InvalidTrim(String),
    #[error("Invalid destination: {0}")]
    Destination(String),
    #[error("An export is already running")]
    ExportBusy,
    #[error("Export cancelled")]
    Cancelled,
    #[error("Export failed: {0}")]
    Export(String),
    #[error("Internal error: {0}")]
    Internal(String),
}
impl From<std::io::Error> for AppError {
    fn from(v: std::io::Error) -> Self {
        Self::Internal(v.to_string())
    }
}
