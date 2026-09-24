use std::ffi::OsString;

use crate::cli::outcome::ParsedCommand;
use crate::config::loader::LoadedHeftConfiguration;
use crate::config::plan_members::write_plan_configuration_members;
use crate::host_link::{NodeHostPlan, NodeHostPlanWriter, NODE_HOST_ENTRY_PATH_INSIDE_HEFT_PACKAGE};
use crate::version::NativeHeftContext;

pub fn node_host_plan(
    command_line_arguments: &[OsString],
    native_heft_context: &NativeHeftContext,
    loaded: &LoadedHeftConfiguration<'_>,
    command: &ParsedCommand<'_>,
) -> Option<NodeHostPlan> {
    let heft_package_folder = native_heft_context.companion_heft_package_folder.as_ref()?;
    if !heft_package_folder.join(NODE_HOST_ENTRY_PATH_INSIDE_HEFT_PACKAGE).is_file() {
        return None;
    }
    let mut plan = NodeHostPlanWriter::start(command_line_arguments, native_heft_context)?.finish();
    if plan.plan_json.pop() != Some('}') {
        return None;
    }
    plan.plan_json.push(',');
    write_plan_configuration_members(loaded, &mut plan.plan_json).ok()?;
    let length_without_command = plan.plan_json.len();
    plan.plan_json.push_str(",\"command\":");
    if !command.write_plan_command(&mut plan.plan_json) {
        plan.plan_json.truncate(length_without_command);
    }
    plan.plan_json.push('}');
    Some(plan)
}
