use super::file_selection::AbsoluteFileSelection;
use super::simple_glob::GlobbedEntry;

#[cfg(unix)]
pub fn preflight_deletions(selections: &[AbsoluteFileSelection]) -> Option<Vec<Vec<GlobbedEntry>>> {
    use super::posix_path::directory_name;

    let mut checked_folders = CheckedFolders::new(crate::sys::effective_user_id());
    let mut entries_per_selection = Vec::with_capacity(selections.len());
    for selection in selections {
        let entries = selection.select(true)?;
        for entry in &entries {
            if !checked_folders.folder_is_modifiable(directory_name(&entry.absolute_path)) {
                return None;
            }
            if entry.is_directory && !checked_folders.every_folder_in_tree_is_modifiable(entry.absolute_path.clone()) {
                return None;
            }
        }
        entries_per_selection.push(entries);
    }
    Some(entries_per_selection)
}

#[cfg(unix)]
struct CheckedFolders {
    user_id: u32,
    modifiable_folder_paths: super::path_hash::PathHashSet<String>,
    walked_folder_paths: super::path_hash::PathHashSet<String>,
}

#[cfg(unix)]
impl CheckedFolders {
    fn new(user_id: u32) -> CheckedFolders {
        CheckedFolders { user_id, modifiable_folder_paths: Default::default(), walked_folder_paths: Default::default() }
    }

    fn folder_is_modifiable(&mut self, folder_path: &str) -> bool {
        use std::os::unix::fs::MetadataExt;
        if self.modifiable_folder_paths.contains(folder_path) {
            return true;
        }
        let is_modifiable = self.user_id == 0
            || std::fs::symlink_metadata(folder_path).is_ok_and(|metadata| {
                metadata.is_dir() && metadata.uid() == self.user_id && metadata.mode() & 0o1300 == 0o300
            });
        if is_modifiable {
            self.modifiable_folder_paths.insert(folder_path.to_owned());
        }
        is_modifiable
    }

    fn every_folder_in_tree_is_modifiable(&mut self, root_folder_path: String) -> bool {
        let mut folders_to_check = vec![root_folder_path];
        while let Some(folder) = folders_to_check.pop() {
            if self.walked_folder_paths.contains(&folder) {
                continue;
            }
            if !self.folder_is_modifiable(&folder) {
                return false;
            }
            let Ok(reader) = std::fs::read_dir(&folder) else {
                return false;
            };
            for child in reader {
                let Ok(child) = child else {
                    return false;
                };
                if child.file_type().is_ok_and(|file_type| file_type.is_dir()) {
                    let Ok(child_path) = child.path().into_os_string().into_string() else {
                        return false;
                    };
                    folders_to_check.push(child_path);
                }
            }
            self.walked_folder_paths.insert(folder);
        }
        true
    }
}

#[cfg(not(unix))]
pub fn preflight_deletions(_selections: &[AbsoluteFileSelection]) -> Option<Vec<Vec<GlobbedEntry>>> {
    None
}
