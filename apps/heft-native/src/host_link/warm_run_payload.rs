use std::path::Path;

use crate::json::write_json_string_for_javascript;

use super::NodeHostPlan;

const WARM_HOST_PROTOCOL_VERSION: u32 = 1;
const TYPICAL_ENVIRONMENT_JSON_CAPACITY: usize = 16 * 1024;
const PROCESS_STATUS_UMASK_FIELD: &str = "Umask:";

pub fn write_run_payload(node_host_plan: &NodeHostPlan, node_executable: &Path) -> Option<String> {
    let current_folder = std::env::current_dir().ok()?;
    let mut run_payload =
        String::with_capacity(node_host_plan.plan_json.len() + TYPICAL_ENVIRONMENT_JSON_CAPACITY);
    run_payload.push_str("{\"protocolVersion\":");
    run_payload.push_str(&WARM_HOST_PROTOCOL_VERSION.to_string());
    run_payload.push_str(",\"plan\":");
    run_payload.push_str(&node_host_plan.plan_json);
    run_payload.push_str(",\"env\":{");
    for (variable_index, (variable_name, variable_value)) in std::env::vars_os().enumerate() {
        if variable_index > 0 {
            run_payload.push(',');
        }
        write_json_string_for_javascript(variable_name.to_str()?, &mut run_payload).ok()?;
        run_payload.push(':');
        write_json_string_for_javascript(variable_value.to_str()?, &mut run_payload).ok()?;
    }
    run_payload.push_str("},\"cwd\":");
    write_json_string_for_javascript(current_folder.to_str()?, &mut run_payload).ok()?;
    run_payload.push_str(",\"nodeExecPath\":");
    write_json_string_for_javascript(node_executable.to_str()?, &mut run_payload).ok()?;
    if let Some(umask) = file_mode_creation_mask_of_this_process() {
        run_payload.push_str(",\"umask\":");
        write_json_string_for_javascript(&umask, &mut run_payload).ok()?;
    }
    run_payload.push_str(",\"stdoutIsTTY\":false,\"stderrIsTTY\":false}");
    Some(run_payload)
}

fn file_mode_creation_mask_of_this_process() -> Option<String> {
    let process_status = std::fs::read_to_string("/proc/self/status").ok()?;
    process_status
        .lines()
        .find_map(|status_line| status_line.strip_prefix(PROCESS_STATUS_UMASK_FIELD))
        .map(|umask_text| umask_text.trim().to_owned())
}
