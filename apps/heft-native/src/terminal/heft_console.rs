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
    pending_standard_output: RefCell<String>,
    first_pending_line_is_prefixed: Cell<bool>,
}

impl HeftConsole {
    pub fn new(supports_color: bool) -> HeftConsole {
        HeftConsole::with_capture(supports_color, None)
    }

    #[cfg(test)]
    pub fn capturing(supports_color: bool) -> HeftConsole {
        HeftConsole::with_capture(supports_color, Some(RefCell::new(Vec::new())))
    }

    fn with_capture(supports_color: bool, captured_output: Option<RefCell<Vec<(OutputSeverity, String)>>>) -> HeftConsole {
        HeftConsole {
            supports_color,
            captured_output,
            closed_output: Cell::new(None),
            pending_standard_output: RefCell::new(String::new()),
            first_pending_line_is_prefixed: Cell::new(false),
        }
    }

    pub fn flush(&self) {
        let mut pending_standard_output = self.pending_standard_output.borrow_mut();
        if pending_standard_output.is_empty() {
            return;
        }
        if self.closed_output.get().is_none()
            && write_to_stream(OutputSeverity::Log, &pending_standard_output).is_err_and(|error| error.kind() == ErrorKind::BrokenPipe)
        {
            let prefixed = self.first_pending_line_is_prefixed.get();
            self.closed_output.set(Some(ClosedOutput { severity: OutputSeverity::Log, prefixed }));
        }
        pending_standard_output.clear();
    }

    #[cfg(test)]
    pub fn pending_standard_output_for_tests(&self) -> String {
        self.pending_standard_output.borrow().clone()
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
        if let Some(captured) = &self.captured_output {
            captured.borrow_mut().push((severity, data.to_owned()));
            return;
        }
        if severity == OutputSeverity::Log {
            let mut pending_standard_output = self.pending_standard_output.borrow_mut();
            if pending_standard_output.is_empty() {
                self.first_pending_line_is_prefixed.set(prefixed);
            }
            pending_standard_output.push_str(data);
            return;
        }
        self.flush();
        if self.closed_output.get().is_none() && write_to_stream(severity, data).is_err_and(|error| error.kind() == ErrorKind::BrokenPipe) {
            self.closed_output.set(Some(ClosedOutput { severity, prefixed }));
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

impl Drop for HeftConsole {
    fn drop(&mut self) {
        self.flush();
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
        self.console.flush();
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
