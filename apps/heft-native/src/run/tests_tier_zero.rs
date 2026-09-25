use std::fs;
use std::path::PathBuf;

use super::tier_zero_execution::execute_tier_zero_plan;
use super::tier_zero_plan::{plan_tier_zero_build, NativeBuildRequest, NativePhaseDefinition, NativeTaskDefinition};
use crate::builtin::{BuiltinTaskOptions, CopyOperation, CopyOperationField, FileSelectionSpecifier};
use crate::terminal::HeftConsole;

const EXPECTED_BUILD_INFO_WRITTEN_BY_HEFT: &str = concat!(
    "{\"configHash\":\"3k4X73dp7qIsqE9JHQnhS5p9FfuPWCYqtDUUgPOuA0w=\",\"inputFileVersions\":{",
    "\"../../../src/assets/asset-1.txt\":\"YugSLTOiQ6bFB9QpUFAMbncAUYN9ON2l3qYqwGllgBA=\",",
    "\"../../../src/assets/asset-2.txt\":\"cZKdgt8PJENLFts7Tnu5h5dFXfycpLZhBUTEkgTAwFQ=\",",
    "\"../../../src/assets/asset-3.txt\":\"QGq7YmiHiJWYf2ThKttmrjAiAMVRZBSzNqB7u3KmHpI=\",",
    "\"../../../src/assets/asset-4.txt\":\"ATcVvJraFzIqG2ZqUiQi6OVbM0VUPnvKYeb/YRykH2A=\",",
    "\"../../../src/assets/asset-5.txt\":\"5DJsWWyqMWDacO0jLvWOGXEtZQeLcJyihUEG2920rjQ=\",",
    "\"../../../src/assets/data.json\":\"MiIsKqCR7Ps4OlPdpBh2XdRWhTIHPEclpVUVVA6w81g=\"}}"
);

pub fn strings(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}

pub fn create_native_fixture(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!("heft-native-{name}-{}", std::process::id()));
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join("src/assets")).unwrap();
    for index in 1..6 {
        fs::write(root.join(format!("src/assets/asset-{index}.txt")), format!("native fixture asset {index}\n")).unwrap();
    }
    fs::write(root.join("src/assets/data.json"), "{\"fixture\":\"native\"}").unwrap();
    fs::write(root.join("package.json"), "{\"name\":\"native\",\"version\":\"1.0.0\"}").unwrap();
    root
}

pub fn native_fixture_request(root: &str, clean: bool) -> NativeBuildRequest {
    let copy_assets = CopyOperation {
        selection: FileSelectionSpecifier {
            source_path: Some("src/assets".into()),
            file_extensions: Some(strings(&[".txt", ".json"])),
            ..Default::default()
        },
        destination_folders: strings(&["lib/assets"]),
        flatten: None,
        hardlink: None,
        field_order: vec![CopyOperationField::SourcePath, CopyOperationField::DestinationFolders, CopyOperationField::FileExtensions],
    };
    let delete_scratch = FileSelectionSpecifier {
        source_path: Some("temp/scratch".into()),
        include_globs: Some(strings(&["**/*"])),
        ..Default::default()
    };
    let tasks = vec![
        NativeTaskDefinition {
            task_name: "set-env".into(),
            dependency_task_indices: vec![],
            options: BuiltinTaskOptions::SetEnvironmentVariables(vec![("BENCH_NATIVE".into(), "1".into())]),
        },
        NativeTaskDefinition {
            task_name: "copy-assets".into(),
            dependency_task_indices: vec![0],
            options: BuiltinTaskOptions::CopyFiles(vec![copy_assets]),
        },
        NativeTaskDefinition {
            task_name: "delete-scratch".into(),
            dependency_task_indices: vec![1],
            options: BuiltinTaskOptions::DeleteFiles(vec![delete_scratch]),
        },
    ];
    NativeBuildRequest {
        build_folder_path: root.to_owned(),
        phases: vec![NativePhaseDefinition {
            phase_name: "build".into(),
            dependency_phase_indices: vec![],
            clean_files: vec![FileSelectionSpecifier { include_globs: Some(strings(&["lib"])), ..Default::default() }],
            tasks,
        }],
        selected_phase_indices: vec![0],
        clean,
        alias_expansion_message: None,
    }
}

