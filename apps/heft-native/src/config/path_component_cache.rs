use super::fallback::{fallback, ConfigResult};
use super::path_probes::{
    next_component_range, probe_path_component, stat_following_symbolic_links, EntryKind,
    PathComponentState, PathKeyedMap, ResolvedEntry, StatEntry,
};

const MAXIMUM_FOLLOWED_SYMBOLIC_LINKS: u32 = 40;

#[derive(Default)]
pub struct PathComponentCache {
    component_states: PathKeyedMap<PathComponentState>,
    resolved_entries: PathKeyedMap<Option<ResolvedEntry>>,
    stat_entries: PathKeyedMap<Option<StatEntry>>,
}

impl PathComponentCache {
    pub fn remember_physical_directory_path(&mut self, directory_path: &str) {
        if !directory_path.starts_with('/') {
            return;
        }
        let mut prefix: String = String::with_capacity(directory_path.len());
        for component in directory_path
            .split('/')
            .filter(|component| !component.is_empty())
        {
            prefix.push('/');
            prefix.push_str(component);
            if component == "." || component == ".." {
                return;
            }
            self.component_states
                .entry(prefix.clone())
                .or_insert(PathComponentState::Present {
                    kind: EntryKind::Directory,
                    size: 0,
                });
        }
    }

    fn path_component_state(&mut self, path: &str) -> ConfigResult<PathComponentState> {
        if let Some(state) = self.component_states.get(path) {
            return Ok(state.clone());
        }
        let state: PathComponentState = probe_path_component(path)?;
        self.component_states
            .insert(path.to_string(), state.clone());
        Ok(state)
    }

    fn parent_is_a_known_physical_directory(&self, path: &str) -> bool {
        let parent: &str = &path[..path.rfind('/').unwrap_or(0)];
        parent.is_empty()
            || matches!(
                self.component_states.get(parent),
                Some(PathComponentState::Present {
                    kind: EntryKind::Directory,
                    ..
                })
            )
    }

    pub fn cached_stat(&self, path: &str) -> Option<Option<StatEntry>> {
        if let Some(resolved) = self.resolved_entries.get(path) {
            return Some(resolved.as_ref().map(|entry| StatEntry {
                kind: entry.kind,
                size: entry.size,
            }));
        }
        self.stat_entries.get(path).copied()
    }

    pub fn stat(&mut self, path: &str) -> ConfigResult<Option<StatEntry>> {
        if let Some(resolved) = self.resolved_entries.get(path) {
            return Ok(resolved.as_ref().map(|entry| StatEntry {
                kind: entry.kind,
                size: entry.size,
            }));
        }
        if let Some(stat_entry) = self.stat_entries.get(path) {
            return Ok(*stat_entry);
        }
        if path.starts_with('/') && self.parent_is_a_known_physical_directory(path) {
            let resolved: Option<ResolvedEntry> = self.resolve(path)?;
            return Ok(resolved.map(|entry| StatEntry {
                kind: entry.kind,
                size: entry.size,
            }));
        }
        let stat_entry: Option<StatEntry> = stat_following_symbolic_links(path)?;
        self.stat_entries.insert(path.to_string(), stat_entry);
        Ok(stat_entry)
    }

    pub fn resolve(&mut self, path: &str) -> ConfigResult<Option<ResolvedEntry>> {
        if let Some(resolved) = self.resolved_entries.get(path) {
            return Ok(resolved.clone());
        }
        let resolved: Option<ResolvedEntry> = self.resolve_uncached(path)?;
        self.resolved_entries
            .insert(path.to_string(), resolved.clone());
        Ok(resolved)
    }

    fn resolve_uncached(&mut self, path: &str) -> ConfigResult<Option<ResolvedEntry>> {
        if !path.starts_with('/') {
            return fallback("a path to resolve is not absolute");
        }
        let mut remaining: String = path.to_string();
        let mut position: usize = 0;
        let mut resolved: String = String::with_capacity(path.len());
        let (mut kind, mut size): (EntryKind, u64) = (EntryKind::Directory, 0);
        let mut followed_symbolic_links: u32 = 0;
        while let Some((start, end)) = next_component_range(&remaining, position) {
            position = end;
            if kind != EntryKind::Directory {
                return Ok(None);
            }
            let component: &str = &remaining[start..end];
            if component == "." {
                continue;
            }
            if component == ".." {
                resolved.truncate(resolved.rfind('/').unwrap_or(0));
                continue;
            }
            let parent_length: usize = resolved.len();
            resolved.push('/');
            resolved.push_str(component);
            match self.path_component_state(&resolved)? {
                PathComponentState::Missing => return Ok(None),
                PathComponentState::Present {
                    kind: component_kind,
                    size: component_size,
                } => (kind, size) = (component_kind, component_size),
                PathComponentState::SymbolicLink(target) => {
                    followed_symbolic_links += 1;
                    if followed_symbolic_links > MAXIMUM_FOLLOWED_SYMBOLIC_LINKS {
                        return fallback("too many levels of symbolic links");
                    }
                    resolved.truncate(if target.starts_with('/') {
                        0
                    } else {
                        parent_length
                    });
                    (kind, size) = (EntryKind::Directory, 0);
                    remaining = format!("{target}/{}", &remaining[position..]);
                    position = 0;
                }
            }
        }
        if resolved.is_empty() {
            resolved.push('/');
        }
        Ok(Some(ResolvedEntry {
            real_path: resolved,
            kind,
            size,
        }))
    }
}
