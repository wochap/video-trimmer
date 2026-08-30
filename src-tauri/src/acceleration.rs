use serde::{Deserialize, Serialize};
use std::path::PathBuf;
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AccelerationState {
    Available,
    Active,
    Software,
    Failed,
    Unknown,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccelerationRecord {
    pub component: String,
    pub state: AccelerationState,
    pub implementation: Option<String>,
    pub api: Option<String>,
    pub device: Option<String>,
    pub reason: Option<String>,
}
pub fn classify_decoder(name: &str) -> AccelerationState {
    let n = name.to_ascii_lowercase();
    if ["vah264dec", "vaapih264dec", "vavp9dec", "vaav1dec"]
        .iter()
        .any(|x| n.contains(x))
    {
        AccelerationState::Active
    } else if n.starts_with("avdec_") || n.contains("openh264dec") {
        AccelerationState::Software
    } else {
        AccelerationState::Unknown
    }
}
pub fn render_nodes() -> Vec<PathBuf> {
    let Ok(entries) = std::fs::read_dir("/dev/dri") else {
        return vec![];
    };
    entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .is_some_and(|n| n.to_string_lossy().starts_with("renderD"))
        })
        .collect()
}
pub fn unknown_playback() -> Vec<AccelerationRecord> {
    vec![
        AccelerationRecord {
            component: "playback_decode".into(),
            state: AccelerationState::Unknown,
            implementation: None,
            api: None,
            device: None,
            reason: Some("WebKitGTK has not exposed decoder evidence yet".into()),
        },
        AccelerationRecord {
            component: "playback_render".into(),
            state: AccelerationState::Unknown,
            implementation: None,
            api: None,
            device: None,
            reason: Some("DMA-BUF rendering has not been observed".into()),
        },
    ]
}
pub fn playback_from_diagnostics(text: &str) -> Vec<AccelerationRecord> {
    const FACTORIES: &[&str] = &[
        "vah264dec",
        "vaapih264dec",
        "vavp9dec",
        "vaav1dec",
        "avdec_h264",
        "avdec_h265",
        "openh264dec",
    ];
    let decoder = FACTORIES.iter().rev().find(|name| text.contains(**name));
    let decode = decoder.map_or_else(
        || unknown_playback()[0].clone(),
        |name| AccelerationRecord {
            component: "playback_decode".into(),
            state: classify_decoder(name),
            implementation: Some((*name).into()),
            api: if name.starts_with("va") {
                Some("VA-API".into())
            } else {
                None
            },
            device: None,
            reason: None,
        },
    );
    let render = if text.to_ascii_lowercase().contains("dmabuf") {
        AccelerationRecord {
            component: "playback_render".into(),
            state: AccelerationState::Active,
            implementation: Some("DMA-BUF".into()),
            api: Some("DMA-BUF".into()),
            device: None,
            reason: None,
        }
    } else {
        unknown_playback()[1].clone()
    };
    vec![decode, render]
}
#[tauri::command]
pub fn playback_acceleration(
    logs: tauri::State<'_, crate::logging::LogPaths>,
) -> Vec<AccelerationRecord> {
    std::fs::read_to_string(&logs.gstreamer)
        .map(|s| playback_from_diagnostics(&s))
        .unwrap_or_else(|_| unknown_playback())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn decoder_classification_is_conservative() {
        assert_eq!(classify_decoder("vah264dec"), AccelerationState::Active);
        assert_eq!(classify_decoder("avdec_h264"), AccelerationState::Software);
        assert_eq!(classify_decoder("futuredec"), AccelerationState::Unknown)
    }
    #[test]
    fn diagnostics_preserve_factory_and_dmabuf() {
        let r = playback_from_diagnostics("selected vah264dec and dmabuf sink");
        assert_eq!(r[0].implementation.as_deref(), Some("vah264dec"));
        assert_eq!(r[1].state, AccelerationState::Active)
    }
}
