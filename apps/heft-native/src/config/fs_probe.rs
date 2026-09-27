use std::fs::File;
use std::io::{self, Read};

use super::fallback::{fallback, ConfigResult};
use super::path_component_cache::PathComponentCache;
use super::path_probes::is_missing_entry_error;

pub use super::path_probes::{EntryKind, ResolvedEntry, StatEntry};

const LARGEST_SIZE_HINT_TRUSTED_FOR_ONE_READ: u64 = 1 << 26;
const INITIAL_BUFFER_LENGTH_FOR_UNKNOWN_SIZES: usize = 4096;

#[derive(Default)]
pub struct FileSystemProbeCache {
    paths: PathComponentCache,
}

fn length_to_expect(size: u64) -> usize {
    if size > LARGEST_SIZE_HINT_TRUSTED_FOR_ONE_READ {
        0
    } else {
        size as usize
    }
}

fn read_all_bytes_expecting_length(file: &mut File, expected_length: usize) -> io::Result<Vec<u8>> {
    let initial_length: usize = if expected_length == 0 {
        INITIAL_BUFFER_LENGTH_FOR_UNKNOWN_SIZES
    } else {
        expected_length + 1
    };
    let mut buffer: Vec<u8> = vec![0; initial_length];
    let mut filled: usize = 0;
    loop {
        if filled == buffer.len() {
            buffer.resize(buffer.len() * 2, 0);
        }
        let read: usize = match file.read(&mut buffer[filled..]) {
            Ok(read) => read,
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(error),
        };
        filled += read;
        if read == 0 || (filled == expected_length && expected_length > 0) {
            break;
        }
    }
    buffer.truncate(filled);
    Ok(buffer)
}

impl FileSystemProbeCache {
    pub fn remember_physical_directory_path(&mut self, directory_path: &str) {
        self.paths.remember_physical_directory_path(directory_path);
    }

    pub fn resolve(&mut self, path: &str) -> ConfigResult<Option<ResolvedEntry>> {
        self.paths.resolve(path)
    }

    pub fn real_path_or_missing(&mut self, path: &str) -> ConfigResult<Option<String>> {
        Ok(self.resolve(path)?.map(|entry| entry.real_path))
    }

    pub fn real_path(&mut self, path: &str) -> ConfigResult<String> {
        match self.real_path_or_missing(path)? {
            Some(real_path) => Ok(real_path),
            None => fallback("realpath of a missing path"),
        }
    }

    fn entry_kind(&mut self, path: &str) -> ConfigResult<Option<EntryKind>> {
        Ok(self.resolve(path)?.map(|entry| entry.kind))
    }

    pub fn is_file_like_resolve(&mut self, path: &str) -> ConfigResult<bool> {
        Ok(self.entry_kind(path)? == Some(EntryKind::File))
    }

    pub fn is_directory_like_resolve(&mut self, path: &str) -> ConfigResult<bool> {
        Ok(self.entry_kind(path)? == Some(EntryKind::Directory))
    }

    pub fn exists_like_exists_sync(&mut self, path: &str) -> ConfigResult<bool> {
        Ok(self.paths.stat(path)?.is_some())
    }

    pub fn read_text_or_missing(&mut self, path: &str) -> ConfigResult<Option<String>> {
        let known_length: Option<usize> = match self.paths.cached_stat(path) {
            Some(None) => return Ok(None),
            Some(Some(entry)) if entry.kind != EntryKind::File => {
                return fallback("a configuration path is not a file")
            }
            Some(Some(entry)) => Some(length_to_expect(entry.size)),
            None => None,
        };
        let mut file: File = match File::open(path) {
            Ok(file) => file,
            Err(error) if is_missing_entry_error(&error) => return Ok(None),
            Err(_) => return fallback("opening a file failed with an unexpected error"),
        };
        let expected_length: usize = match known_length {
            Some(expected_length) => expected_length,
            None => match file.metadata() {
                Ok(metadata) if metadata.is_file() => length_to_expect(metadata.len()),
                Ok(_) => return fallback("a configuration path is not a regular file"),
                Err(_) => return fallback("fstat failed with an unexpected error"),
            },
        };
        let bytes: Vec<u8> = match read_all_bytes_expecting_length(&mut file, expected_length) {
            Ok(bytes) => bytes,
            Err(_) => return fallback("reading a file failed with an unexpected error"),
        };
        match String::from_utf8(bytes) {
            Ok(text) => Ok(Some(text)),
            Err(_) => fallback("a file is not valid UTF-8"),
        }
    }
}
