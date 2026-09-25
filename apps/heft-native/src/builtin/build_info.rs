use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufWriter, ErrorKind, Write};

use super::build_info_json::{is_array_index_key, parse_build_info_json};
use super::javascript_json::append_json_string;
use super::node_file_system_error::{is_node_not_exist_error, NodeFileSystemError};
use super::posix_path::{directory_name, relative_path, resolve_path};

pub struct IncrementalBuildInfo {
    pub configuration_hash: String,
    pub input_file_versions: Vec<(String, String)>,
}

pub enum BuildInfoReadResult {
    Missing,
    Found(IncrementalBuildInfo),
    NeedsJavaScript,
}

pub fn try_read_build_info(build_info_path: &str) -> BuildInfoReadResult {
    let bytes = match fs::read(build_info_path) {
        Ok(bytes) => bytes,
        Err(error) if is_node_not_exist_error(&error) => return BuildInfoReadResult::Missing,
        Err(_) => return BuildInfoReadResult::NeedsJavaScript,
    };
    let Some(parsed) = std::str::from_utf8(&bytes).ok().and_then(parse_build_info_json) else {
        return BuildInfoReadResult::NeedsJavaScript;
    };
    drop(bytes);
    let base_folder_path = directory_name(build_info_path);
    let mut input_file_versions: Vec<(String, String)> = parsed
        .input_file_versions
        .into_iter()
        .map(|(relative_file_path, version)| (resolve_path(base_folder_path, &relative_file_path), version))
        .collect();
    let mut duplicates: Vec<(usize, usize)> = Vec::new();
    {
        let mut first_index_by_path: HashMap<&str, usize> = HashMap::with_capacity(input_file_versions.len());
        for (index, (absolute_file_path, _)) in input_file_versions.iter().enumerate() {
            if let Some(&first_index) = first_index_by_path.get(absolute_file_path.as_str()) {
                duplicates.push((first_index, index));
            } else {
                first_index_by_path.insert(absolute_file_path, index);
            }
        }
    }
    if !duplicates.is_empty() {
        for &(first_index, duplicate_index) in &duplicates {
            input_file_versions[first_index].1 = std::mem::take(&mut input_file_versions[duplicate_index].1);
        }
        let mut is_duplicate = vec![false; input_file_versions.len()];
        for &(_, duplicate_index) in &duplicates {
            is_duplicate[duplicate_index] = true;
        }
        let mut flags = is_duplicate.into_iter();
        input_file_versions.retain(|_| !flags.next().unwrap_or(false));
    }
    BuildInfoReadResult::Found(IncrementalBuildInfo {
        configuration_hash: parsed.configuration_hash,
        input_file_versions,
    })
}

pub fn write_build_info<'entries>(
    configuration_hash: &str,
    input_file_versions: impl Iterator<Item = (&'entries str, &'entries str)> + Clone,
    build_info_path: &str,
) -> Result<(), NodeFileSystemError> {
    let base_folder_path = directory_name(build_info_path);
    let relative_entries = input_file_versions.map(|(absolute_file_path, version)| (relative_path(base_folder_path, absolute_file_path), version));
    let mut array_index_entries: Vec<(String, &str)> =
        relative_entries.clone().filter(|(key, _)| is_array_index_key(key)).collect();
    array_index_entries.sort_by_key(|(key, _)| key.parse::<u64>().unwrap_or(0));
    let named_entries = relative_entries.filter(|(key, _)| !is_array_index_key(key));
    let file = create_file_ensuring_folder_exists(build_info_path)?;
    let mut writer = BufWriter::with_capacity(16384, file);
    let mut chunk = String::with_capacity(256);
    chunk.push_str("{\"configHash\":");
    append_json_string(configuration_hash, &mut chunk);
    chunk.push_str(",\"inputFileVersions\":{");
    for (index, (key, version)) in array_index_entries.into_iter().chain(named_entries).enumerate() {
        if index > 0 {
            chunk.push(',');
        }
        append_json_string(&key, &mut chunk);
        chunk.push(':');
        append_json_string(version, &mut chunk);
        write_chunk(&mut writer, &mut chunk, build_info_path)?;
    }
    chunk.push_str("}}");
    write_chunk(&mut writer, &mut chunk, build_info_path)?;
    writer
        .flush()
        .map_err(|error| NodeFileSystemError::new(error, "write", build_info_path, None))
}

fn write_chunk(writer: &mut BufWriter<File>, chunk: &mut String, file_path: &str) -> Result<(), NodeFileSystemError> {
    writer
        .write_all(chunk.as_bytes())
        .map_err(|error| NodeFileSystemError::new(error, "write", file_path, None))?;
    chunk.clear();
    Ok(())
}

fn create_file_ensuring_folder_exists(file_path: &str) -> Result<File, NodeFileSystemError> {
    match File::create(file_path) {
        Ok(file) => Ok(file),
        Err(error) if error.kind() == ErrorKind::NotFound => {
            fs::create_dir_all(directory_name(file_path))
                .map_err(|error| NodeFileSystemError::new(error, "mkdir", directory_name(file_path), None))?;
            File::create(file_path).map_err(|error| NodeFileSystemError::new(error, "open", file_path, None))
        }
        Err(error) => Err(NodeFileSystemError::new(error, "open", file_path, None)),
    }
}
