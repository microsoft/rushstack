use std::borrow::Cow;
use std::collections::hash_map::Entry;

use super::copy_operation::AbsoluteCopyOperation;
use super::node_file_system_error::NodeFileSystemError;
use super::path_hash::{path_hash_map_with_capacity, path_hash_set_with_capacity, PathHashSet};
use super::posix_path::{base_name, directory_name, path_contains, relative_path};
use super::simple_glob::GlobbedEntry;

#[derive(Clone, Copy)]
pub struct CopyDescriptor {
    pub operation_index: usize,
    pub destination_folder_index: usize,
    pub source_index: usize,
}

pub struct CopyDescriptors<'plan> {
    operations: &'plan [AbsoluteCopyOperation],
    source_files: &'plan [Vec<GlobbedEntry>],
    pub descriptors: Vec<CopyDescriptor>,
    pub sources_are_distinct_and_in_order: bool,
}

fn path_relative_to_source_folder<'path>(source_folder_path: &str, file_path: &'path str) -> Cow<'path, str> {
    let prefix_length = if source_folder_path.ends_with('/') { source_folder_path.len() } else { source_folder_path.len() + 1 };
    match file_path.get(prefix_length..) {
        Some(relative) if file_path.starts_with(source_folder_path) && file_path.as_bytes()[prefix_length - 1] == b'/' => {
            Cow::Borrowed(relative)
        }
        _ => Cow::Owned(relative_path(source_folder_path, file_path)),
    }
}

impl<'plan> CopyDescriptors<'plan> {
    pub fn source_path_of(&self, descriptor: &CopyDescriptor) -> &'plan str {
        self.source_files[descriptor.operation_index][descriptor.source_index].absolute_path.as_str()
    }

    pub fn is_hard_link(&self, descriptor: &CopyDescriptor) -> bool {
        self.operations[descriptor.operation_index].hardlink
    }

    pub fn destination_path_of(&self, descriptor: &CopyDescriptor) -> String {
        let operation = &self.operations[descriptor.operation_index];
        let destination_folder_path = &operation.destination_folder_paths[descriptor.destination_folder_index];
        let source_path = self.source_path_of(descriptor);
        let destination_relative_path = if operation.flatten {
            Cow::Borrowed(base_name(source_path))
        } else {
            path_relative_to_source_folder(&operation.selection.source_folder_path, source_path)
        };
        let mut destination_path = String::with_capacity(destination_folder_path.len() + destination_relative_path.len() + 1);
        destination_path.push_str(destination_folder_path);
        if !destination_folder_path.ends_with('/') {
            destination_path.push('/');
        }
        destination_path.push_str(&destination_relative_path);
        destination_path
    }

    pub fn copies_may_depend_on_their_order(&self, descriptors_with_work: &[&CopyDescriptor]) -> bool {
        if self.sources_are_distinct_and_in_order {
            let operation = &self.operations[0];
            let (source_folder_path, destination_folder_path) =
                (&operation.selection.source_folder_path, &operation.destination_folder_paths[0]);
            return path_contains(source_folder_path, destination_folder_path)
                || path_contains(destination_folder_path, source_folder_path);
        }
        let destination_paths: Vec<String> =
            descriptors_with_work.iter().map(|descriptor| self.destination_path_of(descriptor)).collect();
        let destination_path_set: PathHashSet<&str> = destination_paths.iter().map(String::as_str).collect();
        let mut destination_folder_paths = path_hash_set_with_capacity::<&str>(16);
        for destination_path in &destination_paths {
            let mut folder_path = directory_name(destination_path);
            while destination_folder_paths.insert(folder_path) {
                folder_path = directory_name(folder_path);
            }
        }
        descriptors_with_work.iter().zip(&destination_paths).any(|(descriptor, destination_path)| {
            destination_path_set.contains(self.source_path_of(descriptor))
                || destination_folder_paths.contains(destination_path.as_str())
        })
    }

    fn remove_duplicate_destinations(&mut self) -> Result<(), NodeFileSystemError> {
        let mut keep = vec![true; self.descriptors.len()];
        let mut first_index_by_destination = path_hash_map_with_capacity::<String, usize>(self.descriptors.len());
        for (index, candidate) in self.descriptors.iter().enumerate() {
            match first_index_by_destination.entry(self.destination_path_of(candidate)) {
                Entry::Occupied(occupied) => {
                    let existing = &self.descriptors[*occupied.get()];
                    if self.source_path_of(existing) != self.source_path_of(candidate)
                        || self.is_hard_link(existing) != self.is_hard_link(candidate)
                    {
                        return Err(NodeFileSystemError::from_message(&format!(
                            "Cannot copy multiple files to the same destination \"{}\".",
                            occupied.key()
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
        self.descriptors.retain(|_| keep_flags.next().unwrap_or(false));
        Ok(())
    }
}

pub fn collect_copy_descriptors<'plan>(
    operations: &'plan [AbsoluteCopyOperation],
    source_files: &'plan [Vec<GlobbedEntry>],
) -> Result<CopyDescriptors<'plan>, NodeFileSystemError> {
    let sources_are_distinct_and_in_order = matches!(
        operations,
        [operation] if operation.destination_folder_paths.len() == 1
            && !operation.flatten
            && operation.selection.selects_each_path_once_inside_its_folder()
    );
    let mut copy_descriptors = CopyDescriptors { operations, source_files, descriptors: Vec::new(), sources_are_distinct_and_in_order };
    for (operation_index, operation) in operations.iter().enumerate() {
        for destination_folder_index in 0..operation.destination_folder_paths.len() {
            copy_descriptors.descriptors.extend(
                (0..source_files[operation_index].len())
                    .map(|source_index| CopyDescriptor { operation_index, destination_folder_index, source_index }),
            );
        }
    }
    if !sources_are_distinct_and_in_order {
        copy_descriptors.remove_duplicate_destinations()?;
    }
    Ok(copy_descriptors)
}
