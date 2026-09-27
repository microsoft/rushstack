use std::collections::hash_map::Entry;
use std::fs::File;
use std::io::Read;

use super::base64::sha256_digest_as_base64;
use super::build_info::{try_read_build_info, write_build_info, BuildInfoReadResult};
use super::copy_descriptors::{collect_copy_descriptors, CopyDescriptor, CopyDescriptors};
use super::copy_operation::AbsoluteCopyOperation;
use super::delete_files::glob_changed_during_run;
use super::file_operations::{copy_file_overwriting, hard_link_overwriting};
use super::node_file_system_error::NodeFileSystemError;
use super::parallel_items::{process_items_in_order, SEQUENTIAL_ONLY};
use super::path_hash::{path_hash_map_with_capacity, PathHashMap};
use super::sha256::Sha256;
use super::simple_glob::GlobbedEntry;
use crate::terminal::ScopedLoggerOutput;

const HASHED_FILES_PER_WORKER: usize = 64;
const COPIED_FILES_PER_WORKER: usize = 64;
const NOT_PREVIOUSLY_HASHED: usize = usize::MAX;

pub struct CopyFilesTaskPlan {
    pub operations: Vec<AbsoluteCopyOperation>,
    pub configuration_hash: String,
    pub build_info_path: String,
    pub preflight: Option<CopyFilesPreflight>,
}

pub struct CopyFilesPreflight {
    pub source_files: Vec<Vec<GlobbedEntry>>,
    pub build_info: Option<BuildInfoReadResult>,
}

struct HashedSources<'plan> {
    source_paths: Vec<&'plan str>,
    versions: Vec<[u8; 44]>,
    version_index_of_descriptor: Option<Vec<usize>>,
}

impl HashedSources<'_> {
    fn version_index_of(&self, descriptor_index: usize) -> usize {
        self.version_index_of_descriptor.as_ref().map_or(descriptor_index, |indices| indices[descriptor_index])
    }

    fn version_text(&self, version_index: usize) -> &str {
        std::str::from_utf8(&self.versions[version_index]).unwrap_or_default()
    }
}

pub fn run_copy_files_task(plan: CopyFilesTaskPlan, output: &ScopedLoggerOutput<'_>) -> Result<(), NodeFileSystemError> {
    let (source_files, build_info) = match plan.preflight {
        Some(CopyFilesPreflight { source_files, build_info }) => (source_files, build_info),
        None => {
            let source_files = plan.operations.iter().map(|operation| operation.selection.select(false)).collect::<Option<Vec<_>>>();
            (source_files.ok_or_else(glob_changed_during_run)?, None)
        }
    };
    let build_info = match build_info.unwrap_or_else(|| try_read_build_info(&plan.build_info_path)) {
        BuildInfoReadResult::NeedsJavaScript => return Err(glob_changed_during_run()),
        build_info => build_info,
    };
    let copy_descriptors = collect_copy_descriptors(&plan.operations, &source_files)?;
    if copy_descriptors.descriptors.is_empty() {
        return Ok(());
    }
    let old_entries: Vec<(String, String)> = match build_info {
        BuildInfoReadResult::Found(old) if old.configuration_hash == plan.configuration_hash => old.input_file_versions,
        _ => Vec::new(),
    };
    let hashed_sources = hash_sources(&copy_descriptors)?;
    let old_entry_index_of_source: Vec<usize> = {
        let old_entry_index_by_path: PathHashMap<&str, usize> =
            old_entries.iter().enumerate().map(|(index, (path, _))| (path.as_str(), index)).collect();
        let old_entry_index_of = |path: &&str| old_entry_index_by_path.get(path).copied().unwrap_or(NOT_PREVIOUSLY_HASHED);
        hashed_sources.source_paths.iter().map(old_entry_index_of).collect()
    };
    let source_is_up_to_date = |version_index: usize| {
        let old_entry_index = old_entry_index_of_source[version_index];
        old_entry_index != NOT_PREVIOUSLY_HASHED && old_entries[old_entry_index].1 == hashed_sources.version_text(version_index)
    };
    let descriptors_with_work: Vec<&CopyDescriptor> = copy_descriptors
        .descriptors
        .iter()
        .enumerate()
        .filter(|(descriptor_index, _)| !source_is_up_to_date(hashed_sources.version_index_of(*descriptor_index)))
        .map(|(_, descriptor)| descriptor)
        .collect();
    if descriptors_with_work.is_empty() {
        output.write_line("All requested file copy operations are up to date. Nothing to do.");
        return Ok(());
    }
    let linked_file_count = descriptors_with_work.iter().filter(|descriptor| copy_descriptors.is_hard_link(descriptor)).count();
    let copied_file_count = descriptors_with_work.len() - linked_file_count;
    copy_or_link_files(&copy_descriptors, &descriptors_with_work)?;
    output.write_line(&format!(
        "Copied {copied_file_count} file{} and linked {linked_file_count} file{}",
        if copied_file_count == 1 { "" } else { "s" },
        if linked_file_count == 1 { "" } else { "s" }
    ));
    if output.output_is_closed() {
        return Ok(());
    }
    let mut new_version_index_of_old_entry = vec![NOT_PREVIOUSLY_HASHED; old_entries.len()];
    for (version_index, old_entry_index) in old_entry_index_of_source.iter().enumerate() {
        if *old_entry_index != NOT_PREVIOUSLY_HASHED {
            new_version_index_of_old_entry[*old_entry_index] = version_index;
        }
    }
    let updated_old_entries = old_entries.iter().zip(&new_version_index_of_old_entry).map(|((path, old_version), version_index)| {
        let version = if *version_index == NOT_PREVIOUSLY_HASHED { old_version } else { hashed_sources.version_text(*version_index) };
        (path.as_str(), version)
    });
    let added_entries = hashed_sources
        .source_paths
        .iter()
        .enumerate()
        .filter(|(version_index, _)| old_entry_index_of_source[*version_index] == NOT_PREVIOUSLY_HASHED)
        .map(|(version_index, path)| (*path, hashed_sources.version_text(version_index)));
    write_build_info(&plan.configuration_hash, updated_old_entries.chain(added_entries), &plan.build_info_path)
}

