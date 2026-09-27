use std::fs::{self, File};
use std::io::{BufWriter, ErrorKind, Write};

use super::build_info_json::{is_array_index_key, parse_build_info_json, BuildInfoJson};
use super::javascript_json::append_json_string;
use super::node_file_system_error::{is_node_not_exist_error, NodeFileSystemError};
use super::path_hash::path_hash_set_with_capacity;
use super::posix_path::{
    directory_name, is_normalized_absolute_folder_path, relative_path, resolve_path, resolve_relative_path_against_normalized_folder,
};

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
    let Some(BuildInfoJson { configuration_hash, input_file_versions: relative_file_versions }) =
        std::str::from_utf8(&bytes).ok().and_then(parse_build_info_json)
    else {
        return BuildInfoReadResult::NeedsJavaScript;
    };
    let base_folder_path = directory_name(build_info_path);
    let base_folder_is_normalized = is_normalized_absolute_folder_path(base_folder_path);
    let input_file_versions: Vec<(String, String)> = relative_file_versions
        .into_iter()
        .map(|(relative_file_path, version)| {
            let absolute_file_path = base_folder_is_normalized
                .then(|| resolve_relative_path_against_normalized_folder(base_folder_path, &relative_file_path))
                .flatten()
                .unwrap_or_else(|| resolve_path(base_folder_path, &relative_file_path));
            (absolute_file_path, version)
        })
        .collect();
    drop(bytes);
    let mut seen_paths = path_hash_set_with_capacity::<&str>(input_file_versions.len());
    if !input_file_versions.iter().all(|(absolute_file_path, _)| seen_paths.insert(absolute_file_path)) {
        return BuildInfoReadResult::NeedsJavaScript;
    }
    drop(seen_paths);
    BuildInfoReadResult::Found(IncrementalBuildInfo { configuration_hash, input_file_versions })
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
    array_index_entries.sort_unstable_by_key(|(key, _)| key.parse::<u64>().unwrap_or(0));
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
