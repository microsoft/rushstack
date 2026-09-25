use std::borrow::Cow;

use super::action_invocation::{execute, help_text, print_error, print_help, ActionRequest};
use super::action_text::{alias_documentation, alias_expansion_message, run_documentation};
use super::defined_parameter::DefinedParameter;
use super::help_builders::{action_help_parser, ActionHelpText};
use super::help_model::bold;
use super::outcome::{CliOutcome, ParsedParameters, PrintedOutput};
use super::parameters::{push_builtin_parameters, push_plugin_parameters, push_scoping_parameters, ROOT_PARAMETER_NAMES};
use super::parse::{parse_arguments, ArgumentError, ParameterValue, ParseOutcome};
use super::phase_selection::{phase_names, select_phases, unknown_phase_error, PhaseSelection, NO_PHASES_SELECTED_ERROR};
use super::registration::{try_register_parameters, Registration};
use super::render::{argument_error_message, help_output, remainder_error_output, terminal_error_output};

pub fn invoke_run<'a>(request: &ActionRequest<'a, '_>, action_args: &[&'a str]) -> Option<CliOutcome<'a>> {
    let action = &request.table.actions[request.action_index];
    let mut definitions: Vec<DefinedParameter<'a>> = Vec::new();
    push_scoping_parameters(&mut definitions, &action.name);
    let registration: Registration = try_register_parameters(&definitions, &ROOT_PARAMETER_NAMES)?;
    let (values, remainder_start) = match parse_arguments(&registration, &definitions, action_args, true) {
        ParseOutcome::Help => return print_help(request, &registration, &definitions, true),
        ParseOutcome::Failed(error) => return print_error(request, &registration, &definitions, true, &error),
        ParseOutcome::Delegate => return None,
        ParseOutcome::Parsed { values, remainder_start } => (values, remainder_start),
    };
    let selected_phases: Vec<usize> = match select_phases(request, &values) {
        PhaseSelection::Selected(selected) => selected,
        PhaseSelection::Empty if request.alias.is_none() => {
            let stderr: String = NO_PHASES_SELECTED_ERROR.to_string();
            return Some(CliOutcome::Print(PrintedOutput { stdout: String::new(), stderr, exit_code: 1 }));
        }
        PhaseSelection::UnknownPhase => {
            let stderr: String = unknown_phase_error(request, &definitions, &values)?;
            return Some(CliOutcome::Print(PrintedOutput { stdout: String::new(), stderr, exit_code: 1 }));
        }
        _ => return None,
    };
    if let Some(start) = remainder_start.filter(|start| action_args[*start] != "--") {
        if request.alias.is_some() || request.tool_args.contains(&"--debug") {
            return None;
        }
        let supports_color: bool = (request.supports_color?)();
        let parser = action_help_parser(&registration, &definitions, help_text(request, None), true)?;
        let output = remainder_error_output(&parser, request.width, &action.name, action_args[start], supports_color)?;
        return Some(CliOutcome::Print(output));
    }
    let mut scoped: Vec<DefinedParameter<'a>> = Vec::new();
    push_builtin_parameters(&mut scoped, action.watch);
    push_plugin_parameters(&mut scoped, request.model, &selected_phases)?;
    let mut parent_names: Vec<Cow<'a, str>> = ROOT_PARAMETER_NAMES.to_vec();
    parent_names.extend(registration.registered_names().cloned());
    let scoped_registration: Registration = try_register_parameters(&scoped, &parent_names)?;
    let scoped_args: &[&'a str] = remainder_start.map_or(&[], |start| &action_args[start + 1..]);
    match parse_arguments(&scoped_registration, &scoped, scoped_args, false) {
        ParseOutcome::Help => {
            let (text, banner) = scoped_help_text(request, &definitions, &values);
            let parser = action_help_parser(&scoped_registration, &scoped, text, false)?;
            let mut output = help_output(&parser, request.width, 0)?;
            output.stdout.insert_str(0, &banner);
            Some(CliOutcome::Print(output))
        }
        ParseOutcome::Failed(error) if !request.tool_args.contains(&"--debug") => {
            let supports_color = request.supports_color?;
            if matches!(error, ArgumentError::Ambiguous(_)) {
                return None;
            }
            let message: String = argument_error_message(&error, &scoped_registration, &scoped)?;
            let (text, banner) = scoped_help_text(request, &definitions, &values);
            let parser = action_help_parser(&scoped_registration, &scoped, text, false)?;
            let mut output = terminal_error_output(&parser, request.width, &message, supports_color())?;
            output.stdout.insert_str(0, &banner);
            Some(CliOutcome::Print(output))
        }
        ParseOutcome::Parsed { values: scoped_values, .. } => execute(
            request,
            selected_phases,
            ParsedParameters { definitions, values },
            Some((ParsedParameters { definitions: scoped, values: scoped_values }, remainder_start.map_or(Vec::new(), |start| action_args[start..].to_vec()))),
        ),
        _ => None,
    }
}

fn scoped_help_text<'a>(request: &ActionRequest<'a, '_>, definitions: &[DefinedParameter<'a>], values: &[ParameterValue<'a>]) -> (ActionHelpText<'a>, String) {
    let action = &request.table.actions[request.action_index];
    let mut scope: Vec<&str> = Vec::new();
    for (index, definition) in definitions.iter().enumerate() {
        for name in phase_names(values, index) {
            scope.push(definition.long_name);
            scope.push(name);
        }
    }
    let epilog: String = bold(&format!("For more information on available unscoped parameters, use \"heft {} --help\"", action.name));
    let (prog, description, banner) = match request.alias {
        Some(alias) => (
            format!("heft {}", request.command_name),
            Cow::Owned(alias_documentation(request.table, alias)),
            format!("{}\n", alias_expansion_message(request.table, alias)),
        ),
        None => (
            format!("heft {} {} --", request.command_name, scope.join(" ")),
            Cow::Borrowed(run_documentation(action.watch)),
            String::new(),
        ),
    };
    (ActionHelpText { prog: Cow::Owned(prog), description, epilog: Some(epilog) }, banner)
}