pub fn normalize_durations(text: &str) -> String {
    let mut normalized = String::with_capacity(text.len());
    let mut remaining = text;
    while let Some(open) = remaining.find('(') {
        normalized.push_str(&remaining[..=open]);
        remaining = &remaining[open + 1..];
        let number_length = remaining.bytes().take_while(|byte| byte.is_ascii_digit() || *byte == b'.').count();
        if number_length > 0 && remaining[number_length..].starts_with("s)") {
            normalized.push_str("<duration>");
            remaining = &remaining[number_length..];
        }
    }
    normalized.push_str(remaining);
    normalized
}

pub fn run_and_capture(request: &NativeBuildRequest, supports_color: bool) -> (i32, String, String) {
    let plan = plan_tier_zero_build(request).expect("native fixture is Tier 0");
    let console = HeftConsole::capturing(supports_color);
    let exit_code = match execute_tier_zero_plan(plan, &console) {
        super::tier_zero_execution::TierZeroExit::Code(exit_code) => exit_code,
        super::tier_zero_execution::TierZeroExit::OutputClosed(_) => -1,
    };
    let mut standard_output = String::new();
    let mut standard_error = String::new();
    for (severity, text) in console.captured_output() {
        match severity {
            crate::terminal::OutputSeverity::Log => standard_output.push_str(&text),
            _ => standard_error.push_str(&text),
        }
    }
    (exit_code, normalize_durations(&standard_output), normalize_durations(&standard_error))
}

#[test]
fn native_fixture_builds_incrementally_and_cleans_like_heft() {
    let root = create_native_fixture("incremental");
    let root_text = root.to_str().unwrap();
    fs::create_dir_all(root.join("temp/scratch/nested")).unwrap();
    fs::write(root.join("temp/scratch/nested/file.txt"), "x").unwrap();
    let (exit_code, standard_output, standard_error) = run_and_capture(&native_fixture_request(root_text, false), false);
    assert_eq!(exit_code, 0);
    assert_eq!(standard_error, "");
    assert_eq!(
        standard_output,
        " ---- build started ---- \n[build:set-env] Setting environment variable BENCH_NATIVE=1\n[build:copy-assets] Copied 6 files and linked 0 files\n[build:delete-scratch] Deleted 1 file and 1 folder\n ---- build finished (<duration>s) ---- \n-------------------- Finished (<duration>s) --------------------\n"
    );
    assert_eq!(fs::read_to_string(root.join("lib/assets/asset-3.txt")).unwrap(), "native fixture asset 3\n");
    let build_info = fs::read_to_string(root.join("temp/build/copy-assets/file-copy.json")).unwrap();
    assert_eq!(build_info, EXPECTED_BUILD_INFO_WRITTEN_BY_HEFT);
    let (_, second_output, _) = run_and_capture(&native_fixture_request(root_text, false), true);
    assert!(second_output.contains("[build:copy-assets] All requested file copy operations are up to date. Nothing to do.\n"));
    assert!(second_output.ends_with("\x1b[1m\x1b[32m-------------------- Finished (<duration>s) --------------------\x1b[39m\x1b[22m\n"));
    let (_, clean_output, _) = run_and_capture(&native_fixture_request(root_text, true), false);
    assert!(clean_output.contains("\n[build:clean] Deleted 0 files and 2 folders\n[build:set-env]"));
    assert!(clean_output.contains("[build:copy-assets] Copied 6 files and linked 0 files\n"));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn an_independent_set_env_task_followed_by_one_file_task_runs_in_task_order() {
    let root = create_native_fixture("independent-pair");
    let mut request = native_fixture_request(root.to_str().unwrap(), false);
    request.phases[0].tasks.truncate(2);
    request.phases[0].tasks[1].dependency_task_indices.clear();
    let plan = plan_tier_zero_build(&request).expect("set-env then copy is served natively");
    let logger_names: Vec<&str> = plan
        .steps
        .iter()
        .filter_map(|planned_step| match &planned_step.step {
            super::tier_zero_plan::TierZeroStep::RunTask { logger_name, .. } => Some(logger_name.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(logger_names, vec!["build:set-env", "build:copy-assets"]);
    request.phases[0].tasks.swap(0, 1);
    assert!(plan_tier_zero_build(&request).is_none());
    let _ = fs::remove_dir_all(&root);
}
