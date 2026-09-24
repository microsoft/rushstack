use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::fs::File;
use std::io::Read;

use super::base64::sha256_digest_as_base64;
use super::build_info::{try_read_build_info, write_build_info, BuildInfoReadResult};
use super::copy_operation::AbsoluteCopyOperation;
use super::delete_files::glob_changed_during_run;
use super::file_operations::{copy_file_overwriting, hard_link_overwriting};
use super::node_file_system_error::NodeFileSystemError;
use super::posix_path::{base_name, relative_path};
use super::sha256::Sha256;
use super::simple_glob::GlobbedEntry;
use crate::terminal::ScopedLoggerOutput;

pub struct CopyFilesTaskPlan {
    pub operations: Vec<AbsoluteCopyOperation>,
    pub configuration_hash: String,
    pub build_info_path: String,
    pub preflight: Option<CopyFilesPreflight>,
}

pub struct CopyFilesPreflight {
    pub source_files: Vec<Vec<GlobbedEntry>>,
    pub build_info: BuildInfoReadResult,
}

struct CopyDescriptor {
    operation_index: usize,
    source_index: usize,
    destination_path: String,
}

pub fn preflight_copy_files(plan: &CopyFilesTaskPlan) -> Option<CopyFilesPreflight> {
    let source_files = plan.operations.iter().map(|operation| operation.selection.select(false)).collect::<Option<Vec<_>>>()?;
    let build_info = try_read_build_info(&plan.build_info_path);
    (!matches!(build_info, BuildInfoReadResult::NeedsJavaScript)).then_some(CopyFilesPreflight { source_files, build_info })
}

pub fn run_copy_files_task(plan: CopyFilesTaskPlan, output: &ScopedLoggerOutput<'_>) -> Result<(), NodeFileSystemError> {
    let CopyFilesPreflight { source_files, build_info } = match plan.preflight {
        Some(preflight) => preflight,
        None => preflight_copy_files(&plan).ok_or_else(glob_changed_during_run)?,
    };
    let copy_descriptors = collect_copy_descriptors(&plan.operations, &source_files)?;
    if copy_descriptors.is_empty() {
        return Ok(());
    }
    let source_path_of = |descriptor: &CopyDescriptor| source_files[descriptor.operation_index][descriptor.source_index].absolute_path.as_str();
    let old_entries: Vec<(String, String)> = match build_info {
        BuildInfoReadResult::Found(old) if old.configuration_hash == plan.configuration_hash => old.input_file_versions,
        _ => Vec::new(),
    };
    let old_versions: HashMap<&str, &str> = old_entries.iter().map(|(path, version)| (path.as_str(), version.as_str())).collect();
    let mut new_versions: HashMap<&str, [u8; 44]> = HashMap::with_capacity(copy_descriptors.len());
    let mut added_input_files: Vec<&str> = Vec::new();
    for descriptor in &copy_descriptors {
        let source_path = source_path_of(descriptor);
        if let Entry::Vacant(vacant) = new_versions.entry(source_path) {
            vacant.insert(hash_file_contents(source_path)?);
            if !old_versions.contains_key(source_path) {
                added_input_files.push(source_path);
            }
        }
    }
    let version_text = |path: &str| new_versions.get(path).and_then(|version| std::str::from_utf8(version).ok());
    let mut copied_file_count = 0;
    let mut linked_file_count = 0;
    let mut last_existing_folder: Option<String> = None;
    for descriptor in &copy_descriptors {
        let source_path = source_path_of(descriptor);
        if old_versions.get(source_path).copied() == version_text(source_path) {
            continue;
        }
        if plan.operations[descriptor.operation_index].hardlink {
            linked_file_count += 1;
            hard_link_overwriting(source_path, &descriptor.destination_path)?;
        } else {
            copied_file_count += 1;
            copy_file_overwriting(source_path, &descriptor.destination_path, &mut last_existing_folder)?;
        }
    }
    if copied_file_count == 0 && linked_file_count == 0 {
        output.write_line("All requested file copy operations are up to date. Nothing to do.");
        return Ok(());
    }
    output.write_line(&format!(
        "Copied {copied_file_count} file{} and linked {linked_file_count} file{}",
        if copied_file_count == 1 { "" } else { "s" },
        if linked_file_count == 1 { "" } else { "s" }
    ));
    if output.output_is_closed() {
        return Ok(());
    }
    let input_file_versions = old_entries
        .iter()
        .map(move |(path, version)| (path.as_str(), version_text(path).unwrap_or(version.as_str())))
        .chain(added_input_files.iter().map(move |path| (*path, version_text(path).unwrap_or_default())));
    write_build_info(&plan.configuration_hash, input_file_versions, &plan.build_info_path)
}

