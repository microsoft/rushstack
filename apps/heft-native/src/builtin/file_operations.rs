use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use super::node_file_system_error::{is_node_not_exist_error, NodeFileSystemError};
use super::node_rimraf::{remove_entry_like_node_rimraf, RimrafEntryKind};
use super::posix_path::directory_name;

const EEXIST: i32 = 17;

pub fn copy_file_overwriting(source_path: &str, destination_path: &str) -> Result<(), NodeFileSystemError> {
    match super::open_file_copy::copy_through_open_source_file(source_path, destination_path) {
        Some(result) => result,
        None => copy_file_overwriting_step_by_step(source_path, destination_path),
    }
}

fn copy_file_overwriting_step_by_step(source_path: &str, destination_path: &str) -> Result<(), NodeFileSystemError> {
    let source_metadata =
        fs::symlink_metadata(source_path).map_err(|error| NodeFileSystemError::new(error, "lstat", source_path, None))?;
    let destination_metadata = match fs::symlink_metadata(destination_path) {
        Ok(metadata) => Some(metadata),
        Err(error) if error.kind() == ErrorKind::NotFound => None,
        Err(error) => return Err(NodeFileSystemError::new(error, "lstat", destination_path, None)),
    };
    match &destination_metadata {
        Some(destination_metadata) => {
            check_destination_can_be_replaced(source_path, &source_metadata, destination_path, destination_metadata)?;
            fs::remove_file(destination_path)
                .map_err(|error| NodeFileSystemError::new(error, "unlink", destination_path, None))?;
        }
        None => ensure_folder_exists(directory_name(destination_path))?,
    }
    fs::copy(source_path, destination_path)
        .map(|_| ())
        .map_err(|error| NodeFileSystemError::new(error, "copyfile", source_path, Some(destination_path)))
}

pub fn check_destination_can_be_replaced(
    source_path: &str,
    source_metadata: &fs::Metadata,
    destination_path: &str,
    destination_metadata: &fs::Metadata,
) -> Result<(), NodeFileSystemError> {
    if are_the_same_file(source_metadata, destination_metadata) {
        return Err(NodeFileSystemError::from_message("Source and destination must not be the same."));
    }
    if !source_metadata.is_dir() && destination_metadata.is_dir() {
        return Err(NodeFileSystemError::from_message(&format!(
            "Cannot overwrite directory '{destination_path}' with non-directory '{source_path}'."
        )));
    }
    Ok(())
}

pub fn hard_link_overwriting(link_target_path: &str, new_link_path: &str) -> Result<(), NodeFileSystemError> {
    let link = || {
        fs::hard_link(link_target_path, new_link_path)
            .map_err(|error| NodeFileSystemError::new(error, "link", link_target_path, Some(new_link_path)))
    };
    match fs::hard_link(link_target_path, new_link_path) {
        Ok(()) => Ok(()),
        Err(error) if error.raw_os_error() == Some(EEXIST) => {
            delete_file_if_it_exists(new_link_path).map_err(NodeFileSystemError::wrapped_again)?;
            link()
        }
        Err(error) if is_node_not_exist_error(&error) && Path::new(link_target_path).exists() => {
            ensure_folder_exists(directory_name(new_link_path)).map_err(NodeFileSystemError::wrapped_again)?;
            link()
        }
        Err(error) => Err(NodeFileSystemError::new(error, "link", link_target_path, Some(new_link_path))),
    }
}

pub fn delete_file_if_it_exists(file_path: &str) -> Result<bool, NodeFileSystemError> {
    match fs::remove_file(file_path) {
        Ok(()) => Ok(true),
        Err(error) if is_node_not_exist_error(&error) => Ok(false),
        Err(error) => Err(NodeFileSystemError::new(error, "unlink", file_path, None)),
    }
}

pub fn delete_folder_recursively(folder_path: &str) -> Result<bool, NodeFileSystemError> {
    let is_directory = match fs::symlink_metadata(folder_path) {
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(true),
        Err(error) if is_node_not_exist_error(&error) => return Ok(false),
        Err(error) => return Err(NodeFileSystemError::new(error, "lstat", folder_path, None)),
        Ok(metadata) => metadata.is_dir(),
    };
    remove_folder_like_file_system_extra(folder_path, if is_directory { RimrafEntryKind::Folder } else { RimrafEntryKind::Other })
}

pub fn delete_folder_found_by_preflight(folder_path: &str) -> Result<bool, NodeFileSystemError> {
    remove_folder_like_file_system_extra(folder_path, RimrafEntryKind::Folder)
}

fn remove_folder_like_file_system_extra(folder_path: &str, entry_kind: RimrafEntryKind) -> Result<bool, NodeFileSystemError> {
    match remove_entry_like_node_rimraf(Path::new(folder_path), entry_kind, true) {
        Ok(()) => Ok(true),
        Err(failure) if is_node_not_exist_error(&failure.error) => Ok(false),
        Err(failure) => Err(NodeFileSystemError::new(failure.error, failure.syscall, &failure.path, None)),
    }
}

#[cfg(unix)]
fn are_the_same_file(source_metadata: &fs::Metadata, destination_metadata: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    destination_metadata.ino() != 0
        && destination_metadata.dev() != 0
        && destination_metadata.ino() == source_metadata.ino()
        && destination_metadata.dev() == source_metadata.dev()
}

#[cfg(not(unix))]
fn are_the_same_file(_source_metadata: &fs::Metadata, _destination_metadata: &fs::Metadata) -> bool {
    false
}

pub fn ensure_folder_exists(folder_path: &str) -> Result<(), NodeFileSystemError> {
    if Path::new(folder_path).exists() {
        return Ok(());
    }
    fs::create_dir_all(folder_path).map_err(|error| NodeFileSystemError::new(error, "mkdir", folder_path, None))
}
