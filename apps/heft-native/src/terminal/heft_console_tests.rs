use super::heft_console::{HeftConsole, OutputSeverity};

#[test]
fn severity_colors_match_the_terminal_package() {
    let colored = HeftConsole::new(true);
    let plain = HeftConsole::new(false);
    assert_eq!(colored.format_line("a\x1b[1mb", OutputSeverity::Error), "\x1b[31mab\x1b[39m\n");
    assert_eq!(plain.format_line("a\x1b[1mb", OutputSeverity::Error), "ab\n");
    assert_eq!(colored.format_line("\x1b[1mx\x1b[22m", OutputSeverity::Log), "\x1b[1mx\x1b[22m\n");
    assert_eq!(plain.format_line("\x1b[1mx\x1b[22m", OutputSeverity::Log), "x\n");
}

#[test]
fn scoped_output_prefixes_every_line() {
    let console = HeftConsole::new(false);
    let output = console.scoped_logger_output("build:set-env");
    assert_eq!(output.prefix_lines("a\nb\n"), "[build:set-env] a\n[build:set-env] b\n");
    assert_eq!(output.prefix_lines("partial"), "[build:set-env] partial");
    assert_eq!(output.prefix_lines(" rest\n"), " rest\n");
    assert_eq!(output.prefix_lines("\n"), "[build:set-env] \n");
}

#[test]
fn log_lines_wait_for_a_flush_and_errors_flush_them_first() {
    let console = HeftConsole::new(false);
    console.write_line("pending");
    assert_eq!(console.pending_standard_output_for_tests(), "pending\n");
    console.scoped_logger_output("build:x").write_line("next");
    assert_eq!(console.pending_standard_output_for_tests(), "pending\n[build:x] next\n");
    console.flush();
    assert_eq!(console.pending_standard_output_for_tests(), "");
    assert!(console.closed_output().is_none());
}
