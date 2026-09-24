use super::defined_parameter::DefinedParameter;
use super::help_format::{format_help, format_usage_only};
use super::help_model::HelpParser;
use super::outcome::PrintedOutput;
use super::parse::ArgumentError;
use super::registration::{Registration, RegistrationStep};

pub fn help_output(parser: &HelpParser<'_>, width: Option<f64>, exit_code: i32) -> Option<PrintedOutput> {
    Some(PrintedOutput { stdout: format_help(parser, width?)?, stderr: String::new(), exit_code })
}

pub fn usage_error_output(parser: &HelpParser<'_>, width: Option<f64>, message: &str) -> Option<PrintedOutput> {
    if message.contains('%') {
        return None;
    }
    let stdout: String = format_usage_only(parser, width?)?;
    let stderr: String = format!("{}: error: {}\n\n", parser.prog, message);
    Some(PrintedOutput { stdout, stderr, exit_code: 1 })
}

pub fn invalid_command_message<'x>(value: &str, command_names: impl Iterator<Item = &'x str>) -> String {
    let choices: Vec<&str> = command_names.collect();
    format!("argument \"<command>\": Invalid choice: {} (choose from [{}])", value, choices.join(", "))
}

pub fn argument_error_message(error: &ArgumentError<'_>, registration: &Registration, parameters: &[DefinedParameter<'_>]) -> Option<String> {
    let name_of = |parameter_index: usize| -> Option<String> {
        Some(registration.option_strings_of(parameter_index)?.join("/"))
    };
    Some(match error {
        ArgumentError::ExpectedOneArgument(index) => format!("argument \"{}\": Expected one argument. null", name_of(*index)?),
        ArgumentError::InvalidChoice(index, value) => format!(
            "argument \"{}\": Invalid choice: {} (choose from [{}])",
            name_of(*index)?,
            value,
            parameters[*index].alternatives.join(", ")
        ),
        ArgumentError::InvalidInteger(index, value) => format!("argument \"{}\": Invalid int value: {}", name_of(*index)?, value),
        ArgumentError::Required(index) => format!("Argument \"{}\" is required", name_of(*index)?),
        ArgumentError::Unrecognized(extras) => format!("Unrecognized arguments: {}.", extras.join(" ")),
        ArgumentError::Ambiguous(step_index) => ambiguity_message(registration, parameters, *step_index)?,
    })
}

fn ambiguity_message(registration: &Registration<'_>, parameters: &[DefinedParameter<'_>], step_index: usize) -> Option<String> {
    let RegistrationStep::Ambiguous(name) = registration.steps.get(step_index)? else {
        return None;
    };
    let count_long_name = |long_name: &str| parameters.iter().filter(|parameter| parameter.long_name == long_name).count();
    let mut candidates: Vec<String> = Vec::new();
    if parameters.iter().any(|parameter| parameter.short_name == Some(name.as_ref())) {
        for parameter in parameters.iter().filter(|parameter| parameter.short_name == Some(name.as_ref())) {
            candidates.push(if count_long_name(parameter.long_name) > 1 { parameter.scoped_long_name()? } else { parameter.long_name.to_string() });
        }
    } else {
        for parameter in parameters.iter().filter(|parameter| parameter.long_name == name.as_ref()) {
            candidates.push(parameter.scoped_long_name()?);
        }
    }
    Some(if candidates.is_empty() {
        format!("Ambiguous option: \"{name}\".")
    } else {
        format!("Ambiguous option: \"{name}\" could match {}.", candidates.join(", "))
    })
}

pub fn ambiguity_error_output(usage_parser: &HelpParser<'_>, width: Option<f64>, error_prog: &str, message: &str) -> Option<PrintedOutput> {
    let mut stdout: String = format_usage_only(usage_parser, width?)?;
    stdout.push('\n');
    let stderr: String = format!("Error: {}: error: {}\n\n", error_prog, message.trim());
    Some(PrintedOutput { stdout, stderr, exit_code: 1 })
}

pub fn terminal_error_output(parser: &HelpParser<'_>, width: Option<f64>, message: &str, supports_color: bool) -> Option<PrintedOutput> {
    if message.contains('%') || message.contains('\u{1b}') {
        return None;
    }
    let stdout: String = format_usage_only(parser, width?)?;
    let stderr: String = terminal_error_line(&format!("Error: {}: error: {}\n", parser.prog, message), supports_color);
    Some(PrintedOutput { stdout, stderr, exit_code: 1 })
}

pub fn terminal_error_line(text: &str, supports_color: bool) -> String {
    if supports_color { format!("\u{1b}[31m{text}\u{1b}[39m\n") } else { format!("{text}\n") }
}

pub fn remainder_error_output(parser: &HelpParser<'_>, width: Option<f64>, action_name: &str, first_argument: &str, supports_color: bool) -> Option<PrintedOutput> {
    if first_argument.contains('%') || first_argument.contains('\u{1b}') {
        return None;
    }
    let usage: String = format_usage_only(parser, width?)?;
    let text: String = format!("Error: {usage}\nheft {action_name}: error: Unrecognized arguments: {first_argument}.\n");
    Some(PrintedOutput { stdout: String::new(), stderr: terminal_error_line(&text, supports_color), exit_code: 1 })
}
