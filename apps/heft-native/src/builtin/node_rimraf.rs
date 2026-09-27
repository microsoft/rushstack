use std::fs;
use std::io::{self, ErrorKind};
use std::path::{Path, PathBuf};

use super::parallel_items::{attempt_every_item_in_order, WorkerTransfer, SEQUENTIAL_ONLY};
use super::worker_transfer::{append_text, take_array, take_text};

const EPERM: i32 = 1;
const EEXIST: i32 = 17;
const ENOTDIR: i32 = 20;
const EISDIR: i32 = 21;
const ENOTEMPTY: i32 = 39;
const REMOVED_CHILDREN_PER_WORKER: usize = 16;

pub struct RimrafFailure {
    pub error: io::Error,
    pub syscall: &'static str,
    pub path: String,
}

#[derive(Clone, Copy)]
pub enum RimrafEntryKind {
    Folder,
    Missing,
    Other,
}

pub fn rimraf_entry_kind(is_directory: io::Result<bool>) -> RimrafEntryKind {
    match is_directory {
        Ok(true) => RimrafEntryKind::Folder,
        Err(error) if error.kind() == ErrorKind::NotFound => RimrafEntryKind::Missing,
        _ => RimrafEntryKind::Other,
    }
}

const RIMRAF_SYSCALL_NAMES: [&str; 3] = ["unlink", "rmdir", "scandir"];

impl WorkerTransfer for RimrafFailure {
    fn append_to(&self, bytes: &mut Vec<u8>) {
        bytes.extend_from_slice(&self.error.raw_os_error().unwrap_or_default().to_le_bytes());
        let syscall_index = RIMRAF_SYSCALL_NAMES.iter().position(|name| *name == self.syscall).unwrap_or(usize::MAX);
        bytes.extend_from_slice(&(syscall_index as u64).to_le_bytes());
        append_text(&self.path, bytes);
    }

    fn take_from(bytes: &mut &[u8]) -> Option<RimrafFailure> {
        let error = io::Error::from_raw_os_error(i32::from_le_bytes(take_array(bytes)?));
        let syscall = RIMRAF_SYSCALL_NAMES.get(usize::try_from(u64::from_le_bytes(take_array(bytes)?)).ok()?)?;
        Some(RimrafFailure { error, syscall, path: take_text(bytes)? })
    }
}

fn failure(error: io::Error, syscall: &'static str, path: &Path) -> RimrafFailure {
    RimrafFailure { error, syscall, path: path.to_string_lossy().into_owned() }
}

pub fn remove_entry_like_node_rimraf(path: &Path, entry_kind: RimrafEntryKind, may_use_workers: bool) -> Result<(), RimrafFailure> {
    match entry_kind {
        RimrafEntryKind::Folder => return remove_folder_like_node_rimraf(path, None, may_use_workers),
        RimrafEntryKind::Missing => return Ok(()),
        RimrafEntryKind::Other => {}
    }
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) if matches!(error.raw_os_error(), Some(EISDIR | EPERM)) => {
            remove_folder_like_node_rimraf(path, Some(failure(error, "unlink", path)), may_use_workers)
        }
        Err(error) => Err(failure(error, "unlink", path)),
    }
}

fn remove_folder_like_node_rimraf(
    path: &Path,
    original_failure: Option<RimrafFailure>,
    may_use_workers: bool,
) -> Result<(), RimrafFailure> {
    match fs::remove_dir(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) if matches!(error.raw_os_error(), Some(ENOTEMPTY | EEXIST | EPERM)) => {
            remove_children_then_folder(path, may_use_workers)
        }
        Err(error) if error.raw_os_error() == Some(ENOTDIR) => match original_failure {
            Some(original_failure) => Err(original_failure),
            None => Err(failure(error, "rmdir", path)),
        },
        Err(error) => Err(failure(error, "rmdir", path)),
    }
}

fn remove_children_then_folder(path: &Path, may_use_workers: bool) -> Result<(), RimrafFailure> {
    let reader = fs::read_dir(path).map_err(|error| failure(error, "scandir", path))?;
    let mut children: Vec<(PathBuf, RimrafEntryKind)> = Vec::new();
    for child in reader {
        let child = child.map_err(|error| failure(error, "scandir", path))?;
        children.push((child.path(), rimraf_entry_kind(child.file_type().map(|file_type| file_type.is_dir()))));
    }
    children.sort_unstable_by(|left, right| left.0.cmp(&right.0));
    let children_per_worker = if may_use_workers { REMOVED_CHILDREN_PER_WORKER } else { SEQUENTIAL_ONLY };
    let children_may_use_workers = may_use_workers && children.len() < 2 * REMOVED_CHILDREN_PER_WORKER;
    let first_failure = attempt_every_item_in_order(&children, children_per_worker, &|(child_path, child_kind)| {
        remove_entry_like_node_rimraf(child_path, *child_kind, children_may_use_workers)
    });
    if let Some(first_failure) = first_failure {
        return Err(first_failure);
    }
    match fs::remove_dir(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(failure(error, "rmdir", path)),
    }
}
