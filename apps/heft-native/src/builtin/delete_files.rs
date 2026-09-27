use super::file_operations::{delete_file_if_it_exists, delete_folder_found_by_preflight, delete_folder_recursively};
use super::file_selection::AbsoluteFileSelection;
use super::node_file_system_error::NodeFileSystemError;
use super::path_hash::path_hash_set_with_capacity;
use super::simple_glob::GlobbedEntry;
use crate::terminal::ScopedLoggerOutput;

pub struct DeletionPlan {
    pub selections: Vec<AbsoluteFileSelection>,
    pub preflight_entries: Option<Vec<Vec<GlobbedEntry>>>,
}

impl DeletionPlan {
    pub fn does_file_system_work(&self) -> bool {
        self.preflight_entries.as_ref().is_none_or(|entries_per_selection| entries_per_selection.iter().any(|entries| !entries.is_empty()))
    }
}

pub fn run_deletion_plan(plan: DeletionPlan, output: &ScopedLoggerOutput<'_>) -> Result<(), NodeFileSystemError> {
    let entries_were_found_by_preflight = plan.preflight_entries.is_some();
    let entries_per_selection = match plan.preflight_entries {
        Some(entries_per_selection) => entries_per_selection,
        None => plan
            .selections
            .iter()
            .map(|selection| selection.select(true))
            .collect::<Option<Vec<_>>>()
            .ok_or_else(glob_changed_during_run)?,
    };
    let mut files_to_delete: Vec<String> = Vec::new();
    let mut folders_to_delete: Vec<String> = Vec::new();
    let mut seen_files = path_hash_set_with_capacity::<String>(0);
    let mut seen_folders = path_hash_set_with_capacity::<String>(0);
    for entry in entries_per_selection.into_iter().flatten() {
        let (paths, seen) = if entry.is_directory {
            (&mut folders_to_delete, &mut seen_folders)
        } else {
            (&mut files_to_delete, &mut seen_files)
        };
        if seen.insert(entry.absolute_path.clone()) {
            paths.push(entry.absolute_path);
        }
    }
    let mut deleted_file_count = 0;
    for file_path in &files_to_delete {
        if delete_file_if_it_exists(file_path)? {
            deleted_file_count += 1;
        }
    }
    let mut deleted_folder_count = 0;
    for folder_path in folders_to_delete.iter().rev() {
        let was_deleted = if entries_were_found_by_preflight {
            delete_folder_found_by_preflight(folder_path)?
        } else {
            delete_folder_recursively(folder_path)?
        };
        if was_deleted {
            deleted_folder_count += 1;
        }
    }
    if deleted_file_count > 0 || deleted_folder_count > 0 {
        output.write_line(&format!(
            "Deleted {deleted_file_count} file{} and {deleted_folder_count} folder{}",
            if deleted_file_count != 1 { "s" } else { "" },
            if deleted_folder_count != 1 { "s" } else { "" }
        ));
    }
    Ok(())
}

pub fn glob_changed_during_run() -> NodeFileSystemError {
    NodeFileSystemError::from_message("The files selected by a glob changed while heft was running.")
}
