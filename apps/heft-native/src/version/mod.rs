mod banner;
mod companion;
mod package_json_probe;
mod selector;

#[cfg(test)]
mod tests_fixture_folder;
#[cfg(test)]
mod tests_package_json_and_arguments;
#[cfg(test)]
mod tests_selector;

use std::path::PathBuf;

pub use banner::write_version_selector_banner;
pub use companion::{
    locate_companion_javascript_heft_bin, COMPANION_JAVASCRIPT_HEFT_BIN_ENVIRONMENT_VARIABLE,
};
#[cfg(unix)]
pub use selector::find_package_json_path_governing_folder;
pub use selector::select_heft_implementation;

pub const HEFT_VERSION_IMPLEMENTED_BY_THIS_BINARY: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VersionSelectorBanner {
    Silent,
    BypassingTheSelectorBecauseUnmanagedWasSpecified,
    SearchingForLocalHeftBecauseDebugWasSpecified,
}

#[derive(Debug, PartialEq, Eq)]
pub struct NativeHeftContext {
    pub version_selector_banner: VersionSelectorBanner,
    pub companion_heft_package_folder: Option<PathBuf>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum HeftImplementationSelection {
    DelegateToJavaScriptHeft,
    ThisBinary(NativeHeftContext),
}
