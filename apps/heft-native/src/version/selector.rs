use std::ffi::OsString;
use std::path::{Path, PathBuf};

use super::companion::locate_companion_javascript_heft_package_folder;
use super::package_json_probe::{
    package_json_declares_version, probe_project_package_json, ProjectPackageJsonProbe,
};
use super::{
    HeftImplementationSelection, NativeHeftContext, VersionSelectorBanner,
    HEFT_VERSION_IMPLEMENTED_BY_THIS_BINARY,
};

const UNMANAGED_PARAMETER_LONG_NAME: &[u8] = b"--unmanaged";
const DEBUG_PARAMETER_LONG_NAME: &[u8] = b"--debug";

pub fn select_heft_implementation(
    command_line_arguments: &[OsString],
) -> HeftImplementationSelection {
    let (unmanaged_was_specified, debug_was_specified) =
        find_version_selector_tool_parameters(command_line_arguments);
    let banner = if unmanaged_was_specified {
        VersionSelectorBanner::BypassingTheSelectorBecauseUnmanagedWasSpecified
    } else if debug_was_specified {
        VersionSelectorBanner::SearchingForLocalHeftBecauseDebugWasSpecified
    } else {
        VersionSelectorBanner::Silent
    };
    let Ok(current_folder) = std::env::current_dir() else {
        return HeftImplementationSelection::DelegateToJavaScriptHeft;
    };
    let companion_heft_package_folder =
        locate_companion_javascript_heft_package_folder(&current_folder);
    select_heft_implementation_for_folder(&current_folder, banner, companion_heft_package_folder)
}

pub fn select_heft_implementation_for_folder(
    current_folder: &Path,
    banner: VersionSelectorBanner,
    companion_heft_package_folder: Option<PathBuf>,
) -> HeftImplementationSelection {
    if let Some(companion_folder) = &companion_heft_package_folder {
        if !heft_package_is_the_version_of_this_binary(companion_folder) {
            return HeftImplementationSelection::DelegateToJavaScriptHeft;
        }
    }
    let native_heft_context = NativeHeftContext {
        version_selector_banner: banner,
        companion_heft_package_folder,
    };
    if banner == VersionSelectorBanner::BypassingTheSelectorBecauseUnmanagedWasSpecified {
        return HeftImplementationSelection::ThisBinary(native_heft_context);
    }
    let Some(mut package_json_path) = find_package_json_path_governing_folder(current_folder)
    else {
        return HeftImplementationSelection::ThisBinary(native_heft_context);
    };
    match probe_project_package_json(&package_json_path) {
        ProjectPackageJsonProbe::MustBeProbedByJavaScript => {
            HeftImplementationSelection::DelegateToJavaScriptHeft
        }
        ProjectPackageJsonProbe::DeclaresNoHeftDependency => {
            HeftImplementationSelection::ThisBinary(native_heft_context)
        }
        ProjectPackageJsonProbe::DeclaresHeftDependency => {
            package_json_path.pop();
            package_json_path.push("node_modules/@rushstack/heft");
            select_project_local_heft(&package_json_path, native_heft_context)
        }
    }
}

pub fn find_package_json_path_governing_folder(current_folder: &Path) -> Option<PathBuf> {
    let mut package_json_path = current_folder.join("package.json");
    loop {
        if package_json_path.exists() {
            return Some(package_json_path);
        }
        package_json_path.pop();
        if !package_json_path.pop() {
            return None;
        }
        package_json_path.push("package.json");
    }
}

pub(super) fn find_version_selector_tool_parameters(
    command_line_arguments: &[OsString],
) -> (bool, bool) {
    let mut unmanaged_was_specified = false;
    let mut debug_was_specified = false;
    for tool_parameter in command_line_arguments
        .iter()
        .map(|argument| argument.as_encoded_bytes())
        .take_while(|argument| argument.first() == Some(&b'-'))
    {
        unmanaged_was_specified |= tool_parameter == UNMANAGED_PARAMETER_LONG_NAME;
        debug_was_specified |= tool_parameter == DEBUG_PARAMETER_LONG_NAME;
    }
    (unmanaged_was_specified, debug_was_specified)
}

fn select_project_local_heft(
    local_heft_package_folder: &Path,
    native_heft_context: NativeHeftContext,
) -> HeftImplementationSelection {
    let local_heft_is_the_companion = local_heft_package_folder
        .join("lib-commonjs/start.js")
        .exists()
        && native_heft_context
            .companion_heft_package_folder
            .as_deref()
            .is_some_and(|companion_folder| {
                folders_are_the_same_real_folder(local_heft_package_folder, companion_folder)
            });
    if local_heft_is_the_companion {
        HeftImplementationSelection::ThisBinary(native_heft_context)
    } else {
        HeftImplementationSelection::DelegateToJavaScriptHeft
    }
}

#[cfg(unix)]
fn folders_are_the_same_real_folder(first_folder: &Path, second_folder: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    match (
        std::fs::metadata(first_folder),
        std::fs::metadata(second_folder),
    ) {
        (Ok(first_metadata), Ok(second_metadata)) => {
            first_metadata.dev() == second_metadata.dev()
                && first_metadata.ino() == second_metadata.ino()
        }
        _ => false,
    }
}

#[cfg(not(unix))]
fn folders_are_the_same_real_folder(first_folder: &Path, second_folder: &Path) -> bool {
    match (
        std::fs::canonicalize(first_folder),
        std::fs::canonicalize(second_folder),
    ) {
        (Ok(first_real_folder), Ok(second_real_folder)) => first_real_folder == second_real_folder,
        _ => false,
    }
}

fn heft_package_is_the_version_of_this_binary(heft_package_folder: &Path) -> bool {
    package_json_declares_version(
        &heft_package_folder.join("package.json"),
        HEFT_VERSION_IMPLEMENTED_BY_THIS_BINARY,
    )
}
