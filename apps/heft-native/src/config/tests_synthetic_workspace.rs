use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};

use super::loader::{load_heft_configuration_and_then, HeftConfigurationRequest};
use super::package_json::PackageJsonLookup;
use super::plan_members::write_plan_configuration_members;

static NEXT_WORKSPACE_NUMBER: AtomicUsize = AtomicUsize::new(0);

pub struct SyntheticWorkspace {
    pub root: PathBuf,
}

impl SyntheticWorkspace {
    pub fn with_standard_layout() -> SyntheticWorkspace {
        let number: usize = NEXT_WORKSPACE_NUMBER.fetch_add(1, Ordering::SeqCst);
        let name: String = format!("heft-native-config-tests-{}-{number}", std::process::id());
        let root: PathBuf = std::env::temp_dir().join(name);
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let workspace: SyntheticWorkspace = SyntheticWorkspace {
            root: fs::canonicalize(&root).unwrap(),
        };
        workspace.write(
            "heft/package.json",
            r#"{"name":"@rushstack/heft","version":"1.3.1"}"#,
        );
        workspace.write("heft/lib-commonjs/utilities/CoreConfigFiles.js", "");
        workspace.write(
            "heft/heft-plugin.json",
            r#"{"taskPlugins":[{"pluginName":"copy-files-plugin","entryPoint":"./lib/CopyFilesPlugin"}]}"#,
        );
        workspace.write(
            "store/plugin-a/package.json",
            r#"{"name":"plugin-a","version":"1.0.0"}"#,
        );
        workspace.write(
            "store/plugin-a/heft-plugin.json",
            r#"{
                "lifecyclePlugins": [{ "pluginName": "lifecycle-a", "entryPoint": "./lib/lifecycle" }],
                "taskPlugins": [{
                    "pluginName": "task-a", "entryPoint": "./lib/task", "optionsSchema": "./schema.json",
                    "parameters": [{ "longName": "--level", "parameterKind": "integer", "argumentName": "LEVEL", "description": "d" }]
                }],
            }"#,
        );
        workspace.write(
            "store/plugin-a/schema.json",
            r#"{"$schema":"http://json-schema.org/draft-04/schema#","type":"object","properties":{"level":{"type":"integer"}},"additionalProperties":false}"#,
        );
        workspace.write(
            "project/package.json",
            r#"{"name":"project","version":"1.0.0"}"#,
        );
        fs::create_dir_all(workspace.root.join("project/node_modules")).unwrap();
        std::os::unix::fs::symlink(
            "../../store/plugin-a",
            workspace.root.join("project/node_modules/plugin-a"),
        )
        .unwrap();
        workspace
    }

    pub fn write(&self, relative_path: &str, text: &str) {
        let path: PathBuf = self.root.join(relative_path);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, text).unwrap();
    }

    pub fn path(&self, relative_path: &str) -> String {
        self.root.join(relative_path).to_str().unwrap().to_string()
    }

    pub fn load_plan_members(&self) -> Result<String, &'static str> {
        let build_folder_path: String = self.path("project");
        let heft_module_folder: String = self.path("heft/lib-commonjs/utilities");
        let request = HeftConfigurationRequest {
            build_folder_path: &build_folder_path,
            heft_module_folder: &heft_module_folder,
        };
        let mut lookup: PackageJsonLookup = PackageJsonLookup::default();
        let loaded = load_heft_configuration_and_then(&request, &mut lookup, |loaded| {
            let mut out: String = String::new();
            write_plan_configuration_members(loaded, &mut out).map(|_| out)
        });
        match loaded {
            Ok(Ok(out)) => Ok(out),
            Ok(Err(fallback)) | Err(fallback) => Err(fallback.reason),
        }
    }
}

impl Drop for SyntheticWorkspace {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}
