use std::borrow::Cow;

use super::action_invocation::{invoke_action, phase_action_parameters, ActionRequest};
use super::action_text::{action_summary, alias_summary};
use super::actions::{build_action_table, ActionTable, AliasEntry};
use super::help_builders::root_help_parser;
use super::model::CliModel;
use super::outcome::CliOutcome;
use super::parameters::ROOT_PARAMETER_NAMES;
use super::registration::try_register_parameters;
use super::render::{help_output, invalid_command_message, usage_error_output};
use super::validate::is_valid_long_name;

const ROOT_OPTION_STRINGS: [&str; 4] = ["-h", "--help", "--debug", "--unmanaged"];
const TOO_FEW_ARGUMENTS: &str = "too few arguments";

#[cfg(test)]
pub fn interpret_with_width<'a>(args: &'a [&'a str], model: &'a CliModel<'a>, width: Option<f64>) -> CliOutcome<'a> {
    interpret_with_output(args, model, width, None)
}

pub fn interpret_with_output<'a>(
    args: &'a [&'a str],
    model: &'a CliModel<'a>,
    width: Option<f64>,
    supports_color: Option<&dyn Fn() -> bool>,
) -> CliOutcome<'a> {
    match interpret(args, model, width, supports_color) {
        Some(CliOutcome::Print(mut output)) if is_debug_enabled(args) && !model.debug_messages.is_empty() => {
            let mut stdout: String = String::with_capacity(output.stdout.len() + 256);
            for message in &model.debug_messages {
                stdout.push_str(message);
                stdout.push('\n');
            }
            stdout.push_str(&output.stdout);
            output.stdout = stdout;
            CliOutcome::Print(output)
        }
        Some(outcome) => outcome,
        None => CliOutcome::Delegate,
    }
}

fn is_debug_enabled(args: &[&str]) -> bool {
    args.iter().take_while(|arg| arg.starts_with('-')).any(|arg| *arg == "--debug")
}

fn root_summaries<'x>(model: &'x CliModel<'x>, table: &'x ActionTable<'x>) -> Vec<(Cow<'x, str>, Cow<'x, str>)> {
    let mut summaries: Vec<(Cow<'x, str>, Cow<'x, str>)> = Vec::with_capacity(table.actions.len() + table.aliases.len());
    for action in &table.actions {
        summaries.push((Cow::Borrowed(action.name.as_ref()), action_summary(model, action)));
    }
    for alias in &table.aliases {
        summaries.push((Cow::Borrowed(alias.name), Cow::Owned(alias_summary(table, alias))));
    }
    summaries
}

fn print_root_help<'a>(model: &CliModel<'_>, table: &ActionTable<'_>, width: Option<f64>) -> Option<CliOutcome<'a>> {
    let parser = root_help_parser(root_summaries(model, table));
    Some(CliOutcome::Print(help_output(&parser, width, 1)?))
}

fn root_usage_error<'a>(message: &str, width: Option<f64>) -> Option<CliOutcome<'a>> {
    let parser = root_help_parser(Vec::new());
    Some(CliOutcome::Print(usage_error_output(&parser, width, message)?))
}

fn is_unknown_tool_option(arg: &str) -> bool {
    is_valid_long_name(arg) && !ROOT_OPTION_STRINGS.iter().any(|option_string| option_string.starts_with(arg))
}

fn interpret<'a>(args: &'a [&'a str], model: &'a CliModel<'a>, width: Option<f64>, supports_color: Option<&dyn Fn() -> bool>) -> Option<CliOutcome<'a>> {
    let table: ActionTable<'a> = build_action_table(model)?;
    for phase_index in 0..model.phases.len() {
        let parameters = phase_action_parameters(model, &table, phase_index, false)?;
        try_register_parameters(&parameters, &ROOT_PARAMETER_NAMES)?;
    }
    let action_position: Option<usize> = args.iter().position(|arg| !arg.starts_with('-'));
    let mut has_unknown_tool_option: bool = false;
    for arg in &args[..action_position.unwrap_or(args.len())] {
        match *arg {
            "-h" | "--help" => return print_root_help(model, &table, width),
            "--debug" | "--unmanaged" => {}
            "--" => return root_usage_error(&invalid_command_message("--", table.command_names()), width),
            _ if is_unknown_tool_option(arg) => has_unknown_tool_option = true,
            _ => return None,
        }
    }
    let Some(action_position) = action_position else {
        return if args.is_empty() { print_root_help(model, &table, width) } else { root_usage_error(TOO_FEW_ARGUMENTS, width) };
    };
    let command_name: &'a str = args[action_position];
    if has_unknown_tool_option || command_name.is_empty() {
        return None;
    }
    let alias: Option<&AliasEntry<'a>> = table.find_alias(command_name);
    let action_index: usize = match alias.map(|alias| alias.target_index).or_else(|| table.find_action(command_name)) {
        Some(action_index) => action_index,
        None => return root_usage_error(&invalid_command_message(command_name, table.command_names()), width),
    };
    invoke_action(ActionRequest {
        model,
        table: &table,
        command_name,
        alias,
        action_index,
        tool_args: &args[..action_position],
        rest: &args[action_position + 1..],
        width,
        supports_color,
    })
}
