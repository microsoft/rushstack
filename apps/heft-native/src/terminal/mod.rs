mod ansi_escape_codes;
mod color_support;
#[cfg(test)]
mod color_support_tests;
mod force_color;
mod has_flag;
mod heft_console;
mod javascript_number_format;
mod parse_int;
mod term_patterns;

pub use ansi_escape_codes::{bold, green, red};
pub use color_support::console_supports_color_for_this_process;
pub use heft_console::{ClosedOutput, HeftConsole, OutputSeverity, ScopedLoggerOutput};
pub use javascript_number_format::{
    format_rounded_milliseconds_as_seconds, format_seconds_with_three_fraction_digits,
};
