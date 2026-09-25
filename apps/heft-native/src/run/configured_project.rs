use super::builtin_options::{builtin_task_options_from_json, file_selection_from_json, HEFT_PACKAGE_NAME};
use super::command_options::TierZeroCommandOptions;
use super::tier_zero_plan::{NativeBuildRequest, NativePhaseDefinition, NativeTaskDefinition};
use crate::builtin::{AbsoluteFileSelection, FileSelectionSpecifier};
use crate::config::model::HeftConfigurationModel;
use crate::config::plugin_manifest::PluginKind;
use crate::json::JsonValue;

fn indices_of(names: &[&str], candidates: &[&str]) -> Option<Vec<usize>> {
    names.iter().map(|name| candidates.iter().position(|candidate| candidate == name)).collect()
}

pub fn native_clean_selections(
    model: &HeftConfigurationModel<'_>,
    selected_phase_indices: &[usize],
) -> Option<Vec<AbsoluteFileSelection>> {
    let temp_folder_path = format!("{}/temp", model.build_folder_path);
    let mut specifiers: Vec<FileSelectionSpecifier> = Vec::new();
    for &phase_index in selected_phase_indices {
        let phase = model.phases.get(phase_index)?;
        for task in &phase.tasks {
            specifiers.push(FileSelectionSpecifier {
                source_path: Some(format!("{temp_folder_path}/{}/{}", phase.name, task.name)),
                ..FileSelectionSpecifier::default()
            });
        }
        specifiers.extend(clean_file_specifiers(&phase.clean_files)?);
    }
    specifiers.iter().map(|specifier| specifier.to_absolute_selection(model.build_folder_path)).collect()
}

fn clean_file_specifiers(clean_files: &Option<JsonValue<'_>>) -> Option<Vec<FileSelectionSpecifier>> {
    match clean_files {
        Some(JsonValue::Array(items)) => items.iter().map(|item| file_selection_from_json(item.as_object()?, false)).collect(),
        Some(_) => None,
        None => Some(Vec::new()),
    }
}

pub fn native_build_request(
    model: &HeftConfigurationModel<'_>,
    heft_package_folder: &str,
    command_options: TierZeroCommandOptions,
) -> Option<NativeBuildRequest> {
    if !model.lifecycle_plugins.is_empty() {
        return None;
    }
    let phase_names: Vec<&str> = model.phases.iter().map(|phase| phase.name).collect();
    let mut native_phases = Vec::with_capacity(model.phases.len());
    for (phase_index, phase) in model.phases.iter().enumerate() {
        let dependency_phase_indices = indices_of(&phase.dependency_names, &phase_names)?;
        if !command_options.selected_phase_indices.contains(&phase_index) {
            native_phases.push(NativePhaseDefinition {
                phase_name: phase.name.to_owned(),
                dependency_phase_indices,
                clean_files: Vec::new(),
                tasks: Vec::new(),
            });
            continue;
        }
        let task_names: Vec<&str> = phase.tasks.iter().map(|task| task.name).collect();
        let mut tasks = Vec::with_capacity(phase.tasks.len());
        for task in &phase.tasks {
            let plugin = model.plugins.get(task.plugin)?;
            if !matches!(plugin.kind, PluginKind::Task)
                || plugin.package_name != HEFT_PACKAGE_NAME
                || plugin.package_root != heft_package_folder
            {
                return None;
            }
            tasks.push(NativeTaskDefinition {
                task_name: task.name.to_owned(),
                dependency_task_indices: indices_of(&task.task_dependency_names, &task_names)?,
                options: builtin_task_options_from_json(plugin.plugin_name, task.options.as_ref())?,
            });
        }
        let clean_files = clean_file_specifiers(&phase.clean_files)?;
        native_phases.push(NativePhaseDefinition {
            phase_name: phase.name.to_owned(),
            dependency_phase_indices,
            clean_files,
            tasks,
        });
    }
    Some(NativeBuildRequest {
        build_folder_path: model.build_folder_path.to_owned(),
        phases: native_phases,
        selected_phase_indices: command_options.selected_phase_indices,
        clean: command_options.clean,
        alias_expansion_message: command_options.alias_expansion_message,
    })
}
