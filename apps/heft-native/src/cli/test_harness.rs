use std::fs;
use std::path::{Path, PathBuf};

use super::invocation::interpret_with_output;
use super::model::CliModel;
use super::outcome::CliOutcome;
use super::test_model::{list_field, load_model, optional_field};
use super::width::help_width_from_columns;

fn version_selector_banner(args: &[&str]) -> &'static str {
    let tool_args = || args.iter().take_while(|arg| arg.starts_with('-'));
    if tool_args().any(|arg| *arg == "--unmanaged") {
        "Bypassing the Heft version selector because \"--unmanaged\" was specified.\n\n"
    } else if tool_args().any(|arg| *arg == "--debug") {
        "Searching for a locally installed version of Heft. Use the \"--unmanaged\" flag if you want to avoid this.\n"
    } else {
        ""
    }
}

fn run_case(model: &'static CliModel<'static>, args: &'static [&'static str], env: (Option<&str>, Option<&str>), output_folder: &Path) {
    let (columns, force_color) = env;
    let color_decision = move || force_color == Some("1");
    let supports_color: Option<&dyn Fn() -> bool> = if force_color.is_none_or(|value| value == "1") { Some(&color_decision) } else { None };
    fs::create_dir_all(output_folder.parent().expect("parent")).expect("mkdir");
    let outcome: CliOutcome<'_> = interpret_with_output(args, model, help_width_from_columns(columns), supports_color);
    let result: String = match outcome {
        CliOutcome::Print(printed) => {
            fs::write(output_folder.with_extension("stdout"), format!("{}{}", version_selector_banner(args), printed.stdout)).expect("write");
            fs::write(output_folder.with_extension("stderr"), &printed.stderr).expect("write");
            format!("print {}", printed.exit_code)
        }
        CliOutcome::Execute(command) => {
            let mut plan_command: String = String::new();
            if command.write_plan_command(&mut plan_command) {
                fs::write(output_folder.with_extension("plan"), plan_command).expect("write");
            }
            format!("execute {}", command.unaliased_command_name)
        }
        CliOutcome::Delegate => "delegate".to_string(),
    };
    fs::write(output_folder.with_extension("result"), result).expect("write");
}

#[test]
fn snapshot_harness() {
    let Some(harness_folder) = std::env::var_os("HEFT_NATIVE_CLI_HARNESS_DIR").map(PathBuf::from) else {
        return;
    };
    let cases: String = fs::read_to_string(harness_folder.join("cases.txt")).expect("cases");
    let mut models: Vec<(String, &'static CliModel<'static>)> = Vec::new();
    for line in cases.lines() {
        let fields: Vec<&str> = line.split('\t').collect();
        let project: &str = fields[0];
        if !models.iter().any(|(name, _)| name == project) {
            let text: String = fs::read_to_string(harness_folder.join(format!("{project}.model"))).expect("model");
            models.push((project.to_string(), Box::leak(Box::new(load_model(&text)))));
        }
        let model: &'static CliModel<'static> = models.iter().find(|(name, _)| name == project).expect("model").1;
        let args: &'static [&'static str] = Box::leak(list_field(fields[2]).into_boxed_slice());
        let output_folder: PathBuf = harness_folder.join("out").join(project).join(fields[1]);
        run_case(model, args, (optional_field(fields[3]), fields.get(4).and_then(|field| optional_field(field))), &output_folder);
    }
}
