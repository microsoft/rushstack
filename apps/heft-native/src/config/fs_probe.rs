use std::collections::HashMap;
use std::fs;
use std::io;

use super::fallback::{fallback, ConfigResult};
use super::real_path_resolver::RealPathResolver;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum EntryKind {
    File,
    Directory,
    Other,
}

fn is_missing_entry_error(error: &io::Error) -> bool {
    matches!(
        error.kind(),
        io::ErrorKind::NotFound | io::ErrorKind::NotADirectory
    ) || matches!(error.raw_os_error(), Some(2) | Some(20))
}

pub fn stat_entry_kind(path: &str) -> ConfigResult<Option<EntryKind>> {
    match fs::metadata(path) {
        Ok(metadata) => {
            let file_type: fs::FileType = metadata.file_type();
            if file_type.is_dir() {
                Ok(Some(EntryKind::Directory))
            } else if file_type.is_file() || is_fifo(&file_type) {
                Ok(Some(EntryKind::File))
            } else {
                Ok(Some(EntryKind::Other))
            }
        }
        Err(error) if is_missing_entry_error(&error) => Ok(None),
        Err(_) => fallback("stat failed with an unexpected error"),
    }
}

#[cfg(unix)]
fn is_fifo(file_type: &fs::FileType) -> bool {
    use std::os::unix::fs::FileTypeExt;
    file_type.is_fifo()
}

#[cfg(not(unix))]
fn is_fifo(_file_type: &fs::FileType) -> bool {
    false
}

pub fn is_file_like_resolve(path: &str) -> ConfigResult<bool> {
    Ok(stat_entry_kind(path)? == Some(EntryKind::File))
}

pub fn is_directory_like_resolve(path: &str) -> ConfigResult<bool> {
    Ok(stat_entry_kind(path)? == Some(EntryKind::Directory))
}

pub fn exists_like_exists_sync(path: &str) -> bool {
    fs::metadata(path).is_ok()
}

pub fn read_text_or_missing(path: &str) -> ConfigResult<Option<String>> {
    match fs::read(path) {
        Ok(bytes) => match String::from_utf8(bytes) {
            Ok(text) => Ok(Some(text)),
            Err(_) => fallback("a file is not valid UTF-8"),
        },
        Err(error) if is_missing_entry_error(&error) => Ok(None),
        Err(_) => fallback("reading a file failed with an unexpected error"),
    }
}

#[derive(Default)]
pub struct FileSystemProbeCache {
    real_paths: HashMap<String, Option<String>>,
    entry_kinds: HashMap<String, Option<EntryKind>>,
    resolver: RealPathResolver,
}

impl FileSystemProbeCache {
    pub fn real_path_or_missing(&mut self, path: &str) -> ConfigResult<Option<String>> {
        if let Some(cached) = self.real_paths.get(path) {
            return Ok(cached.clone());
        }
        let real_path: Option<String> = self.resolver.resolve_real_path(path)?;
        self.real_paths.insert(path.to_string(), real_path.clone());
        Ok(real_path)
    }

    pub fn real_path(&mut self, path: &str) -> ConfigResult<String> {
        match self.real_path_or_missing(path)? {
            Some(real_path) => Ok(real_path),
            None => fallback("realpath of a missing path"),
        }
    }

    fn entry_kind(&mut self, path: &str) -> ConfigResult<Option<EntryKind>> {
        if let Some(cached) = self.entry_kinds.get(path) {
            return Ok(*cached);
        }
        let entry_kind: Option<EntryKind> = stat_entry_kind(path)?;
        self.entry_kinds.insert(path.to_string(), entry_kind);
        Ok(entry_kind)
    }

    pub fn is_file_like_resolve(&mut self, path: &str) -> ConfigResult<bool> {
        Ok(self.entry_kind(path)? == Some(EntryKind::File))
    }

    pub fn is_directory_like_resolve(&mut self, path: &str) -> ConfigResult<bool> {
        Ok(self.entry_kind(path)? == Some(EntryKind::Directory))
    }
}
