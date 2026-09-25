mod builtin_options;
mod closed_output;
mod command_options;
mod configured_project;
mod node_host_plan;
mod process_environment;
mod tier_zero_execution;
mod tier_zero_plan;
#[cfg(test)]
mod tests_tier_zero;

use std::ffi::OsString;

use crate::builtin::{selections_are_deletable_without_permission_errors, AbsoluteFileSelection};
use crate::cli::outcome::{CliOutcome, ParsedCommand, PrintedOutput};
use crate::config::cli_model_builder::build_cli_model;
use crate::config::loader::{load_heft_configuration_and_then, HeftConfigurationRequest, LoadedHeftConfiguration};
use crate::config::model::{build_heft_configuration_model, HeftConfigurationModel};
use crate::config::package_json::PackageJsonLookup;
use crate::host_link::NodeHostPlan;
use crate::terminal::{console_supports_color_for_this_process, HeftConsole};
use crate::version::NativeHeftContext;

use tier_zero_execution::TierZeroExit;
use tier_zero_plan::TierZeroPlan;

pub enum HeftRunDecision {
    DelegateToJavaScriptHeft,
    RunNatively(NativeHeftRun),
    RunInNodeHost(NodeHostPlan),
}

pub enum NativeHeftRun {
    PrintCliOutput(PrintedOutput),
    BuildWithBuiltinTasks { plan: Box<TierZeroPlan>, console: NativeConsoleSettings },
    CleanProject {
        selections: Vec<AbsoluteFileSelection>,
        alias_expansion_message: Option<String>,
        console: NativeConsoleSettings,
    },
}

pub struct NativeConsoleSettings {
    supports_color: bool,
    heft_package_folder: String,
}

struct HeftInvocation<'invocation> {
    command_line_arguments: &'invocation [OsString],
    arguments: &'invocation [&'invocation str],
    native_heft_context: &'invocation NativeHeftContext,
    heft_package_folder: &'invocation str,
}

pub fn decide_how_to_run_heft(
    command_line_arguments: &[OsString],
    native_heft_context: &NativeHeftContext,
) -> HeftRunDecision {
    decide_with_project(command_line_arguments, native_heft_context).unwrap_or(HeftRunDecision::DelegateToJavaScriptHeft)
}

fn decide_with_project(command_line_arguments: &[OsString], native_heft_context: &NativeHeftContext) -> Option<HeftRunDecision> {
    if process_environment::rush_child_reporter_is_requested() {
        return None;
    }
    let arguments: Vec<&str> = crate::cli::entry::command_line_strings(command_line_arguments)?;
    let heft_package_folder = native_heft_context.companion_heft_package_folder.as_ref()?;
    let heft_package_folder = std::fs::canonicalize(heft_package_folder).ok()?.to_str()?.to_owned();
    let heft_module_folder = format!("{heft_package_folder}/lib-commonjs/utilities");
    let current_folder = std::env::current_dir().ok()?.to_str()?.to_owned();
    let mut lookup = PackageJsonLookup::default();
    let build_folder_path = lookup.try_get_package_folder_for(&current_folder).ok()??;
    lookup.load_identity_for_folder(&build_folder_path).ok()?;
    let request = HeftConfigurationRequest {
        build_folder_path: &build_folder_path,
        heft_module_folder: &heft_module_folder,
    };
    let invocation = HeftInvocation {
        command_line_arguments,
        arguments: &arguments,
        native_heft_context,
        heft_package_folder: &heft_package_folder,
    };
    load_heft_configuration_and_then(&request, &mut lookup, |loaded| decide_with_configuration(&invocation, loaded)).ok()?
}

fn decide_with_configuration(invocation: &HeftInvocation<'_>, loaded: &LoadedHeftConfiguration<'_>) -> Option<HeftRunDecision> {
    let model = build_heft_configuration_model(loaded).ok()?;
    let cli_model = build_cli_model(&model).ok()?;
    match crate::cli::entry::interpret_command_line_with_color(invocation.arguments, &cli_model, &|| supports_color_for(invocation)) {
        CliOutcome::Print(printed_output) => Some(HeftRunDecision::RunNatively(NativeHeftRun::PrintCliOutput(printed_output))),
        CliOutcome::Delegate => None,
        CliOutcome::Execute(command) => match native_build_run(invocation, &model, &command) {
            Some(native_heft_run) => Some(HeftRunDecision::RunNatively(native_heft_run)),
            None if command.watch || command.debug => None,
            None => node_host_plan::node_host_plan(
                invocation.command_line_arguments,
                invocation.native_heft_context,
                loaded,
                &command,
            )
            .map(HeftRunDecision::RunInNodeHost),
        },
    }
}

fn native_build_run(
    invocation: &HeftInvocation<'_>,
    model: &HeftConfigurationModel<'_>,
    command: &ParsedCommand<'_>,
) -> Option<NativeHeftRun> {
    if let Some(clean_options) = command_options::tier_zero_clean_options(command) {
        let selections = configured_project::native_clean_selections(model, &clean_options.selected_phase_indices)?;
        let passes_preflight = process_environment::standard_input_is_the_null_device()
            && selections_are_deletable_without_permission_errors(&selections);
        return passes_preflight.then(|| NativeHeftRun::CleanProject {
            selections,
            alias_expansion_message: clean_options.alias_expansion_message,
            console: console_settings_for(invocation),
        });
    }
    let command_options = command_options::tier_zero_command_options(command)?;
    let request = configured_project::native_build_request(model, invocation.heft_package_folder, command_options)?;
    if !process_environment::standard_input_is_the_null_device() {
        return None;
    }
    let plan = tier_zero_plan::plan_tier_zero_build(&request)?;
    Some(NativeHeftRun::BuildWithBuiltinTasks {
        plan: Box::new(plan),
        console: console_settings_for(invocation),
    })
}

fn supports_color_for(invocation: &HeftInvocation<'_>) -> bool {
    let tool_arguments: Vec<String> = invocation.arguments.iter().map(|argument| (*argument).to_owned()).collect();
    console_supports_color_for_this_process(&tool_arguments)
}

fn console_settings_for(invocation: &HeftInvocation<'_>) -> NativeConsoleSettings {
    NativeConsoleSettings {
        supports_color: supports_color_for(invocation),
        heft_package_folder: invocation.heft_package_folder.to_owned(),
    }
}

pub fn run_heft_natively(native_heft_run: NativeHeftRun) -> i32 {
    match native_heft_run {
        NativeHeftRun::PrintCliOutput(printed_output) => crate::cli::entry::write_printed_output(&printed_output),
        NativeHeftRun::BuildWithBuiltinTasks { plan, console } => exit_code_of(
            tier_zero_execution::execute_tier_zero_plan(*plan, &HeftConsole::new(console.supports_color)),
            &console,
        ),
        NativeHeftRun::CleanProject { selections, alias_expansion_message, console } => exit_code_of(
            tier_zero_execution::execute_tier_zero_clean(
                &selections,
                alias_expansion_message.as_deref(),
                &HeftConsole::new(console.supports_color),
            ),
            &console,
        ),
    }
}

fn exit_code_of(tier_zero_exit: TierZeroExit, console: &NativeConsoleSettings) -> i32 {
    match tier_zero_exit {
        TierZeroExit::Code(exit_code) => exit_code,
        TierZeroExit::OutputClosed(closed) => closed_output::exit_like_node_after_closed_output(closed, &console.heft_package_folder),
    }
}
