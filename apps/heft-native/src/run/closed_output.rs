use std::ffi::OsString;
use std::path::Path;

use crate::process::{exec_node_script, exit_because_node_could_not_be_started};
use crate::terminal::{ClosedOutput, OutputSeverity};

const WRITE_THROUGH_HEFT_TERMINAL_SCRIPT: &str = concat!(
    "const [heftPackageFolder, prefixed, severity] = process.argv.slice(1);",
    "const terminalPackage = require(require.resolve('@rushstack/terminal', { paths: [heftPackageFolder] }));",
    "const consoleProvider = new terminalPackage.ConsoleTerminalProvider();",
    "const provider = prefixed === 'prefixed' ? new terminalPackage.PrefixProxyTerminalProvider({ terminalProvider: consoleProvider, prefix: '' }) : consoleProvider;",
    "const terminal = new terminalPackage.Terminal(provider);",
    "if (severity === 'error') { terminal.writeErrorLine(''); } else { terminal.writeLine(''); }"
);

pub fn exit_like_node_after_closed_output(closed_output: ClosedOutput, heft_package_folder: &str) -> ! {
    let arguments = [
        OsString::from(WRITE_THROUGH_HEFT_TERMINAL_SCRIPT),
        OsString::from(heft_package_folder),
        OsString::from(if closed_output.prefixed { "prefixed" } else { "unprefixed" }),
        OsString::from(if closed_output.severity == OutputSeverity::Error { "error" } else { "log" }),
    ];
    let node_start_error = exec_node_script(Path::new("-e"), &arguments);
    exit_because_node_could_not_be_started(&node_start_error)
}
