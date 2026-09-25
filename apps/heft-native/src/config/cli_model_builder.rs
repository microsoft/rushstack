use super::fallback::{fallback, ConfigResult};
use super::model::HeftConfigurationModel;
use crate::cli::model::{
    AliasModel, CliModel, DefaultValue, ParameterKind, PhaseModel, PluginModel,
    PluginParameterDefinition,
};
use crate::json::JsonValue;

fn parameter_kind(name: &str) -> ConfigResult<ParameterKind> {
    match name {
        "flag" => Ok(ParameterKind::Flag),
        "string" => Ok(ParameterKind::String),
        "stringList" => Ok(ParameterKind::StringList),
        "integer" => Ok(ParameterKind::Integer),
        "integerList" => Ok(ParameterKind::IntegerList),
        "choice" => Ok(ParameterKind::Choice),
        "choiceList" => Ok(ParameterKind::ChoiceList),
        _ => fallback("a plugin parameter has an unknown parameterKind"),
    }
}

fn optional_text<'a>(parameter: &'a JsonValue<'a>, key: &str) -> ConfigResult<Option<&'a str>> {
    match parameter.get(key) {
        None => Ok(None),
        Some(JsonValue::String(text)) => Ok(Some(text)),
        Some(_) => fallback("a plugin parameter field is not a string"),
    }
}

fn required_text<'a>(parameter: &'a JsonValue<'a>, key: &str) -> ConfigResult<&'a str> {
    match optional_text(parameter, key)? {
        Some(text) => Ok(text),
        None => fallback("a plugin parameter has no required text field"),
    }
}

fn alternative_names<'a>(parameter: &'a JsonValue<'a>) -> ConfigResult<Vec<&'a str>> {
    match parameter.get("alternatives") {
        None => Ok(Vec::new()),
        Some(JsonValue::Array(alternatives)) => alternatives
            .iter()
            .map(|alternative| required_text(alternative, "name"))
            .collect(),
        Some(_) => fallback("plugin parameter alternatives are not an array"),
    }
}

fn parameter_definition<'a>(
    parameter: &'a JsonValue<'a>,
) -> ConfigResult<PluginParameterDefinition<'a>> {
    let required: bool = match parameter.get("required") {
        None => false,
        Some(JsonValue::Boolean(required)) => *required,
        Some(_) => return fallback("a plugin parameter's required field is not a boolean"),
    };
    let default_value: Option<DefaultValue<'a>> = match parameter.get("defaultValue") {
        None => None,
        Some(JsonValue::String(text)) => Some(DefaultValue::Text(text)),
        Some(JsonValue::Number(number)) => Some(DefaultValue::Number(number.value)),
        Some(_) => return fallback("a plugin parameter's defaultValue has an unexpected type"),
    };
    Ok(PluginParameterDefinition {
        kind: parameter_kind(required_text(parameter, "parameterKind")?)?,
        long_name: required_text(parameter, "longName")?,
        short_name: optional_text(parameter, "shortName")?
            .filter(|short_name| !short_name.is_empty()),
        description: required_text(parameter, "description")?,
        required,
        argument_name: optional_text(parameter, "argumentName")?,
        alternatives: alternative_names(parameter)?,
        default_value,
    })
}

pub fn build_cli_model<'a>(model: &'a HeftConfigurationModel<'a>) -> ConfigResult<CliModel<'a>> {
    let mut plugins: Vec<PluginModel<'a>> = Vec::with_capacity(model.plugins.len());
    for plugin in &model.plugins {
        let parameters = plugin
            .parameters
            .iter()
            .map(parameter_definition)
            .collect::<ConfigResult<Vec<_>>>()?;
        plugins.push(PluginModel {
            plugin_name: plugin.plugin_name,
            package_name: plugin.package_name,
            parameter_scope: plugin.parameter_scope,
            parameters,
        });
    }
    Ok(CliModel {
        phases: model
            .phases
            .iter()
            .map(|phase| PhaseModel {
                name: phase.name,
                description: phase.description,
                dependency_names: phase.dependency_names.clone(),
                task_plugin_indices: phase.tasks.iter().map(|task| task.plugin).collect(),
            })
            .collect(),
        aliases: model
            .aliases
            .iter()
            .map(|alias| AliasModel {
                name: alias.name,
                action_name: alias.action_name,
                default_parameters: alias.default_parameters.clone(),
            })
            .collect(),
        lifecycle_plugin_indices: model
            .lifecycle_plugins
            .iter()
            .map(|lifecycle_plugin| lifecycle_plugin.plugin)
            .collect(),
        plugins,
        debug_messages: model.debug_messages.iter().map(String::as_str).collect(),
    })
}
