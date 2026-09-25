use super::actions::ActionKind;
use super::defined_parameter::DefinedParameter;
use super::parse::ParameterValue;

#[derive(Debug, PartialEq, Eq)]
pub struct PrintedOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

#[derive(Debug)]
pub struct ParsedParameters<'a> {
    pub definitions: Vec<DefinedParameter<'a>>,
    pub values: Vec<ParameterValue<'a>>,
}

#[derive(Debug)]
pub struct ParsedCommand<'a> {
    pub command_name: &'a str,
    pub unaliased_command_name: String,
    pub action_kind: ActionKind,
    pub watch: bool,
    pub debug: bool,
    pub alias_expansion_message: Option<String>,
    pub phase_name: Option<&'a str>,
    pub selected_phases: Vec<usize>,
    pub parameters: ParsedParameters<'a>,
    pub scoped_parameters: Option<ParsedParameters<'a>>,
    pub remainder: Vec<&'a str>,
    pub parsed_like_v2_lean_parser: bool,
}

#[derive(Debug)]
pub enum CliOutcome<'a> {
    Print(PrintedOutput),
    Execute(Box<ParsedCommand<'a>>),
    Delegate,
}
