use super::tests_synthetic_workspace::SyntheticWorkspace;

const BASE_HEFT_JSON: &str = r#"{
    "heftPlugins": [{ "pluginPackage": "plugin-a", "pluginName": "lifecycle-a" }],
    "aliasesByName": { "b": { "actionName": "build" } },
    "phasesByName": {
        "build": {
            "phaseDescription": "Build",
            "tasksByName": {
                "compile": { "taskPlugin": { "pluginPackage": "plugin-a", "pluginName": "task-a", "options": { "level": 1 } } }
            }
        }
    }
}"#;

fn workspace_with_project_heft_json(project_heft_json: &str) -> SyntheticWorkspace {
    let workspace: SyntheticWorkspace = SyntheticWorkspace::with_standard_layout();
    workspace.write("project/config/base-heft.json", BASE_HEFT_JSON);
    workspace.write("project/config/heft.json", project_heft_json);
    workspace
}

#[test]
fn extends_chain_with_symlinked_plugin_package_and_heft_self_reference() {
    let workspace = workspace_with_project_heft_json(
        r#"{
            // comment
            "$schema": "https://developer.microsoft.com/json-schemas/heft/v0/heft.schema.json",
            "extends": "./base-heft.json",
            "phasesByName": {
                "build": { "tasksByName": { "compile": { "taskPlugin": { "options": { "level": 2 } } } } },
                "test": {
                    "phaseDependencies": ["build"],
                    "tasksByName": { "copy": { "taskPlugin": { "pluginPackage": "@rushstack/heft" } } },
                },
            },
        }"#,
    );
    let members: String = workspace.load_plan_members().unwrap();
    let store: String = workspace.path("store/plugin-a");
    let heft: String = workspace.path("heft");
    assert!(members.starts_with(r#""config":{"buildFolderPath":"#));
    assert!(members.contains(&format!(r#"["pluginPackageRoot",{{"json":"{store}"}}]"#)));
    assert!(members.contains(&format!(r#"["pluginPackageRoot",{{"json":"{heft}"}}]"#)));
    assert!(members.contains(r#"["level",{"json":2}]"#));
    assert!(!members.contains(r#"["level",{"json":1}]"#) || members.contains(r#"{"json":1}"#));
    assert!(members.contains(&format!(
        r#"{{"packageRoot":"{store}","packageName":"plugin-a","manifest":"#
    )));
    assert!(members.contains(&format!(
        r#"{{"packageRoot":"{heft}","packageName":"@rushstack/heft","manifest":"#
    )));
    assert!(members.contains(r#""debugMessages":[]}"#));
    assert!(members.ends_with(r#","optionsValidated":true"#));
}

#[test]
fn heft_json_from_the_rig_profile() {
    let workspace = SyntheticWorkspace::with_standard_layout();
    workspace.write(
        "project/config/rig.json",
        r#"{ "rigPackageName": "my-rig" }"#,
    );
    workspace.write(
        "project/node_modules/my-rig/package.json",
        r#"{"name":"my-rig","version":"1.0.0"}"#,
    );
    workspace.write(
        "project/node_modules/my-rig/profiles/default/config/heft.json",
        BASE_HEFT_JSON,
    );
    let members: String = workspace.load_plan_members().unwrap();
    let expected_message: String = format!(
        r#""debugMessages":["Configuration file \"{}\" does not exist. Attempting to load via rig (\"{}\")."]"#,
        workspace.path("project/config/heft.json"),
        workspace.path("project/node_modules/my-rig/profiles/default")
    );
    assert!(members.contains(&expected_message), "{members}");
}

fn assert_falls_back(project_heft_json: &str) {
    let workspace = workspace_with_project_heft_json(project_heft_json);
    assert!(
        workspace.load_plan_members().is_err(),
        "{project_heft_json}"
    );
}

#[test]
fn every_error_condition_falls_back() {
    assert_falls_back(r#"{ "extends": "./heft.json" }"#);
    assert_falls_back(r#"{ "extends": "./missing.json" }"#);
    assert_falls_back(r#"{ "extends": 1 }"#);
    assert_falls_back(r#"{ "unknownProperty": true }"#);
    assert_falls_back(
        r#"{ "extends": "./base-heft.json", "heftPlugins": [{ "pluginPackage": "plugin-missing" }] }"#,
    );
    assert_falls_back(
        r#"{ "extends": "./base-heft.json", "heftPlugins": [{ "pluginPackage": "plugin-a", "pluginName": "lifecycle-a" }] }"#,
    );
    assert_falls_back(r#"{ "heftPlugins": [{ "pluginPackage": "plugin-a" }] }"#);
    assert_falls_back(
        r#"{ "heftPlugins": [{ "pluginPackage": "plugin-a", "pluginName": "task-a" }] }"#,
    );
    assert_falls_back(
        r#"{ "heftPlugins": [{ "pluginPackage": "plugin-a", "pluginName": "missing" }] }"#,
    );
    assert_falls_back(r#"{ "phasesByName": { "lifecycle": {} } }"#);
    assert_falls_back(
        r#"{ "phasesByName": { "p": { "tasksByName": { "clean": { "taskPlugin": { "pluginPackage": "@rushstack/heft" } } } } } }"#,
    );
    assert_falls_back(r#"{ "phasesByName": { "p": { "tasksByName": { "t": {} } } } }"#);
    assert_falls_back(
        r#"{ "extends": "./base-heft.json", "phasesByName": { "build": { "tasksByName": { "compile": { "taskPlugin": { "options": { "level": "x" } } } } } } }"#,
    );
    assert_falls_back(
        r#"{ "phasesByName": { "p": { "tasksByName": { "t": { "taskPlugin": { "pluginPackage": "plugin-a", "pluginName": "lifecycle-a" } } } } } }"#,
    );
    assert_falls_back("{ 'json5': true }");
}

#[test]
fn a_missing_options_schema_file_falls_back() {
    let workspace = workspace_with_project_heft_json(r#"{ "extends": "./base-heft.json" }"#);
    assert!(workspace.load_plan_members().is_ok());
    std::fs::remove_file(workspace.root.join("store/plugin-a/schema.json")).unwrap();
    assert!(workspace.load_plan_members().is_err());
}

#[test]
fn the_heft_package_is_found_from_the_real_path_of_its_module_like_dirname() {
    let workspace = workspace_with_project_heft_json(
        r#"{ "phasesByName": { "p": { "tasksByName": { "copy": { "taskPlugin": { "pluginPackage": "@rushstack/heft" } } } } } }"#,
    );
    workspace.write(
        "heft-build/package.json",
        r#"{"name":"heft-build","version":"1.0.0"}"#,
    );
    workspace.write(
        "heft-build/heft-plugin.json",
        r#"{"taskPlugins":[{"pluginName":"copy-files-plugin","entryPoint":"./lib/CopyFilesPlugin"}]}"#,
    );
    workspace.write("heft-build/lib-commonjs/utilities/CoreConfigFiles.js", "");
    std::fs::remove_dir_all(workspace.root.join("heft/lib-commonjs")).unwrap();
    std::os::unix::fs::symlink(
        "../heft-build/lib-commonjs",
        workspace.root.join("heft/lib-commonjs"),
    )
    .unwrap();
    let members: String = workspace.load_plan_members().unwrap();
    let real_heft_package: String = workspace.path("heft-build");
    assert!(
        members.contains(&format!(
            r#"["pluginPackageRoot",{{"json":"{real_heft_package}"}}]"#
        )),
        "{members}"
    );
}
