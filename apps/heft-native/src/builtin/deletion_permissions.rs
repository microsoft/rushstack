use super::file_selection::AbsoluteFileSelection;

#[cfg(unix)]
pub fn selections_are_deletable_without_permission_errors(selections: &[AbsoluteFileSelection]) -> bool {
    use std::fs;
    use std::os::unix::fs::MetadataExt;

    use super::posix_path::directory_name;

    let user_id = crate::sys::effective_user_id();
    let folder_is_modifiable = |path: &str| {
        user_id == 0
            || fs::symlink_metadata(path).is_ok_and(|metadata| {
                metadata.is_dir() && metadata.uid() == user_id && metadata.mode() & 0o1300 == 0o300
            })
    };
    for selection in selections {
        let Some(entries) = selection.select(true) else {
            return false;
        };
        for entry in entries {
            if !folder_is_modifiable(directory_name(&entry.absolute_path)) {
                return false;
            }
            if !entry.is_directory {
                continue;
            }
            let mut folders_to_check = vec![entry.absolute_path];
            while let Some(folder) = folders_to_check.pop() {
                if !folder_is_modifiable(&folder) {
                    return false;
                }
                let Ok(reader) = fs::read_dir(&folder) else {
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
            }
        }
    }
    true
}

#[cfg(not(unix))]
pub fn selections_are_deletable_without_permission_errors(_selections: &[AbsoluteFileSelection]) -> bool {
    false
}
