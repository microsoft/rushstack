use super::build_info::{try_read_build_info, BuildInfoReadResult};
use super::copy_files::{run_copy_files_task, CopyFilesPreflight, CopyFilesTaskPlan};
use super::copy_operation::{plan_copy_operations, CopyOperation};
use super::delete_files::{run_deletion_plan, DeletionPlan};
use super::deletion_permissions::preflight_deletions;
use super::file_selection::{AbsoluteFileSelection, FileSelectionSpecifier};
use super::modified_paths::ModifiedPaths;
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
    DeleteFiles(DeletionPlan),
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
            .map(|selections| PlannedBuiltinTask::DeleteFiles(DeletionPlan { selections, preflight_entries: None })),
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

pub fn plan_phase_clean_deletion(selections: Vec<AbsoluteFileSelection>, modified_paths: &mut ModifiedPaths) -> Option<DeletionPlan> {
    let entries_per_selection = preflight_deletions(&selections)?;
    let entries_are_current = selections.iter().all(|selection| modified_paths.selection_is_unchanged(selection));
    let plan = DeletionPlan { selections, preflight_entries: entries_are_current.then_some(entries_per_selection) };
    modified_paths.add_deletion_plan(&plan);
    Some(plan)
}

pub fn builtin_task_does_file_system_work(planned_task: &PlannedBuiltinTask) -> bool {
    match planned_task {
        PlannedBuiltinTask::CopyFiles(_) => true,
        PlannedBuiltinTask::DeleteFiles(plan) => plan.does_file_system_work(),
        PlannedBuiltinTask::SetEnvironmentVariables(_) => false,
    }
}

pub fn builtin_task_passes_preflight(
    planned_task: &mut PlannedBuiltinTask,
    temp_folder_path: &str,
    modified_paths: &mut ModifiedPaths,
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
            if !destinations_are_outside_temp || !preflight_copy_task(plan, modified_paths) {
                return false;
            }
            for operation in &plan.operations {
                operation.destination_folder_paths.iter().for_each(|folder| modified_paths.add_modified_path(folder));
            }
            modified_paths.add_modified_path(&plan.build_info_path);
            true
        }
        PlannedBuiltinTask::DeleteFiles(plan) => {
            let Some(entries_per_selection) = preflight_deletions(&plan.selections) else {
                return false;
            };
            if plan.selections.iter().all(|selection| modified_paths.selection_is_unchanged(selection)) {
                plan.preflight_entries = Some(entries_per_selection);
            }
            modified_paths.add_deletion_plan(plan);
            true
        }
        PlannedBuiltinTask::SetEnvironmentVariables(_) => true,
    }
}

fn preflight_copy_task(plan: &mut CopyFilesTaskPlan, modified_paths: &ModifiedPaths) -> bool {
    let Some(source_files) = plan.operations.iter().map(|operation| operation.selection.select(false)).collect::<Option<Vec<_>>>() else {
        return false;
    };
    let build_info = if modified_paths.deletes(&plan.build_info_path) {
        None
    } else {
        match try_read_build_info(&plan.build_info_path) {
            BuildInfoReadResult::NeedsJavaScript => return false,
            build_info => (!modified_paths.overlaps(&plan.build_info_path)).then_some(build_info),
        }
    };
    if plan.operations.iter().all(|operation| modified_paths.selection_is_unchanged(&operation.selection)) {
        plan.preflight = Some(CopyFilesPreflight { source_files, build_info });
    }
    true
}

pub fn run_planned_builtin_task(
    planned_task: PlannedBuiltinTask,
    output: &ScopedLoggerOutput<'_>,
) -> Result<(), NodeFileSystemError> {
    match planned_task {
        PlannedBuiltinTask::CopyFiles(plan) => run_copy_files_task(plan, output),
        PlannedBuiltinTask::DeleteFiles(plan) => run_deletion_plan(plan, output),
        PlannedBuiltinTask::SetEnvironmentVariables(variables) => {
            run_set_environment_variables(&variables, output);
            Ok(())
        }
    }
}
