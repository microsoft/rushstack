use super::copy_files::{preflight_copy_files, run_copy_files_task, CopyFilesTaskPlan};
use super::copy_operation::{plan_copy_operations, CopyOperation};
use super::delete_files::run_delete_operations;
use super::deletion_permissions::selections_are_deletable_without_permission_errors;
use super::file_selection::{AbsoluteFileSelection, FileSelectionSpecifier};
use super::node_file_system_error::NodeFileSystemError;
use super::set_environment_variables::{order_like_javascript_object_entries, run_set_environment_variables};
use crate::terminal::ScopedLoggerOutput;

pub enum BuiltinTaskOptions {
    CopyFiles(Vec<CopyOperation>),
    DeleteFiles(Vec<FileSelectionSpecifier>),
    SetEnvironmentVariables(Vec<(String, String)>),
}

pub enum PlannedBuiltinTask {
    CopyFiles(CopyFilesTaskPlan),
    DeleteFiles(Vec<AbsoluteFileSelection>),
    SetEnvironmentVariables(Vec<(String, String)>),
}

pub fn plan_builtin_task(
    options: &BuiltinTaskOptions,
    build_folder_path: &str,
    task_temp_folder_path: &str,
) -> Option<PlannedBuiltinTask> {
    match options {
        BuiltinTaskOptions::CopyFiles(copy_operations) => {
            let (operations, configuration_hash) = plan_copy_operations(build_folder_path, copy_operations)?;
            Some(PlannedBuiltinTask::CopyFiles(CopyFilesTaskPlan {
                operations,
                configuration_hash,
                build_info_path: format!("{task_temp_folder_path}/file-copy.json"),
                preflight: None,
            }))
        }
        BuiltinTaskOptions::DeleteFiles(delete_operations) => delete_operations
            .iter()
            .map(|operation| operation.to_absolute_selection(build_folder_path))
            .collect::<Option<Vec<_>>>()
            .map(PlannedBuiltinTask::DeleteFiles),
        BuiltinTaskOptions::SetEnvironmentVariables(variables) => Some(PlannedBuiltinTask::SetEnvironmentVariables(
            order_like_javascript_object_entries(variables.clone()),
        )),
    }
}

pub fn plan_phase_clean(
    clean_files: &[FileSelectionSpecifier],
    build_folder_path: &str,
    temp_folder_path: &str,
    phase_name: &str,
) -> Option<Vec<AbsoluteFileSelection>> {
    let temp_folder_selection = FileSelectionSpecifier {
        source_path: Some(temp_folder_path.to_owned()),
        include_globs: Some(vec![phase_name.to_owned(), format!("{phase_name}.*")]),
        ..FileSelectionSpecifier::default()
    };
    clean_files
        .iter()
        .chain(std::iter::once(&temp_folder_selection))
        .map(|specifier| specifier.to_absolute_selection(build_folder_path))
        .collect()
}

pub fn builtin_task_touches_files(planned_task: &PlannedBuiltinTask) -> bool {
    !matches!(planned_task, PlannedBuiltinTask::SetEnvironmentVariables(_))
}

pub fn builtin_task_passes_preflight(
    planned_task: &mut PlannedBuiltinTask,
    temp_folder_path: &str,
    keep_preflight_results: bool,
) -> bool {
    match planned_task {
        PlannedBuiltinTask::CopyFiles(plan) => {
            let temp_folder_prefix = format!("{temp_folder_path}/");
            let destinations_are_outside_temp = plan.operations.iter().all(|operation| {
                operation
                    .destination_folder_paths
                    .iter()
                    .all(|folder| folder != temp_folder_path && !folder.starts_with(&temp_folder_prefix))
            });
            let Some(preflight) = preflight_copy_files(plan).filter(|_| destinations_are_outside_temp) else {
                return false;
            };
            if keep_preflight_results {
                plan.preflight = Some(preflight);
            }
            true
        }
        PlannedBuiltinTask::DeleteFiles(selections) => selections_are_deletable_without_permission_errors(selections),
        PlannedBuiltinTask::SetEnvironmentVariables(_) => true,
    }
}

pub fn run_planned_builtin_task(
    planned_task: PlannedBuiltinTask,
    output: &ScopedLoggerOutput<'_>,
) -> Result<(), NodeFileSystemError> {
    match planned_task {
        PlannedBuiltinTask::CopyFiles(plan) => run_copy_files_task(plan, output),
        PlannedBuiltinTask::DeleteFiles(selections) => run_delete_operations(&selections, output),
        PlannedBuiltinTask::SetEnvironmentVariables(variables) => {
            run_set_environment_variables(&variables, output);
            Ok(())
        }
    }
}
