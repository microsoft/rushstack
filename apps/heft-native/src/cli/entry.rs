use std::env;
use std::ffi::OsString;
use std::io::Write;

use super::invocation::interpret_with_output;
use super::model::CliModel;
use super::outcome::{CliOutcome, PrintedOutput};
use super::width::read_help_width;

pub fn command_line_strings(command_line_arguments: &[OsString]) -> Option<Vec<&str>> {
    command_line_arguments.iter().map(|argument| argument.to_str()).collect()
}

fn is_native_output_allowed() -> bool {
    env::var_os("_RUSH_REPORTER_CHILD_FD").is_none() && env::var_os("_RUSH_REPORTER_CHILD_ACK_FD").is_none()
}

pub fn interpret_command_line_with_color<'a>(
    args: &'a [&'a str],
    model: &'a CliModel<'a>,
    supports_color: &dyn Fn() -> bool,
) -> CliOutcome<'a> {
    if !is_native_output_allowed() {
        return CliOutcome::Delegate;
    }
    interpret_with_output(args, model, read_help_width(), Some(supports_color))
}

pub fn write_printed_output_after(standard_output_prefix: &str, output: &PrintedOutput) -> i32 {
    let joined: String;
    let standard_output: &str = if standard_output_prefix.is_empty() {
        &output.stdout
    } else {
        joined = [standard_output_prefix, output.stdout.as_str()].concat();
        &joined
    };
    if !standard_output.is_empty() {
        let mut stdout = std::io::stdout().lock();
        let _ = stdout.write_all(standard_output.as_bytes());
        let _ = stdout.flush();
    }
    if !output.stderr.is_empty() {
        let mut stderr = std::io::stderr().lock();
        let _ = stderr.write_all(output.stderr.as_bytes());
        let _ = stderr.flush();
    }
    output.exit_code
}
