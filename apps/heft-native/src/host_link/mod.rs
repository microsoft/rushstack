mod plan_file;
mod plan_writer;
#[cfg(unix)]
mod warm_client;
#[cfg(unix)]
mod warm_frames;
#[cfg(unix)]
mod warm_run_payload;
#[cfg(unix)]
mod warm_socket;

#[cfg(all(test, target_os = "linux"))]
mod tests_plan_file;
#[cfg(all(test, unix))]
mod tests_warm_protocol;

use std::ffi::OsString;

use crate::process::{
    exec_javascript_heft, exec_node_script, exit_because_node_could_not_be_started,
};
use crate::version::{write_version_selector_banner, NativeHeftContext};

pub use plan_writer::NodeHostPlanWriter;

pub const NODE_HOST_ENTRY_PATH_INSIDE_HEFT_PACKAGE: &str = "lib-commonjs/host/HostEntry.js";
pub const HEFT_BIN_PATH_INSIDE_HEFT_PACKAGE: &str = "bin/heft";
const PLAN_FILE_DESCRIPTOR_ARGUMENT_PREFIX: &str = "--heft-plan-fd=";

pub struct NodeHostPlan {
    pub plan_json: String,
}

pub fn run_in_node_host(
    native_heft_context: &NativeHeftContext,
    node_host_plan: &NodeHostPlan,
    command_line_arguments: &[OsString],
) -> ! {
    #[cfg(unix)]
    if warm_client::warm_node_host_was_requested() {
        if let Some(exit_code) =
            warm_client::try_run_in_warm_node_host(native_heft_context, node_host_plan)
        {
            let _ = std::io::Write::flush(&mut std::io::stdout());
            std::process::exit(exit_code);
        }
    }
    exec_cold_node_host(native_heft_context, node_host_plan, command_line_arguments)
}

pub fn exec_cold_node_host(
    native_heft_context: &NativeHeftContext,
    node_host_plan: &NodeHostPlan,
    command_line_arguments: &[OsString],
) -> ! {
    let Some(heft_package_folder) = &native_heft_context.companion_heft_package_folder else {
        exec_javascript_heft(command_line_arguments)
    };
    let node_host_entry = heft_package_folder.join(NODE_HOST_ENTRY_PATH_INSIDE_HEFT_PACKAGE);
    if !node_host_entry.is_file() {
        exec_javascript_heft(command_line_arguments)
    }
    let Some(plan_file) =
        plan_file::write_plan_to_inheritable_anonymous_file(&node_host_plan.plan_json)
    else {
        exec_javascript_heft(command_line_arguments)
    };
    write_version_selector_banner(native_heft_context.version_selector_banner);
    let plan_file_argument = OsString::from(format!(
        "{PLAN_FILE_DESCRIPTOR_ARGUMENT_PREFIX}{}",
        plan_file.file_descriptor
    ));
    let node_host_start_error = exec_node_script(&node_host_entry, &[plan_file_argument]);
    exit_because_node_could_not_be_started(&node_host_start_error)
}
