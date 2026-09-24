use std::collections::HashSet;
use std::fs;
use std::io::ErrorKind;

use super::posix_path::resolve_path;
use super::simple_glob_pattern::{parse_simple_glob_pattern, SimpleGlobPattern};

pub struct GlobbedEntry {
    pub absolute_path: String,
    pub is_directory: bool,
}

struct FolderToRead {
    folder_path: String,
    relative_folder_path: String,
}

#[derive(Default)]
struct PatternSummary {
    literal_paths: Vec<String>,
    match_any_recursive: bool,
    match_any_top_level: bool,
    suffixes: Vec<String>,
    prefixes: Vec<String>,
}

pub fn patterns_are_simple(patterns: &[String]) -> bool {
    summarize_patterns(patterns).is_some()
}

fn summarize_patterns(patterns: &[String]) -> Option<PatternSummary> {
    if patterns.is_empty() {
        return None;
    }
    let mut summary = PatternSummary::default();
    for pattern in patterns {
        for simple_pattern in parse_simple_glob_pattern(pattern)? {
            match simple_pattern {
                SimpleGlobPattern::Literal(path) => summary.literal_paths.push(path),
                SimpleGlobPattern::AnyRecursive => summary.match_any_recursive = true,
                SimpleGlobPattern::AnyTopLevel => summary.match_any_top_level = true,
                SimpleGlobPattern::Suffix(suffix) => summary.suffixes.push(suffix),
                SimpleGlobPattern::TopLevelPrefix(prefix) => summary.prefixes.push(prefix),
            }
        }
    }
    Some(summary)
}

pub fn try_simple_glob(patterns: &[String], cwd: &str, only_files: bool) -> Option<Vec<GlobbedEntry>> {
    let summary = summarize_patterns(patterns)?;
    if cwd.is_empty() {
        return None;
    }
    let is_recursive = summary.match_any_recursive || !summary.suffixes.is_empty();
    let has_dynamic_patterns = is_recursive || summary.match_any_top_level || !summary.prefixes.is_empty();
    let mut entries: Vec<GlobbedEntry> = Vec::new();
    let mut literal_relative_paths: HashSet<&str> = HashSet::new();
    for literal_path in &summary.literal_paths {
        let absolute_path = resolve_path(cwd, literal_path);
        match fs::symlink_metadata(&absolute_path) {
            Ok(metadata) if metadata.file_type().is_symlink() => return None,
            Ok(metadata) => {
                if (!only_files || metadata.is_file()) && literal_relative_paths.insert(literal_path) {
                    entries.push(GlobbedEntry { absolute_path, is_directory: metadata.is_dir() });
                }
            }
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(_) => return None,
        }
    }
    if has_dynamic_patterns {
        let mut folders_to_read = vec![FolderToRead {
            folder_path: resolve_path(cwd, ""),
            relative_folder_path: String::new(),
        }];
        let mut is_top_level = true;
        while !folders_to_read.is_empty() {
            let mut next_folders_to_read = Vec::new();
            for folder in &folders_to_read {
                let children = match read_sorted_folder(&folder.folder_path) {
                    FolderReadResult::Entries(children) => children,
                    FolderReadResult::Missing if is_top_level => continue,
                    FolderReadResult::Missing | FolderReadResult::Unsupported => return None,
                };
                for (name, is_directory, is_file) in children {
                    let is_match = summary.match_any_recursive
                        || (is_top_level && summary.match_any_top_level)
                        || summary.suffixes.iter().any(|suffix| name.ends_with(suffix.as_str()))
                        || (is_top_level && summary.prefixes.iter().any(|prefix| name.starts_with(prefix.as_str())));
                    if is_match && (!only_files || is_file) {
                        let is_literal_duplicate = !literal_relative_paths.is_empty()
                            && literal_relative_paths.contains(join_path_segments(&folder.relative_folder_path, &name).as_str());
                        if !is_literal_duplicate {
                            entries.push(GlobbedEntry {
                                absolute_path: join_path_segments(&folder.folder_path, &name),
                                is_directory,
                            });
                        }
                    }
                    if is_recursive && is_directory {
                        next_folders_to_read.push(FolderToRead {
                            folder_path: join_path_segments(&folder.folder_path, &name),
                            relative_folder_path: join_path_segments(&folder.relative_folder_path, &name),
                        });
                    }
                }
            }
            folders_to_read = next_folders_to_read;
            is_top_level = false;
        }
    }
    Some(entries)
}

enum FolderReadResult {
    Entries(Vec<(String, bool, bool)>),
    Missing,
    Unsupported,
}

fn read_sorted_folder(folder_path: &str) -> FolderReadResult {
    let reader = match fs::read_dir(folder_path) {
        Ok(reader) => reader,
        Err(error) if error.kind() == ErrorKind::NotFound => return FolderReadResult::Missing,
        Err(_) => return FolderReadResult::Unsupported,
    };
    let mut children: Vec<(String, bool, bool)> = Vec::new();
    for child in reader {
        let Ok(child) = child else {
            return FolderReadResult::Unsupported;
        };
        let Ok(file_type) = child.file_type() else {
            return FolderReadResult::Unsupported;
        };
        if file_type.is_symlink() {
            return FolderReadResult::Unsupported;
        }
        let Ok(name) = child.file_name().into_string() else {
            return FolderReadResult::Unsupported;
        };
        if name.contains(['\\', '\n', '\r', '\u{2028}', '\u{2029}']) {
            return FolderReadResult::Unsupported;
        }
        children.push((name, file_type.is_dir(), file_type.is_file()));
    }
    children.sort_by(|left, right| left.0.as_bytes().cmp(right.0.as_bytes()));
    FolderReadResult::Entries(children)
}

fn join_path_segments(left: &str, right: &str) -> String {
    let mut joined = String::with_capacity(left.len() + right.len() + 1);
    joined.push_str(left);
    if !left.is_empty() && !left.ends_with('/') {
        joined.push('/');
    }
    joined.push_str(right);
    joined
}
