use std::ffi::OsString;

use crate::json::write_json_string_for_javascript;
use crate::version::{NativeHeftContext, HEFT_VERSION_IMPLEMENTED_BY_THIS_BINARY};

use super::{NodeHostPlan, HEFT_BIN_PATH_INSIDE_HEFT_PACKAGE};

const NODE_HOST_PLAN_PROTOCOL_VERSION: u32 = 1;
const TYPICAL_NODE_HOST_PLAN_CAPACITY: usize = 32 * 1024;

pub struct NodeHostPlanWriter {
    plan_json: String,
}

impl NodeHostPlanWriter {
    pub fn start(
        command_line_arguments: &[OsString],
        native_heft_context: &NativeHeftContext,
    ) -> Option<NodeHostPlanWriter> {
        let companion_heft_bin = native_heft_context
            .companion_heft_package_folder
            .as_ref()?
            .join(HEFT_BIN_PATH_INSIDE_HEFT_PACKAGE);
        let current_folder = std::env::current_dir().ok()?;
        let mut plan_json = String::with_capacity(TYPICAL_NODE_HOST_PLAN_CAPACITY);
        plan_json.push_str("{\"kind\":\"heft-plan\",\"protocolVersion\":");
        plan_json.push_str(&NODE_HOST_PLAN_PROTOCOL_VERSION.to_string());
        plan_json.push_str(",\"heftVersion\":");
        write_json_string_for_javascript(HEFT_VERSION_IMPLEMENTED_BY_THIS_BINARY, &mut plan_json)
            .ok()?;
        plan_json.push_str(",\"argv\":[");
        for (argument_index, argument) in command_line_arguments.iter().enumerate() {
            if argument_index > 0 {
                plan_json.push(',');
            }
            write_json_string_for_javascript(argument.to_str()?, &mut plan_json).ok()?;
        }
        plan_json.push_str("],\"cwd\":");
        write_json_string_for_javascript(current_folder.to_str()?, &mut plan_json).ok()?;
        plan_json.push_str(",\"heftBinPath\":");
        write_json_string_for_javascript(companion_heft_bin.to_str()?, &mut plan_json).ok()?;
        Some(NodeHostPlanWriter { plan_json })
    }

    pub fn finish(mut self) -> NodeHostPlan {
        self.plan_json.push('}');
        NodeHostPlan {
            plan_json: self.plan_json,
        }
    }
}
