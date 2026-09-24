use std::path::{Path, PathBuf};

use super::selector::find_package_json_path_governing_folder;

pub const COMPANION_JAVASCRIPT_HEFT_BIN_ENVIRONMENT_VARIABLE: &str = "HEFT_NATIVE_JS_BIN";
const HEFT_BIN_PATH_INSIDE_SCOPE_FOLDER: &str = "heft/bin/heft";
const HEFT_BIN_PATH_INSIDE_PROJECT_FOLDER: &str = "node_modules/@rushstack/heft/bin/heft";

pub fn locate_companion_javascript_heft_bin(current_folder: &Path) -> Option<PathBuf> {
    if let Some(explicit_bin) = std::env::var_os(COMPANION_JAVASCRIPT_HEFT_BIN_ENVIRONMENT_VARIABLE)
    {
        if !explicit_bin.is_empty() {
            return Some(PathBuf::from(explicit_bin));
        }
    }
    std::env::current_exe()
        .ok()
        .and_then(|executable_path| locate_heft_bin_next_to_executable(&executable_path))
        .or_else(|| locate_heft_bin_of_project_governing_folder(current_folder))
}

pub fn locate_companion_javascript_heft_package_folder(current_folder: &Path) -> Option<PathBuf> {
    let mut companion_heft_bin = locate_companion_javascript_heft_bin(current_folder)?;
    (companion_heft_bin.pop() && companion_heft_bin.pop()).then_some(companion_heft_bin)
}

pub fn locate_heft_bin_next_to_executable(executable_path: &Path) -> Option<PathBuf> {
    let executable_folder = executable_path.parent()?;
    executable_folder
        .ancestors()
        .skip(2)
        .take(2)
        .map(|scope_or_apps_folder| scope_or_apps_folder.join(HEFT_BIN_PATH_INSIDE_SCOPE_FOLDER))
        .find(|candidate_bin| candidate_bin.is_file())
}

fn locate_heft_bin_of_project_governing_folder(current_folder: &Path) -> Option<PathBuf> {
    let mut project_heft_bin = find_package_json_path_governing_folder(current_folder)?;
    project_heft_bin.pop();
    project_heft_bin.push(HEFT_BIN_PATH_INSIDE_PROJECT_FOLDER);
    project_heft_bin.is_file().then_some(project_heft_bin)
}
