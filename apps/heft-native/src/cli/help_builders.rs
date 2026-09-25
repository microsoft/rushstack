use std::borrow::Cow;

use super::defined_parameter::DefinedParameter;
use super::help_model::{bold, HelpAction, HelpGroup, HelpNargs, HelpParser, HelpText};
use super::model::ParameterKind;
use super::registration::{Registration, RegistrationStep};

pub const HEFT_TOOL_DESCRIPTION: &str = "Heft is a pluggable build system designed for web projects.";
const DEBUG_DESCRIPTION: &str = "Show the full call stack if an error occurs while executing the tool";
const UNMANAGED_DESCRIPTION: &str = "Disables the Heft version selector: When Heft is invoked via the shell path, normally it will examine the project's package.json dependencies and try to use the locally installed version of Heft. Specify \"--unmanaged\" to force the invoked version of Heft to be used. This is useful for example if you want to test a different version of Heft.";
pub const REMAINDER_DESCRIPTION: &str = "Scoped parameters.  Must be prefixed with \"--\", ex. \"-- --scopedParameter foo --scopedFlag\".  For more information on available scoped parameters, use \"-- --help\".";

pub fn root_help_parser<'a>(summaries: Vec<(Cow<'a, str>, Cow<'a, str>)>) -> HelpParser<'a> {
    let subactions: Vec<HelpAction<'a>> = summaries
        .into_iter()
        .map(|(name, summary)| HelpAction {
            option_strings: Vec::new(),
            dest: name,
            nargs: HelpNargs::Single,
            metavar: None,
            help: HelpText::Text(summary),
            choices: None,
            required: false,
            subactions: Vec::new(),
        })
        .collect();
    let subparsers: HelpAction<'a> = HelpAction {
        option_strings: Vec::new(),
        dest: Cow::Borrowed("action"),
        nargs: HelpNargs::Parser,
        metavar: Some("<command>"),
        help: HelpText::Absent,
        choices: None,
        required: false,
        subactions,
    };
    HelpParser {
        prog: Cow::Borrowed("heft"),
        description: Some(Cow::Borrowed(HEFT_TOOL_DESCRIPTION)),
        epilog: Some(Cow::Owned(bold("For detailed help about a specific command, use: heft <command> -h"))),
        actions: vec![
            HelpAction::help_option(),
            subparsers,
            HelpAction::flag_option("--debug", DEBUG_DESCRIPTION),
            HelpAction::flag_option("--unmanaged", UNMANAGED_DESCRIPTION),
        ],
        groups: vec![
            HelpGroup { title: Cow::Borrowed("Positional arguments"), action_indices: vec![1] },
            HelpGroup { title: Cow::Borrowed("Optional arguments"), action_indices: vec![0, 2, 3] },
        ],
    }
}

fn parameter_action<'a>(parameter: &'a DefinedParameter<'a>, option_strings: &[Cow<'a, str>]) -> Option<HelpAction<'a>> {
    let help_text: Cow<'a, str> = parameter.help_text()?;
    Some(HelpAction {
        option_strings: option_strings.to_vec(),
        dest: Cow::Borrowed(parameter.long_name),
        nargs: if parameter.kind == ParameterKind::Flag { HelpNargs::Zero } else { HelpNargs::Single },
        metavar: parameter.argument_name,
        help: HelpText::Text(help_text),
        choices: if parameter.kind.has_alternatives() { Some(parameter.alternatives.clone()) } else { None },
        required: parameter.required,
        subactions: Vec::new(),
    })
}

pub struct ActionHelpText<'a> {
    pub prog: Cow<'a, str>,
    pub description: Cow<'a, str>,
    pub epilog: Option<String>,
}

pub fn action_help_parser<'a>(
    registration: &Registration<'a>,
    parameters: &'a [DefinedParameter<'a>],
    text: ActionHelpText<'a>,
    has_remainder: bool,
) -> Option<HelpParser<'a>> {
    let mut actions: Vec<HelpAction<'a>> = vec![HelpAction::help_option()];
    let mut positionals: Vec<usize> = Vec::new();
    let mut optionals: Vec<usize> = vec![0];
    let mut scoping: Vec<usize> = Vec::new();
    for step in &registration.steps {
        let action_index: usize = actions.len();
        match step {
            RegistrationStep::Ambiguous(name) => {
                actions.push(HelpAction::hidden_option(name.clone()));
                optionals.push(action_index);
            }
            RegistrationStep::Parameter { parameter_index, option_strings } => {
                let parameter: &'a DefinedParameter<'a> = &parameters[*parameter_index];
                actions.push(parameter_action(parameter, option_strings)?);
                if parameter.scoping_group { scoping.push(action_index) } else { optionals.push(action_index) }
            }
        }
    }
    if has_remainder {
        positionals.push(actions.len());
        actions.push(HelpAction {
            option_strings: Vec::new(),
            dest: Cow::Borrowed("..."),
            nargs: HelpNargs::Remainder,
            metavar: Some("\"...\""),
            help: HelpText::Text(Cow::Borrowed(REMAINDER_DESCRIPTION)),
            choices: None,
            required: true,
            subactions: Vec::new(),
        });
    }
    let mut groups: Vec<HelpGroup<'a>> = vec![
        HelpGroup { title: Cow::Borrowed("Positional arguments"), action_indices: positionals },
        HelpGroup { title: Cow::Borrowed("Optional arguments"), action_indices: optionals },
    ];
    if !scoping.is_empty() {
        groups.push(HelpGroup { title: Cow::Borrowed("Optional scoping arguments"), action_indices: scoping });
    }
    Some(HelpParser {
        prog: text.prog,
        description: Some(text.description),
        epilog: text.epilog.map(Cow::Owned),
        actions,
        groups,
    })
}
