use std::collections::HashMap;
use std::fs;
use std::io;

use super::fallback::{fallback, ConfigResult};

const MAXIMUM_FOLLOWED_SYMBOLIC_LINKS: u32 = 40;

#[derive(Clone)]
enum PathComponentKind {
    NotASymbolicLink,
    SymbolicLink(String),
}

#[derive(Default)]
pub struct RealPathResolver {
    component_kinds: HashMap<String, Option<PathComponentKind>>,
}

fn is_missing_entry_error(error: &io::Error) -> bool {
    matches!(
        error.kind(),
        io::ErrorKind::NotFound | io::ErrorKind::NotADirectory
    ) || matches!(error.raw_os_error(), Some(2) | Some(20))
}

fn classify_path_component(path: &str) -> ConfigResult<Option<PathComponentKind>> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => match fs::read_link(path) {
            Ok(target) => match target.into_os_string().into_string() {
                Ok(target) => Ok(Some(PathComponentKind::SymbolicLink(target))),
                Err(_) => fallback("a symbolic link target is not valid UTF-8"),
            },
            Err(error) if is_missing_entry_error(&error) => Ok(None),
            Err(_) => fallback("readlink failed with an unexpected error"),
        },
        Ok(_) => Ok(Some(PathComponentKind::NotASymbolicLink)),
        Err(error) if is_missing_entry_error(&error) => Ok(None),
        Err(_) => fallback("lstat failed with an unexpected error"),
    }
}

fn push_components_in_reverse(pending: &mut Vec<String>, path: &str) {
    pending.extend(
        path.split('/')
            .filter(|component| !component.is_empty())
            .rev()
            .map(str::to_string),
    );
}

impl RealPathResolver {
    fn component_kind(&mut self, path: &str) -> ConfigResult<Option<PathComponentKind>> {
        if let Some(kind) = self.component_kinds.get(path) {
            return Ok(kind.clone());
        }
        let kind: Option<PathComponentKind> = classify_path_component(path)?;
        self.component_kinds.insert(path.to_string(), kind.clone());
        Ok(kind)
    }

    pub fn resolve_real_path(&mut self, path: &str) -> ConfigResult<Option<String>> {
        if !path.starts_with('/') {
            return fallback("realpath of a relative path");
        }
        let mut pending: Vec<String> = Vec::new();
        push_components_in_reverse(&mut pending, path);
        let mut resolved: String = String::with_capacity(path.len());
        let mut followed_symbolic_links: u32 = 0;
        while let Some(component) = pending.pop() {
            if component == "." {
                continue;
            }
            if component == ".." {
                let parent_length: usize = resolved.rfind('/').unwrap_or(0);
                resolved.truncate(parent_length);
                continue;
            }
            let parent_length: usize = resolved.len();
            resolved.push('/');
            resolved.push_str(&component);
            match self.component_kind(&resolved)? {
                None => return Ok(None),
                Some(PathComponentKind::NotASymbolicLink) => {}
                Some(PathComponentKind::SymbolicLink(target)) => {
                    followed_symbolic_links += 1;
                    if followed_symbolic_links > MAXIMUM_FOLLOWED_SYMBOLIC_LINKS {
                        return fallback("too many levels of symbolic links");
                    }
                    resolved.truncate(if target.starts_with('/') {
                        0
                    } else {
                        parent_length
                    });
                    push_components_in_reverse(&mut pending, &target);
                }
            }
        }
        if resolved.is_empty() {
            resolved.push('/');
        }
        Ok(Some(resolved))
    }
}