fn path_relative_to_source_folder<'path>(source_folder_path: &str, file_path: &'path str) -> std::borrow::Cow<'path, str> {
    let prefix_length = if source_folder_path.ends_with('/') { source_folder_path.len() } else { source_folder_path.len() + 1 };
    match file_path.get(prefix_length..) {
        Some(relative) if file_path.starts_with(source_folder_path) && file_path.as_bytes()[prefix_length - 1] == b'/' => {
            std::borrow::Cow::Borrowed(relative)
        }
        _ => std::borrow::Cow::Owned(relative_path(source_folder_path, file_path)),
    }
}

fn collect_copy_descriptors(
    operations: &[AbsoluteCopyOperation],
    source_files: &[Vec<GlobbedEntry>],
) -> Result<Vec<CopyDescriptor>, NodeFileSystemError> {
    let mut candidates: Vec<CopyDescriptor> = Vec::new();
    for (operation_index, operation) in operations.iter().enumerate() {
        for destination_folder_path in &operation.destination_folder_paths {
            for (source_index, source_file) in source_files[operation_index].iter().enumerate() {
                let destination_relative_path = if operation.flatten {
                    std::borrow::Cow::Borrowed(base_name(&source_file.absolute_path))
                } else {
                    path_relative_to_source_folder(&operation.selection.source_folder_path, &source_file.absolute_path)
                };
                let mut destination_path = String::with_capacity(destination_folder_path.len() + destination_relative_path.len() + 1);
                destination_path.push_str(destination_folder_path);
                if !destination_folder_path.ends_with('/') {
                    destination_path.push('/');
                }
                destination_path.push_str(&destination_relative_path);
                candidates.push(CopyDescriptor { operation_index, source_index, destination_path });
            }
        }
    }
    let mut keep = vec![true; candidates.len()];
    let mut first_index_by_destination: HashMap<&str, usize> = HashMap::with_capacity(candidates.len());
    for (index, candidate) in candidates.iter().enumerate() {
        match first_index_by_destination.entry(candidate.destination_path.as_str()) {
            Entry::Occupied(occupied) => {
                let existing = &candidates[*occupied.get()];
                let same_source = source_files[existing.operation_index][existing.source_index].absolute_path
                    == source_files[candidate.operation_index][candidate.source_index].absolute_path;
                if !same_source || operations[existing.operation_index].hardlink != operations[candidate.operation_index].hardlink {
                    return Err(NodeFileSystemError::from_message(&format!(
                        "Cannot copy multiple files to the same destination \"{}\".",
                        candidate.destination_path
                    )));
                }
                keep[index] = false;
            }
            Entry::Vacant(vacant) => {
                vacant.insert(index);
            }
        }
    }
    drop(first_index_by_destination);
    let mut keep_flags = keep.into_iter();
    candidates.retain(|_| keep_flags.next().unwrap_or(false));
    Ok(candidates)
}

fn hash_file_contents(file_path: &str) -> Result<[u8; 44], NodeFileSystemError> {
    let mut file = File::open(file_path).map_err(|error| NodeFileSystemError::new(error, "open", file_path, None))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 16384];
    loop {
        let read_length = file.read(&mut buffer).map_err(|error| NodeFileSystemError::new(error, "read", file_path, None))?;
        if read_length == 0 {
            break;
        }
        hasher.update(&buffer[..read_length]);
    }
    Ok(sha256_digest_as_base64(&hasher.finalize()))
}
