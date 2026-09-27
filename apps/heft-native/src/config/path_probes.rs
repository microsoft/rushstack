use std::collections::HashMap;
use std::fs;
use std::hash::{BuildHasherDefault, Hasher};
use std::io;

use super::fallback::{fallback, ConfigResult};

pub type PathKeyedMap<Value> = HashMap<String, Value, BuildHasherDefault<PathHasher>>;

#[derive(Default)]
pub struct PathHasher(u64);

impl PathHasher {
    fn mix(&mut self, word: u64) {
        self.0 = (self.0.rotate_left(5) ^ word).wrapping_mul(0x517c_c1b7_2722_0a95);
    }
}

impl Hasher for PathHasher {
    fn write(&mut self, bytes: &[u8]) {
        let (words, rest) = bytes.as_chunks::<8>();
        for word in words {
            self.mix(u64::from_le_bytes(*word));
        }
        let mut tail: [u8; 8] = [0; 8];
        tail[..rest.len()].copy_from_slice(rest);
        self.mix(u64::from_le_bytes(tail) ^ ((rest.len() as u64) << 59));
    }

    fn write_u8(&mut self, byte: u8) {
        self.mix(u64::from(byte));
    }

    fn finish(&self) -> u64 {
        self.0
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EntryKind {
    File,
    Directory,
    Other,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ResolvedEntry {
    pub real_path: String,
    pub kind: EntryKind,
    pub size: u64,
}

#[derive(Clone)]
pub enum PathComponentState {
    Missing,
    Present { kind: EntryKind, size: u64 },
    SymbolicLink(String),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StatEntry {
    pub kind: EntryKind,
    pub size: u64,
}

pub fn is_missing_entry_error(error: &io::Error) -> bool {
    matches!(
        error.kind(),
        io::ErrorKind::NotFound | io::ErrorKind::NotADirectory
    ) || matches!(error.raw_os_error(), Some(2) | Some(20))
}

pub fn entry_kind_of(file_type: fs::FileType) -> EntryKind {
    if file_type.is_dir() {
        EntryKind::Directory
    } else if file_type.is_file() || is_fifo(&file_type) {
        EntryKind::File
    } else {
        EntryKind::Other
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

pub fn probe_path_component(path: &str) -> ConfigResult<PathComponentState> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => match fs::read_link(path) {
            Ok(target) => match target.into_os_string().into_string() {
                Ok(target) => Ok(PathComponentState::SymbolicLink(target)),
                Err(_) => fallback("a symbolic link target is not valid UTF-8"),
            },
            Err(error) if is_missing_entry_error(&error) => Ok(PathComponentState::Missing),
            Err(_) => fallback("readlink failed with an unexpected error"),
        },
        Ok(metadata) => Ok(PathComponentState::Present {
            kind: entry_kind_of(metadata.file_type()),
            size: metadata.len(),
        }),
        Err(error) if is_missing_entry_error(&error) => Ok(PathComponentState::Missing),
        Err(_) => fallback("lstat failed with an unexpected error"),
    }
}

pub fn stat_following_symbolic_links(path: &str) -> ConfigResult<Option<StatEntry>> {
    match fs::metadata(path) {
        Ok(metadata) => Ok(Some(StatEntry {
            kind: entry_kind_of(metadata.file_type()),
            size: metadata.len(),
        })),
        Err(error) if is_missing_entry_error(&error) => Ok(None),
        Err(_) => fallback("stat failed with an unexpected error"),
    }
}

pub fn next_component_range(path: &str, from: usize) -> Option<(usize, usize)> {
    let bytes: &[u8] = path.as_bytes();
    let start: usize = from + bytes[from..].iter().position(|byte| *byte != b'/')?;
    let end: usize = bytes[start..]
        .iter()
        .position(|byte| *byte == b'/')
        .map_or(bytes.len(), |length| start + length);
    Some((start, end))
}
