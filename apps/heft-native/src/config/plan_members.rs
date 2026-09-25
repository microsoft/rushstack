use std::fmt::{self, Write};

use super::fallback::{fallback, ConfigResult};
use super::loader::LoadedHeftConfiguration;
use super::plan_graph_writer::write_heft_json_graph;
use crate::json::{write_json_for_javascript, write_json_string_for_javascript};

fn write_string_list(values: &[String], out: &mut String) -> fmt::Result {
    out.write_char('[')?;
    for (index, value) in values.iter().enumerate() {
        if index > 0 {
            out.write_char(',')?;
        }
        write_json_string_for_javascript(value, out)?;
    }
    out.write_char(']')
}

fn write_config_value(loaded: &LoadedHeftConfiguration, out: &mut String) -> fmt::Result {
    out.write_str("{\"buildFolderPath\":")?;
    write_json_string_for_javascript(loaded.build_folder_path, out)?;
    out.write_str(",\"heftJson\":")?;
    write_heft_json_graph(loaded.tree, loaded.heft_json, out)?;
    out.write_str(",\"debugMessages\":")?;
    write_string_list(&loaded.heft_json_chain.debug_messages, out)?;
    out.write_char('}')
}

fn write_plugins_value(loaded: &LoadedHeftConfiguration, out: &mut String) -> fmt::Result {
    out.write_char('[')?;
    let manifests = loaded.manifests.iter().zip(loaded.parsed_manifests);
    for (index, (manifest, parsed_manifest)) in manifests.enumerate() {
        out.write_str(if index == 0 {
            "{\"packageRoot\":"
        } else {
            ",{\"packageRoot\":"
        })?;
        write_json_string_for_javascript(&manifest.package_root, out)?;
        out.write_str(",\"packageName\":")?;
        write_json_string_for_javascript(&manifest.package_name, out)?;
        out.write_str(",\"manifest\":")?;
        write_json_for_javascript(parsed_manifest, out)?;
        out.write_char('}')?;
    }
    out.write_char(']')
}

fn exactly_written(written: fmt::Result) -> ConfigResult<()> {
    match written {
        Ok(()) => Ok(()),
        Err(_) => fallback("the plan configuration members can't be written exactly"),
    }
}

pub fn write_plan_config_section_value(
    loaded: &LoadedHeftConfiguration,
    out: &mut String,
) -> ConfigResult<()> {
    exactly_written(write_config_value(loaded, out))
}

pub fn write_plan_plugins_section_value(
    loaded: &LoadedHeftConfiguration,
    out: &mut String,
) -> ConfigResult<()> {
    exactly_written(write_plugins_value(loaded, out))
}

pub fn write_plan_configuration_members(
    loaded: &LoadedHeftConfiguration,
    out: &mut String,
) -> ConfigResult<()> {
    out.push_str("\"config\":");
    write_plan_config_section_value(loaded, out)?;
    out.push_str(",\"plugins\":");
    write_plan_plugins_section_value(loaded, out)?;
    out.push_str(",\"optionsValidated\":true");
    Ok(())
}
