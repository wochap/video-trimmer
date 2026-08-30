use clap::Parser;
use serde::Serialize;
use std::path::PathBuf;
#[derive(Debug, Clone, Parser)]
#[command(
    name = "video-trimmer",
    version,
    about = "Trim one MP4 precisely in a minimal Wayland UI"
)]
pub struct Cli {
    #[arg(value_name = "INPUT")]
    pub input: Option<PathBuf>,
    #[arg(short, long, value_name = "PATH")]
    pub output: Option<PathBuf>,
    #[arg(short, long)]
    pub force: bool,
    #[arg(short, long)]
    pub verbose: bool,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchOptions {
    pub input: Option<String>,
    pub output: Option<String>,
    pub force: bool,
    pub verbose: bool,
}
impl From<Cli> for LaunchOptions {
    fn from(v: Cli) -> Self {
        Self {
            input: v.input.map(|p| p.to_string_lossy().into_owned()),
            output: v.output.map(|p| p.to_string_lossy().into_owned()),
            force: v.force,
            verbose: v.verbose,
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_all_options() {
        let c = Cli::try_parse_from(["video-trimmer", "in.mp4", "-o", "out.mp4", "-fv"]).unwrap();
        assert_eq!(c.input.unwrap(), PathBuf::from("in.mp4"));
        assert!(c.force && c.verbose)
    }
    #[test]
    fn rejects_unknown_and_extra_input() {
        assert!(Cli::try_parse_from(["video-trimmer", "--wat"]).is_err());
        assert!(Cli::try_parse_from(["video-trimmer", "a.mp4", "b.mp4"]).is_err())
    }
}
