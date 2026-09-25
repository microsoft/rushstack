use std::fs;
use std::io::{self, ErrorKind};
use std::path::{Path, PathBuf};

const EPERM: i32 = 1;
const EEXIST: i32 = 17;
const ENOTDIR: i32 = 20;
const EISDIR: i32 = 21;
const ENOTEMPTY: i32 = 39;

pub struct RimrafFailure {
    pub error: io::Error,
    pub syscall: &'static str,
    pub path: String,
}

fn failure(error: io::Error, syscall: &'static str, path: &Path) -> RimrafFailure {
    RimrafFailure { error, syscall, path: path.to_string_lossy().into_owned() }
}

pub fn remove_like_node_rimraf(path: &Path) -> Result<(), RimrafFailure> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() => return remove_folder_like_node_rimraf(path, None),
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
        _ => {}
    }
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) if matches!(error.raw_os_error(), Some(EISDIR | EPERM)) => {
            remove_folder_like_node_rimraf(path, Some(failure(error, "unlink", path)))
        }
        Err(error) => Err(failure(error, "unlink", path)),
    }
}

fn remove_folder_like_node_rimraf(path: &Path, original_failure: Option<RimrafFailure>) -> Result<(), RimrafFailure> {
    match fs::remove_dir(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) if matches!(error.raw_os_error(), Some(ENOTEMPTY | EEXIST | EPERM)) => remove_children_then_folder(path),
        Err(error) if error.raw_os_error() == Some(ENOTDIR) => match original_failure {
            Some(original_failure) => Err(original_failure),
            None => Err(failure(error, "rmdir", path)),
        },
        Err(error) => Err(failure(error, "rmdir", path)),
    }
}

fn remove_children_then_folder(path: &Path) -> Result<(), RimrafFailure> {
    let reader = fs::read_dir(path).map_err(|error| failure(error, "scandir", path))?;
    let mut child_paths: Vec<PathBuf> = Vec::new();
    for child in reader {
        child_paths.push(child.map_err(|error| failure(error, "scandir", path))?.path());
    }
    child_paths.sort();
    let mut first_failure: Option<RimrafFailure> = None;
    for child_path in child_paths {
        if let Err(child_failure) = remove_like_node_rimraf(&child_path) {
            first_failure.get_or_insert(child_failure);
        }
    }
    if let Some(first_failure) = first_failure {
        return Err(first_failure);
    }
    match fs::remove_dir(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(failure(error, "rmdir", path)),
    }
}
