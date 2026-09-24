use crate::cli::outcome::{ParsedCommand, ParsedParameters};
use crate::cli::{ActionKind, ParameterValue};

pub struct TierZeroCommandOptions {
    pub clean: bool,
    pub selected_phase_indices: Vec<usize>,
    pub alias_expansion_message: Option<String>,
}

pub fn tier_zero_command_options(command: &ParsedCommand<'_>) -> Option<TierZeroCommandOptions> {
    if command.watch || command.debug || matches!(command.action_kind, ActionKind::Clean) {
        return None;
    }
    let mut clean = false;
    for parameters in std::iter::once(&command.parameters).chain(command.scoped_parameters.as_ref()) {
        clean |= parameters_allow_tier_zero(parameters)?;
    }
    Some(TierZeroCommandOptions {
        clean,
        selected_phase_indices: command.selected_phases.clone(),
        alias_expansion_message: command.alias_expansion_message.clone(),
    })
}

pub fn tier_zero_clean_options(command: &ParsedCommand<'_>) -> Option<TierZeroCommandOptions> {
    if command.watch || command.debug || !matches!(command.action_kind, ActionKind::Clean) {
        return None;
    }
    let only_scoping_values = command.parameters.definitions.iter().zip(&command.parameters.values).all(|(definition, value)| {
        matches!(value, ParameterValue::Absent) || matches!(definition.long_name, "--to" | "--to-except" | "--only")
    });
    only_scoping_values.then(|| TierZeroCommandOptions {
        clean: false,
        selected_phase_indices: command.selected_phases.clone(),
        alias_expansion_message: command.alias_expansion_message.clone(),
    })
}

fn parameters_allow_tier_zero(parameters: &ParsedParameters<'_>) -> Option<bool> {
    let mut clean = false;
    for (definition, value) in parameters.definitions.iter().zip(&parameters.values) {
        if matches!(value, ParameterValue::Absent) {
            continue;
        }
        if definition.scope.is_some() {
            return None;
        }
        match (definition.long_name, value) {
            ("--clean", ParameterValue::Flag) => clean = true,
            ("--production" | "--locales" | "--to" | "--to-except" | "--only", _) => {}
            _ => return None,
        }
    }
    Some(clean)
}
