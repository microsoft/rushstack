use std::cell::{Cell, RefCell};
use std::io::{ErrorKind, Write};

use super::ansi_escape_codes::{red, remove_ansi_escape_codes};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum OutputSeverity {
    Log,
    Error,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct ClosedOutput {
    pub severity: OutputSeverity,
    pub prefixed: bool,
}

pub struct HeftConsole {
    supports_color: bool,
    captured_output: Option<RefCell<Vec<(OutputSeverity, String)>>>,
    closed_output: Cell<Option<ClosedOutput>>,
}

impl HeftConsole {
    pub fn new(supports_color: bool) -> HeftConsole {
        HeftConsole { supports_color, captured_output: None, closed_output: Cell::new(None) }
    }

    #[cfg(test)]
    pub fn capturing(supports_color: bool) -> HeftConsole {
        HeftConsole { supports_color, captured_output: Some(RefCell::new(Vec::new())), closed_output: Cell::new(None) }
    }

    pub fn closed_output(&self) -> Option<ClosedOutput> {
        self.closed_output.get()
    }

    #[cfg(test)]
    pub fn captured_output(&self) -> Vec<(OutputSeverity, String)> {
        self.captured_output.as_ref().map(|captured| captured.borrow().clone()).unwrap_or_default()
    }

    pub fn write_line(&self, text: &str) {
        self.write(OutputSeverity::Log, &self.format_line(text, OutputSeverity::Log), false);
    }

    pub fn write_error_line(&self, text: &str) {
        self.write(OutputSeverity::Error, &self.format_line(text, OutputSeverity::Error), false);
    }

    fn write(&self, severity: OutputSeverity, data: &str, prefixed: bool) {
        if self.closed_output.get().is_some() {
            return;
        }
        match &self.captured_output {
            Some(captured) => captured.borrow_mut().push((severity, data.to_owned())),
            None => {
                if write_to_stream(severity, data).is_err_and(|error| error.kind() == ErrorKind::BrokenPipe) {
                    self.closed_output.set(Some(ClosedOutput { severity, prefixed }));
                }
            }
        }
    }

    pub fn format_line(&self, text: &str, severity: OutputSeverity) -> String {
        let text_with_severity_color = match severity {
            OutputSeverity::Log => text.to_owned(),
            OutputSeverity::Error => red(&remove_ansi_escape_codes(text)),
        };
        let mut line = if self.supports_color {
            text_with_severity_color
        } else {
            remove_ansi_escape_codes(&text_with_severity_color).into_owned()
        };
        line.push('\n');
        line
    }

    pub fn unprefixed_output(&self) -> ScopedLoggerOutput<'_> {
        ScopedLoggerOutput {
            console: self,
            prefix: String::new(),
            is_on_new_line: Cell::new(true),
        }
    }

    pub fn scoped_logger_output(&self, logger_name: &str) -> ScopedLoggerOutput<'_> {
        ScopedLoggerOutput {
            console: self,
            prefix: format!("[{logger_name}] "),
            is_on_new_line: Cell::new(true),
        }
    }
}

pub struct ScopedLoggerOutput<'console> {
    console: &'console HeftConsole,
    prefix: String,
    is_on_new_line: Cell<bool>,
}

impl ScopedLoggerOutput<'_> {
    pub fn write_line(&self, text: &str) {
        let line = self.console.format_line(text, OutputSeverity::Log);
        self.console.write(OutputSeverity::Log, &self.prefix_lines(&line), !self.prefix.is_empty());
    }

    pub fn output_is_closed(&self) -> bool {
        self.console.closed_output().is_some()
    }

    pub fn prefix_lines(&self, data: &str) -> String {
        let mut prefixed = String::with_capacity(data.len() + self.prefix.len());
        let mut current_index = 0;
        for (newline_index, _) in data.match_indices('\n') {
            if self.is_on_new_line.get() {
                prefixed.push_str(&self.prefix);
            }
            prefixed.push_str(&data[current_index..=newline_index]);
            current_index = newline_index + 1;
            self.is_on_new_line.set(true);
        }
        let remaining_data = &data[current_index..];
        if !remaining_data.is_empty() {
            if self.is_on_new_line.get() {
                prefixed.push_str(&self.prefix);
            }
            prefixed.push_str(remaining_data);
            self.is_on_new_line.set(false);
        }
        prefixed
    }
}

fn write_to_stream(severity: OutputSeverity, data: &str) -> std::io::Result<()> {
    if severity == OutputSeverity::Log {
        let mut standard_output = std::io::stdout().lock();
        standard_output.write_all(data.as_bytes())?;
        standard_output.flush()
    } else {
        std::io::stderr().lock().write_all(data.as_bytes())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
