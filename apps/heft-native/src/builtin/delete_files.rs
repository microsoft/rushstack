use std::collections::HashSet;

use super::file_operations::{delete_file_if_it_exists, delete_folder_recursively};
use super::file_selection::AbsoluteFileSelection;
use super::node_file_system_error::NodeFileSystemError;
use crate::terminal::ScopedLoggerOutput;

pub fn run_delete_operations(
    selections: &[AbsoluteFileSelection],
    output: &ScopedLoggerOutput<'_>,
) -> Result<(), NodeFileSystemError> {
    let mut files_to_delete: Vec<String> = Vec::new();
    let mut folders_to_delete: Vec<String> = Vec::new();
    let mut seen_files: HashSet<String> = HashSet::new();
    let mut seen_folders: HashSet<String> = HashSet::new();
    for selection in selections {
        let entries = selection.select(true).ok_or_else(glob_changed_during_run)?;
        for entry in entries {
            let (paths, seen) = if entry.is_directory {
                (&mut folders_to_delete, &mut seen_folders)
            } else {
                (&mut files_to_delete, &mut seen_files)
            };
            if seen.insert(entry.absolute_path.clone()) {
                paths.push(entry.absolute_path);
            }
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
        if delete_folder_recursively(folder_path)? {
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