fn hash_sources<'plan>(copy_descriptors: &CopyDescriptors<'plan>) -> Result<HashedSources<'plan>, NodeFileSystemError> {
    let (source_paths, version_index_of_descriptor) = if copy_descriptors.sources_are_distinct_and_in_order {
        (copy_descriptors.descriptors.iter().map(|descriptor| copy_descriptors.source_path_of(descriptor)).collect(), None)
    } else {
        let mut source_paths: Vec<&str> = Vec::new();
        let mut version_index_by_source_path = path_hash_map_with_capacity::<&str, usize>(copy_descriptors.descriptors.len());
        let mut version_index_of_descriptor = Vec::with_capacity(copy_descriptors.descriptors.len());
        for descriptor in &copy_descriptors.descriptors {
            let version_index = match version_index_by_source_path.entry(copy_descriptors.source_path_of(descriptor)) {
                Entry::Occupied(occupied) => *occupied.get(),
                Entry::Vacant(vacant) => {
                    source_paths.push(vacant.key());
                    *vacant.insert(source_paths.len() - 1)
                }
            };
            version_index_of_descriptor.push(version_index);
        }
        (source_paths, Some(version_index_of_descriptor))
    };
    let mut versions = vec![[0u8; 44]; source_paths.len()];
    process_items_in_order(&source_paths, &mut versions, HASHED_FILES_PER_WORKER, &|source_path, version| {
        *version = hash_file_contents(source_path)?;
        Ok(())
    })?;
    Ok(HashedSources { source_paths, versions, version_index_of_descriptor })
}

fn copy_or_link_files(copy_descriptors: &CopyDescriptors<'_>, descriptors_with_work: &[&CopyDescriptor]) -> Result<(), NodeFileSystemError> {
    let copies_per_worker = if descriptors_with_work.len() < 2 * COPIED_FILES_PER_WORKER
        || copy_descriptors.copies_may_depend_on_their_order(descriptors_with_work)
    {
        SEQUENTIAL_ONLY
    } else {
        COPIED_FILES_PER_WORKER
    };
    let mut copy_results = vec![(); descriptors_with_work.len()];
    process_items_in_order(descriptors_with_work, &mut copy_results, copies_per_worker, &|descriptor, ()| {
        let source_path = copy_descriptors.source_path_of(descriptor);
        let destination_path = copy_descriptors.destination_path_of(descriptor);
        if copy_descriptors.is_hard_link(descriptor) {
            hard_link_overwriting(source_path, &destination_path)
        } else {
            copy_file_overwriting(source_path, &destination_path)
        }
    })
}

fn hash_file_contents(file_path: &str) -> Result<[u8; 44], NodeFileSystemError> {
    let mut file = File::open(file_path).map_err(|error| NodeFileSystemError::new(error, "open", file_path, None))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 16384];
    loop {
        let read_length = file.read(&mut buffer).map_err(|error| NodeFileSystemError::new(error, "read", file_path, None))?;
        hasher.update(&buffer[..read_length]);
        if read_length < buffer.len() {
            break;
        }
    }
    Ok(sha256_digest_as_base64(&hasher.finalize()))
}
