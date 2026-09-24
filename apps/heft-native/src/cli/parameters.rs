use std::borrow::Cow;

use super::defined_parameter::DefinedParameter;
use super::model::{CliModel, ParameterKind, PluginParameterDefinition};
use super::validate::is_valid_definition;

pub const ROOT_PARAMETER_NAMES: [Cow<'static, str>; 2] = [Cow::Borrowed("--debug"), Cow::Borrowed("--unmanaged")];

const VERBOSE_DESCRIPTION: &str = "If specified, log information useful for debugging.";
const PRODUCTION_DESCRIPTION: &str = "If specified, run Heft in production mode.";
const LOCALES_DESCRIPTION: &str = "Use the specified locale for this run, if applicable.";
const CLEAN_DESCRIPTION: &str =
    "If specified, clean the outputs at the beginning of the lifecycle and before running each phase.";
const CLEAN_WATCH_DESCRIPTION: &str = "If specified, clean the outputs at the beginning of the lifecycle and before running each phase. Cleaning will only be performed once for the lifecycle and each phase, and further incremental runs will not be cleaned for the duration of execution.";

pub fn verbose_parameter() -> DefinedParameter<'static> {
    DefinedParameter::flag("--verbose", Some("-v"), Cow::Borrowed(VERBOSE_DESCRIPTION))
}

pub fn push_builtin_parameters(parameters: &mut Vec<DefinedParameter<'_>>, watch: bool) {
    parameters.push(verbose_parameter());
    parameters.push(DefinedParameter::flag("--production", None, Cow::Borrowed(PRODUCTION_DESCRIPTION)));
    parameters.push(DefinedParameter::string_list("--locales", "LOCALE", Cow::Borrowed(LOCALES_DESCRIPTION), false));
    let clean_description: &'static str = if watch { CLEAN_WATCH_DESCRIPTION } else { CLEAN_DESCRIPTION };
    parameters.push(DefinedParameter::flag("--clean", None, Cow::Borrowed(clean_description)));
}

pub fn push_scoping_parameters(parameters: &mut Vec<DefinedParameter<'_>>, action_name: &str) {
    let to_description: String = format!("The phase to {action_name} to, including all transitive dependencies.");
    let to_except_description: String =
        format!("The phase to {action_name} to (but not include), including all transitive dependencies.");
    let only_description: String = format!("The phase to {action_name}.");
    parameters.push(DefinedParameter::string_list("--to", "PHASE", Cow::Owned(to_description), true));
    parameters.push(DefinedParameter::string_list("--to-except", "PHASE", Cow::Owned(to_except_description), true));
    parameters.push(DefinedParameter::string_list("--only", "PHASE", Cow::Owned(only_description), true));
}

fn push_unique(indices: &mut Vec<usize>, index: usize) {
    if !indices.contains(&index) {
        indices.push(index);
    }
}

fn unique_alternatives<'a>(alternatives: &[&'a str]) -> Vec<&'a str> {
    let mut unique: Vec<&'a str> = Vec::with_capacity(alternatives.len());
    for alternative in alternatives {
        if !unique.contains(alternative) {
            unique.push(alternative);
        }
    }
    unique
}

fn define_plugin_parameter<'a>(definition: &'a PluginParameterDefinition<'a>, scope: &'a str) -> DefinedParameter<'a> {
    let kind: ParameterKind = definition.kind;
    let takes_argument_name: bool = kind.takes_argument() && !kind.has_alternatives();
    let takes_default: bool = matches!(kind, ParameterKind::Choice | ParameterKind::Integer | ParameterKind::String);
    DefinedParameter {
        kind,
        long_name: definition.long_name,
        short_name: definition.short_name.filter(|short_name| !short_name.is_empty()),
        scope: Some(scope),
        scoping_group: false,
        required: definition.required,
        argument_name: if takes_argument_name { definition.argument_name } else { None },
        alternatives: if kind.has_alternatives() { unique_alternatives(&definition.alternatives) } else { Vec::new() },
        default_value: if takes_default { definition.default_value } else { None },
        description: Cow::Borrowed(definition.description),
    }
}

pub fn push_plugin_parameters<'a>(
    parameters: &mut Vec<DefinedParameter<'a>>,
    model: &'a CliModel<'a>,
    selected_phases: &[usize],
) -> Option<()> {
    let mut plugin_indices: Vec<usize> = Vec::new();
    for plugin_index in &model.lifecycle_plugin_indices {
        push_unique(&mut plugin_indices, *plugin_index);
    }
    for phase_index in selected_phases {
        for plugin_index in &model.phases[*phase_index].task_plugin_indices {
            push_unique(&mut plugin_indices, *plugin_index);
        }
    }
    let mut plugins_by_scope: Vec<(&str, usize)> = Vec::with_capacity(plugin_indices.len());
    for plugin_index in plugin_indices {
        let plugin = model.plugins.get(plugin_index)?;
        match plugins_by_scope.iter().find(|(scope, _)| *scope == plugin.parameter_scope) {
            Some((_, existing_index)) if *existing_index != plugin_index => return None,
            Some(_) => {}
            None => plugins_by_scope.push((plugin.parameter_scope, plugin_index)),
        }
        for definition in &plugin.parameters {
            let parameter: DefinedParameter<'a> = define_plugin_parameter(definition, plugin.parameter_scope);
            if !is_valid_definition(&parameter) {
                return None;
            }
            parameters.push(parameter);
        }
    }
    Some(())
}
