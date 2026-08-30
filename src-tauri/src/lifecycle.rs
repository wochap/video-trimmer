use std::{
    io::{self, Write},
    path::Path,
};
pub const EXIT_FAILURE: i32 = 1;
pub const EXIT_STARTUP: i32 = 2;
pub const EXIT_CANCELLED: i32 = 130;
pub fn write_success(path: &Path) -> io::Result<()> {
    writeln!(io::stdout().lock(), "{}", path.display())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exit_codes_are_distinct_and_nonzero() {
        assert_ne!(EXIT_FAILURE, EXIT_STARTUP);
        assert_ne!(EXIT_CANCELLED, EXIT_STARTUP);
        assert!([EXIT_FAILURE, EXIT_STARTUP, EXIT_CANCELLED]
            .iter()
            .all(|v| *v != 0))
    }
}
