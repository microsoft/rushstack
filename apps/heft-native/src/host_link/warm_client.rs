use std::ffi::OsString;
use std::io::{IsTerminal, Write};
use std::os::unix::net::UnixStream;
use std::os::unix::process::CommandExt;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;

use crate::sys::{
    forward_interrupt_and_termination_signals_to_warm_host, signal_forwarded_to_warm_host,
    terminate_by_signal,
};
use crate::version::{
    find_package_json_path_governing_folder, write_version_selector_banner, NativeHeftContext,
};

use super::warm_frames::{
    exit_code_of_exit_frame, read_frame, write_frame, ACCEPT_FRAME, EXIT_FRAME, RUN_FRAME,
    STANDARD_ERROR_FRAME, STANDARD_OUTPUT_FRAME,
};
use super::warm_run_payload::write_run_payload;
use super::warm_socket::{
    count_live_warm_hosts_removing_stale_sockets, ensure_folder_exists_and_is_private_to_this_user,
    locate_node_executable_on_path, standard_input_is_the_null_device, warm_host_socket_folder,
    warm_host_socket_path,
};
use super::NodeHostPlan;

pub const WARM_HOST_OPT_IN_ENVIRONMENT_VARIABLE: &str = "HEFT_WARM_HOST";
pub const WARM_HOST_ENTRY_PATH_INSIDE_HEFT_PACKAGE: &str = "lib-commonjs/host/WarmHostEntry.js";
const WARM_HOST_SOCKET_ARGUMENT_PREFIX: &str = "--heft-warm-host-socket=";
const MAXIMUM_LIVE_WARM_HOSTS_PER_USER: usize = 4;
const WARM_HOST_ACCEPT_TIMEOUT: Duration = Duration::from_millis(2000);
const TYPICAL_OUTPUT_FRAME_CAPACITY: usize = 64 * 1024;

struct WarmHostTarget {
    heft_package_folder: PathBuf,
    node_executable: PathBuf,
    socket_path: PathBuf,
}

pub fn warm_node_host_was_requested() -> bool {
    std::env::var_os(WARM_HOST_OPT_IN_ENVIRONMENT_VARIABLE).is_some_and(|opt_in| opt_in == "1")
}

pub fn try_run_in_warm_node_host(
    native_heft_context: &NativeHeftContext,
    node_host_plan: &NodeHostPlan,
) -> Option<i32> {
    let warm_host_target = locate_warm_host_target(native_heft_context)?;
    match connect_and_wait_for_acceptance(&warm_host_target, node_host_plan) {
        Some(warm_host_socket) => Some(stream_warm_host_run(warm_host_socket, native_heft_context)),
        None => {
            start_warm_node_host_in_background(&warm_host_target);
            None
        }
    }
}

fn locate_warm_host_target(native_heft_context: &NativeHeftContext) -> Option<WarmHostTarget> {
    if std::io::stdout().is_terminal()
        || std::io::stderr().is_terminal()
        || !standard_input_is_the_null_device()
    {
        return None;
    }
    let companion_folder = native_heft_context.companion_heft_package_folder.as_ref()?;
    let heft_package_folder = std::fs::canonicalize(companion_folder).ok()?;
    let node_executable = std::fs::canonicalize(locate_node_executable_on_path()?).ok()?;
    let mut build_folder = find_package_json_path_governing_folder(&std::env::current_dir().ok()?)?;
    build_folder.pop();
    let socket_folder = warm_host_socket_folder();
    if !ensure_folder_exists_and_is_private_to_this_user(&socket_folder) {
        return None;
    }
    let identity_parts = [
        build_folder.to_str()?,
        heft_package_folder.to_str()?,
        node_executable.to_str()?,
    ];
    let socket_path = warm_host_socket_path(&socket_folder, &identity_parts);
    Some(WarmHostTarget {
        heft_package_folder,
        node_executable,
        socket_path,
    })
}

fn connect_and_wait_for_acceptance(
    warm_host_target: &WarmHostTarget,
    node_host_plan: &NodeHostPlan,
) -> Option<UnixStream> {
    let mut warm_host_socket = UnixStream::connect(&warm_host_target.socket_path).ok()?;
    warm_host_socket
        .set_read_timeout(Some(WARM_HOST_ACCEPT_TIMEOUT))
        .ok()?;
    warm_host_socket
        .set_write_timeout(Some(WARM_HOST_ACCEPT_TIMEOUT))
        .ok()?;
    let run_payload = write_run_payload(node_host_plan, &warm_host_target.node_executable)?;
    write_frame(&mut warm_host_socket, RUN_FRAME, run_payload.as_bytes()).ok()?;
    drop(run_payload);
    let mut first_frame_payload = Vec::new();
    match read_frame(&mut warm_host_socket, &mut first_frame_payload) {
        Ok(Some(ACCEPT_FRAME)) => {}
        _ => return None,
    }
    warm_host_socket.set_read_timeout(None).ok()?;
    Some(warm_host_socket)
}

fn stream_warm_host_run(
    mut warm_host_socket: UnixStream,
    native_heft_context: &NativeHeftContext,
) -> i32 {
    write_version_selector_banner(native_heft_context.version_selector_banner);
    forward_interrupt_and_termination_signals_to_warm_host(&warm_host_socket);
    let mut frame_payload = Vec::with_capacity(TYPICAL_OUTPUT_FRAME_CAPACITY);
    let mut standard_output = std::io::stdout().lock();
    let mut standard_error = std::io::stderr().lock();
    loop {
        match read_frame(&mut warm_host_socket, &mut frame_payload) {
            Ok(Some(STANDARD_OUTPUT_FRAME)) => {
                let _ = standard_output.write_all(&frame_payload);
                let _ = standard_output.flush();
            }
            Ok(Some(STANDARD_ERROR_FRAME)) => {
                let _ = standard_error.write_all(&frame_payload);
            }
            Ok(Some(EXIT_FRAME)) => return exit_code_of_exit_frame(&frame_payload).unwrap_or(1),
            Ok(Some(_)) => {}
            Ok(None) | Err(_) => {
                let _ = standard_output.flush();
                if let Some(forwarded_signal) = signal_forwarded_to_warm_host() {
                    terminate_by_signal(forwarded_signal)
                }
                return 1;
            }
        }
    }
}

fn start_warm_node_host_in_background(warm_host_target: &WarmHostTarget) {
    let warm_host_entry = warm_host_target
        .heft_package_folder
        .join(WARM_HOST_ENTRY_PATH_INSIDE_HEFT_PACKAGE);
    if !warm_host_entry.is_file() {
        return;
    }
    let Some(socket_folder) = warm_host_target.socket_path.parent() else {
        return;
    };
    if count_live_warm_hosts_removing_stale_sockets(socket_folder)
        >= MAXIMUM_LIVE_WARM_HOSTS_PER_USER
    {
        return;
    }
    let mut socket_argument = OsString::from(WARM_HOST_SOCKET_ARGUMENT_PREFIX);
    socket_argument.push(&warm_host_target.socket_path);
    let _ = Command::new(&warm_host_target.node_executable)
        .arg(warm_host_entry)
        .arg(socket_argument)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .process_group(0)
        .spawn();
}
