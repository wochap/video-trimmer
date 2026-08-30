use std::process::{Command, Stdio};

fn binary() -> Command {
    Command::new(env!("CARGO_BIN_EXE_video-trimmer"))
}

#[test]
fn help_version_and_malformed_arguments_finish_before_gui() {
    let help = binary().arg("--help").output().unwrap();
    assert!(help.status.success());
    assert!(String::from_utf8_lossy(&help.stdout).contains("Trim one MP4"));
    assert!(help.stderr.is_empty());
    let version = binary().arg("--version").output().unwrap();
    assert!(version.status.success());
    assert_eq!(
        String::from_utf8_lossy(&version.stdout).trim(),
        format!("video-trimmer {}", env!("CARGO_PKG_VERSION"))
    );
    assert!(version.stderr.is_empty());
    let invalid = binary().arg("--unknown").output().unwrap();
    assert!(!invalid.status.success());
    assert!(invalid.stdout.is_empty());
    assert!(String::from_utf8_lossy(&invalid.stderr).contains("unexpected argument"));
}

#[test]
fn unavailable_wayland_is_nonzero_and_stdout_clean() {
    let output = binary()
        .env_remove("WAYLAND_DISPLAY")
        .arg("example.mp4")
        .args(["--output", "out.mp4", "--force", "--verbose"])
        .output()
        .unwrap();
    assert_eq!(output.status.code(), Some(2));
    assert!(output.stdout.is_empty());
    assert!(String::from_utf8_lossy(&output.stderr).contains("requires a native Wayland session"));
}

#[test]
fn simultaneous_invocations_own_independent_streams() {
    let first = binary()
        .arg("--help")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let second = binary()
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let first = first.wait_with_output().unwrap();
    let second = second.wait_with_output().unwrap();
    assert!(first.status.success() && second.status.success());
    assert!(first.stderr.is_empty() && second.stderr.is_empty());
    assert!(String::from_utf8_lossy(&first.stdout).contains("Usage:"));
    assert!(String::from_utf8_lossy(&second.stdout).contains(env!("CARGO_PKG_VERSION")));
}
