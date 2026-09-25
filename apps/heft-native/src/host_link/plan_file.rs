use std::fs::File;
use std::path::{Path, PathBuf};

const FOLDERS_FOR_ANONYMOUS_FILES_ENVIRONMENT_VARIABLES: [&str; 2] = ["XDG_RUNTIME_DIR", "TMPDIR"];
const FALLBACK_FOLDERS_FOR_ANONYMOUS_FILES: [&str; 2] = ["/dev/shm", "/tmp"];

pub struct InheritablePlanFile {
    pub file_descriptor: i32,
    _file: File,
}

pub fn write_plan_to_inheritable_anonymous_file(plan_json: &str) -> Option<InheritablePlanFile> {
    folders_for_anonymous_files()
        .find_map(|folder| write_plan_to_anonymous_file_in_folder(&folder, plan_json))
}

fn folders_for_anonymous_files() -> impl Iterator<Item = PathBuf> {
    FOLDERS_FOR_ANONYMOUS_FILES_ENVIRONMENT_VARIABLES
        .into_iter()
        .filter_map(std::env::var_os)
        .filter(|folder| !folder.is_empty())
        .map(PathBuf::from)
        .chain(
            FALLBACK_FOLDERS_FOR_ANONYMOUS_FILES
                .into_iter()
                .map(PathBuf::from),
        )
}

#[cfg(target_os = "linux")]
fn write_plan_to_anonymous_file_in_folder(
    folder: &Path,
    plan_json: &str,
) -> Option<InheritablePlanFile> {
    use std::io::{Seek, SeekFrom, Write};
    use std::os::unix::fs::OpenOptionsExt;
    const OPEN_UNNAMED_TEMPORARY_FILE: i32 = 0o20200000;
    let mut file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .custom_flags(OPEN_UNNAMED_TEMPORARY_FILE)
        .mode(0o600)
        .open(folder)
        .ok()?;
    file.write_all(plan_json.as_bytes()).ok()?;
    file.seek(SeekFrom::Start(0)).ok()?;
    let file_descriptor = crate::sys::let_executed_program_inherit_file(&file).ok()?;
    Some(InheritablePlanFile {
        file_descriptor,
        _file: file,
    })
}

#[cfg(not(target_os = "linux"))]
fn write_plan_to_anonymous_file_in_folder(
    _folder: &Path,
    _plan_json: &str,
) -> Option<InheritablePlanFile> {
    None
}
