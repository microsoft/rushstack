use std::borrow::Cow;

use super::actions::{ActionEntry, ActionKind, AliasEntry, ActionTable};
use super::model::CliModel;

pub const CLEAN_ACTION_DOCUMENTATION: &str = "Clean the project, removing temporary task folders and specified clean paths.";

pub fn run_documentation(watch: bool) -> &'static str {
    if watch {
        "Run a provided selection of Heft phases in watch mode.."
    } else {
        "Run a provided selection of Heft phases."
    }
}

fn phase_summary(phase_name: &str, watch: bool) -> String {
    let ending: &str = if watch { ", in watch mode." } else { "." };
    format!("Runs to the {phase_name} phase, including all transitive dependencies{ending}")
}

pub fn action_summary<'x>(model: &'x CliModel<'x>, action: &ActionEntry<'_>) -> Cow<'x, str> {
    match action.kind {
        ActionKind::Clean => Cow::Borrowed(CLEAN_ACTION_DOCUMENTATION),
        ActionKind::Run => Cow::Borrowed(run_documentation(action.watch)),
        ActionKind::Phase(phase_index) => Cow::Owned(phase_summary(model.phases[phase_index].name, action.watch)),
    }
}

pub fn action_documentation<'x>(model: &'x CliModel<'x>, action: &ActionEntry<'_>) -> Cow<'x, str> {
    match action.kind {
        ActionKind::Phase(phase_index) => {
            let phase = &model.phases[phase_index];
            let mut documentation: String = phase_summary(phase.name, action.watch);
            if let Some(description) = phase.description.filter(|description| !description.is_empty()) {
                documentation.push_str("  ");
                documentation.push_str(description);
            }
            Cow::Owned(documentation)
        }
        _ => action_summary(model, action),
    }
}

pub fn alias_expanded_command(table: &ActionTable<'_>, alias: &AliasEntry<'_>) -> String {
    let mut expanded: String = format!("heft {}", table.actions[alias.target_index].name);
    let defaults: String = alias.default_parameters.join(" ");
    if !defaults.is_empty() {
        expanded.push(' ');
        expanded.push_str(&defaults);
    }
    expanded
}

pub fn alias_summary(table: &ActionTable<'_>, alias: &AliasEntry<'_>) -> String {
    format!("An alias for \"{}\".", alias_expanded_command(table, alias))
}

pub fn alias_documentation(table: &ActionTable<'_>, alias: &AliasEntry<'_>) -> String {
    format!(
        "{} For more information on the aliased command, use \"heft {} --help\".",
        alias_summary(table, alias),
        table.actions[alias.target_index].name
    )
}

pub fn alias_expansion_message(table: &ActionTable<'_>, alias: &AliasEntry<'_>) -> String {
    format!("The \"heft {}\" alias was expanded to \"{}\".", alias.name, alias_expanded_command(table, alias))
}
