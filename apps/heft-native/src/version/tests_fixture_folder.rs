use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

use super::selector::select_heft_implementation_for_folder;
use super::{
    HeftImplementationSelection, NativeHeftContext, VersionSelectorBanner,
    HEFT_VERSION_IMPLEMENTED_BY_THIS_BINARY,
};

static NEXT_FIXTURE_NUMBER: AtomicUsize = AtomicUsize::new(0);
pub const LOCAL_HEFT: &str = "node_modules/@rushstack/heft";
pub const LOCAL_HEFT_START: &str = "node_modules/@rushstack/heft/lib-commonjs/start.js";
pub const LOCAL_HEFT_PACKAGE_JSON: &str = "node_modules/@rushstack/heft/package.json";
pub const HEFT_DEPENDENCY: &str = r#"{"dependencies":{"@rushstack/heft":"*"}}"#;
pub const DELEGATE: HeftImplementationSelection =
    HeftImplementationSelection::DelegateToJavaScriptHeft;

pub struct FixtureFolder(pub PathBuf);

impl FixtureFolder {
    pub fn with_files(files: &[(&str, &str)]) -> FixtureFolder {
        let fixture_number = NEXT_FIXTURE_NUMBER.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "heft-native-version-{}-{fixture_number}",
            std::process::id()
        ));
        std::fs::create_dir_all(&root).unwrap();
        for (relative_path, content) in files {
            let file_path = root.join(relative_path);
            std::fs::create_dir_all(file_path.parent().unwrap()).unwrap();
            std::fs::write(&file_path, content).unwrap();
        }
        FixtureFolder(root)
    }

    pub fn select_with_companion(
        &self,
        relative_current_folder: &str,
        companion: Option<&str>,
    ) -> HeftImplementationSelection {
        let companion_folder = companion.map(|relative_companion| self.0.join(relative_companion));
        select_heft_implementation_for_folder(
            &self.0.join(relative_current_folder),
            VersionSelectorBanner::Silent,
            companion_folder,
        )
    }

    pub fn select(&self, relative_current_folder: &str) -> HeftImplementationSelection {
        let local_heft_exists = self.0.join(LOCAL_HEFT_PACKAGE_JSON).exists();
        self.select_with_companion(
            relative_current_folder,
            local_heft_exists.then_some(LOCAL_HEFT),
        )
    }

    pub fn this_binary(&self, relative_companion: &str) -> HeftImplementationSelection {
        HeftImplementationSelection::ThisBinary(NativeHeftContext {
            version_selector_banner: VersionSelectorBanner::Silent,
            companion_heft_package_folder: Some(self.0.join(relative_companion)),
        })
    }
}

impl Drop for FixtureFolder {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

pub fn heft_package_json(version: &str) -> String {
    format!("{{\"name\":\"@rushstack/heft\",\"version\":\"{version}\"}}")
}

pub fn fixture_for_project_package_json(package_json: &str) -> FixtureFolder {
    let local_heft_package_json = heft_package_json(HEFT_VERSION_IMPLEMENTED_BY_THIS_BINARY);
    FixtureFolder::with_files(&[
        ("package.json", package_json),
        (LOCAL_HEFT_START, ""),
        (LOCAL_HEFT_PACKAGE_JSON, &local_heft_package_json),
    ])
}
