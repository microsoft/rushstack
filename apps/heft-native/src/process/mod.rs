use std::ffi::OsString;
use std::io::{ErrorKind, Write};
use std::path::Path;
use std::process::Command;

use crate::version::{
    locate_companion_javascript_heft_bin, COMPANION_JAVASCRIPT_HEFT_BIN_ENVIRONMENT_VARIABLE,
};

const EXIT_CODE_WHEN_NODE_IS_NOT_FOUND: i32 = 127;
const EXIT_CODE_WHEN_NODE_CANNOT_BE_EXECUTED: i32 = 126;

pub fn exec_javascript_heft(command_line_arguments: &[OsString]) -> ! {
    let current_folder = std::env::current_dir().unwrap_or_default();
    let Some(companion_heft_bin) = locate_companion_javascript_heft_bin(&current_folder) else {
        let _ = writeln!(
            std::io::stderr(),
            "heft: unable to find the @rushstack/heft JavaScript package of this binary; set {COMPANION_JAVASCRIPT_HEFT_BIN_ENVIRONMENT_VARIABLE} to the path of its bin/heft script"
        );
        std::process::exit(1)
    };
    let node_start_error = exec_node_script(&companion_heft_bin, command_line_arguments);
    exit_because_node_could_not_be_started(&node_start_error)
}

pub fn exec_node_script(script_path: &Path, command_line_arguments: &[OsString]) -> std::io::Error {
    let _ = std::io::stdout().flush();
    let _ = std::io::stderr().flush();
    let mut node_command = Command::new("node");
    node_command.arg(script_path).args(command_line_arguments);
    replace_current_process_or_wait(node_command)
}

pub fn exit_because_node_could_not_be_started(node_start_error: &std::io::Error) -> ! {
    let _ = writeln!(
        std::io::stderr(),
        "heft: unable to run node: {node_start_error}"
    );
    std::process::exit(if node_start_error.kind() == ErrorKind::NotFound {
        EXIT_CODE_WHEN_NODE_IS_NOT_FOUND
    } else {
        EXIT_CODE_WHEN_NODE_CANNOT_BE_EXECUTED
    })
}

#[cfg(unix)]
fn replace_current_process_or_wait(mut node_command: Command) -> std::io::Error {
    use std::os::unix::process::CommandExt;
    node_command.exec()
}

#[cfg(not(unix))]
fn replace_current_process_or_wait(mut node_command: Command) -> std::io::Error {
    match node_command.status() {
        Ok(node_exit_status) => std::process::exit(node_exit_status.code().unwrap_or(1)),
        Err(node_spawn_error) => node_spawn_error,
    }
}
