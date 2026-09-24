use std::borrow::Cow;

use super::action_text::{action_documentation, alias_documentation, alias_expansion_message};
use super::actions::{selected_phases_from, ActionKind, ActionTable, AliasEntry};
use super::defined_parameter::DefinedParameter;
use super::help_builders::{action_help_parser, ActionHelpText};
use super::model::CliModel;
use super::outcome::{CliOutcome, ParsedCommand, ParsedParameters};
use super::parameters::{push_builtin_parameters, push_plugin_parameters, push_scoping_parameters, verbose_parameter, ROOT_PARAMETER_NAMES};
use super::parse::{parse_arguments, ArgumentError, ParameterValue, ParseOutcome};
use super::phase_selection::{select_phases, PhaseSelection};
use super::registration::{try_register_parameters, Registration};
use super::render::{ambiguity_error_output, argument_error_message, help_output, usage_error_output};
use super::run_invocation::invoke_run;

pub struct ActionRequest<'a, 't> {
    pub model: &'a CliModel<'a>,
    pub table: &'t ActionTable<'a>,
    pub command_name: &'a str,
    pub alias: Option<&'t AliasEntry<'a>>,
    pub action_index: usize,
    pub tool_args: &'a [&'a str],
    pub rest: &'a [&'a str],
    pub width: Option<f64>,
    pub supports_color: Option<&'t dyn Fn() -> bool>,
}

pub fn phase_action_parameters<'a>(model: &'a CliModel<'a>, table: &ActionTable<'a>, phase_index: usize, watch: bool) -> Option<Vec<DefinedParameter<'a>>> {
    let mut parameters: Vec<DefinedParameter<'a>> = Vec::new();
    push_builtin_parameters(&mut parameters, watch);
    push_plugin_parameters(&mut parameters, model, &selected_phases_from(table, [phase_index]))?;
    Some(parameters)
}

pub fn invoke_action<'a>(request: ActionRequest<'a, '_>) -> Option<CliOutcome<'a>> {
    let mut action_args: Vec<&'a str> = Vec::with_capacity(request.rest.len() + 4);
    if let Some(alias) = request.alias {
        action_args.extend(alias.default_parameters.iter().copied());
    }
    action_args.extend(request.rest.iter().copied());
    let action = &request.table.actions[request.action_index];
    match action.kind {
        ActionKind::Run => invoke_run(&request, &action_args),
        ActionKind::Clean => {
            let mut parameters: Vec<DefinedParameter<'a>> = Vec::new();
            push_scoping_parameters(&mut parameters, "clean");
            parameters.push(verbose_parameter());
            invoke_simple(&request, parameters, &action_args)
        }
        ActionKind::Phase(phase_index) => {
            let parameters = phase_action_parameters(request.model, request.table, phase_index, action.watch)?;
            invoke_simple(&request, parameters, &action_args)
        }
    }
}

pub fn help_text<'a>(request: &ActionRequest<'a, '_>, epilog: Option<String>) -> ActionHelpText<'a> {
    let description: Cow<'a, str> = match request.alias {
        Some(alias) => Cow::Owned(alias_documentation(request.table, alias)),
        None => action_documentation(request.model, &request.table.actions[request.action_index]),
    };
    ActionHelpText { prog: Cow::Owned(format!("heft {}", request.command_name)), description, epilog }
}

pub fn print_help<'a>(request: &ActionRequest<'a, '_>, registration: &Registration, parameters: &[DefinedParameter<'_>], has_remainder: bool) -> Option<CliOutcome<'a>> {
    let parser = action_help_parser(registration, parameters, help_text(request, None), has_remainder)?;
    Some(CliOutcome::Print(help_output(&parser, request.width, 1)?))
}

pub fn print_error<'a>(request: &ActionRequest<'a, '_>, registration: &Registration, parameters: &[DefinedParameter<'_>], has_remainder: bool, error: &ArgumentError<'_>) -> Option<CliOutcome<'a>> {
    let message: String = argument_error_message(error, registration, parameters)?;
    let mut text: ActionHelpText<'a> = help_text(request, None);
    let error_prog: String = text.prog.to_string();
    if matches!(error, ArgumentError::Ambiguous(_)) {
        text.prog = Cow::Owned(format!("heft {}", request.table.actions[request.action_index].name));
    }
    let parser = action_help_parser(registration, parameters, text, has_remainder)?;
    let output = match error {
        ArgumentError::Ambiguous(_) => ambiguity_error_output(&parser, request.width, &error_prog, &message)?,
        _ => usage_error_output(&parser, request.width, &message)?,
    };
    Some(CliOutcome::Print(output))
}

pub fn execute<'a>(request: &ActionRequest<'a, '_>, selected_phases: Vec<usize>, parameters: ParsedParameters<'a>, scoped: Option<(ParsedParameters<'a>, Vec<&'a str>)>) -> Option<CliOutcome<'a>> {
    let (scoped_parameters, remainder) = match scoped {
        Some((scoped_parameters, remainder)) => (Some(scoped_parameters), remainder),
        None => (None, Vec::new()),
    };
    let action = &request.table.actions[request.action_index];
    let defaults: &[&str] = request.alias.map_or(&[], |alias| alias.default_parameters);
    let uses_explicit_values: bool = defaults.iter().chain(request.rest).any(|arg| arg.starts_with('-') && arg.contains('='));
    Some(CliOutcome::Execute(Box::new(ParsedCommand {
        command_name: request.command_name,
        unaliased_command_name: action.name.to_string(),
        action_kind: action.kind,
        watch: action.watch,
        debug: request.tool_args.contains(&"--debug"),
        alias_expansion_message: request.alias.map(|alias| alias_expansion_message(request.table, alias)),
        phase_name: match action.kind {
            ActionKind::Phase(phase_index) => Some(request.model.phases[phase_index].name),
            _ => None,
        },
        selected_phases,
        parameters,
        scoped_parameters,
        remainder,
        parsed_like_v2_lean_parser: !uses_explicit_values,
    })))
}

fn invoke_simple<'a>(request: &ActionRequest<'a, '_>, definitions: Vec<DefinedParameter<'a>>, action_args: &[&'a str]) -> Option<CliOutcome<'a>> {
    let registration: Registration = try_register_parameters(&definitions, &ROOT_PARAMETER_NAMES)?;
    let values: Vec<ParameterValue<'a>> = match parse_arguments(&registration, &definitions, action_args, false) {
        ParseOutcome::Help => return print_help(request, &registration, &definitions, false),
        ParseOutcome::Failed(error) => return print_error(request, &registration, &definitions, false, &error),
        ParseOutcome::Delegate => return None,
        ParseOutcome::Parsed { values, .. } => values,
    };
    let selected_phases: Vec<usize> = match request.table.actions[request.action_index].kind {
        ActionKind::Phase(phase_index) => selected_phases_from(request.table, [phase_index]),
        _ if values.iter().all(|value| *value == ParameterValue::Absent || *value == ParameterValue::Flag) => {
            (0..request.model.phases.len()).collect()
        }
        _ => match select_phases(request, &values) {
            PhaseSelection::Selected(selected) => selected,
            _ => return None,
        },
    };
    execute(request, selected_phases, ParsedParameters { definitions, values }, None)
}
