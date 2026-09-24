use super::fallback::{fallback, ConfigResult};
use super::fs_probe::{exists_like_exists_sync, read_text_or_missing};
use super::node_path::resolve;
use crate::json::{parse_json_with_comments_exactly_like_jju, JsonValue};
use crate::schema::CompiledJsonSchema;

pub struct PluginPackageManifest {
    pub package_root: String,
    pub package_name: String,
    pub manifest_file_path: String,
    pub text: String,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PluginKind {
    Lifecycle,
    Task,
}

pub struct PluginDefinition<'manifest> {
    pub kind: PluginKind,
    pub package: usize,
    pub plugin_name: &'manifest str,
    pub entry_point: String,
    pub options_schema_path: Option<String>,
    pub parameter_scope: &'manifest str,
    pub parameters: &'manifest [JsonValue<'manifest>],
}

pub fn read_plugin_package_manifest(
    package_root: &str,
    package_name: &str,
) -> ConfigResult<PluginPackageManifest> {
    let mut manifest_file_path: String = String::with_capacity(package_root.len() + 17);
    manifest_file_path.push_str(package_root);
    manifest_file_path.push_str("/heft-plugin.json");
    match read_text_or_missing(&manifest_file_path)? {
        Some(text) => Ok(PluginPackageManifest {
            package_root: package_root.to_string(),
            package_name: package_name.to_string(),
            manifest_file_path,
            text,
        }),
        None => fallback("a heft-plugin.json file does not exist"),
    }
}

pub fn parse_plugin_package_manifest<'manifest>(
    manifest: &'manifest PluginPackageManifest,
    schema: &CompiledJsonSchema,
) -> ConfigResult<JsonValue<'manifest>> {
    match parse_json_with_comments_exactly_like_jju(&manifest.text) {
        Ok(parsed) if schema.is_definitely_valid(&parsed) => Ok(parsed),
        _ => fallback("a heft-plugin.json file is not definitely valid"),
    }
}

fn plugin_list<'manifest>(
    manifest: &'manifest JsonValue<'manifest>,
    key: &str,
) -> ConfigResult<&'manifest [JsonValue<'manifest>]> {
    match manifest.get(key) {
        None => Ok(&[]),
        Some(JsonValue::Array(items)) => Ok(items),
        Some(_) => fallback("a plugin list is not an array"),
    }
}

fn truthy_string<'manifest>(
    definition: &'manifest JsonValue<'manifest>,
    key: &str,
) -> ConfigResult<Option<&'manifest str>> {
    match definition.get(key) {
        None => Ok(None),
        Some(JsonValue::String(text)) if text.is_empty() => Ok(None),
        Some(JsonValue::String(text)) => Ok(Some(text)),
        Some(_) => fallback("a plugin definition field is not a string"),
    }
}

fn load_plugin_definition<'manifest>(
    kind: PluginKind,
    package: usize,
    manifest: &PluginPackageManifest,
    definition: &'manifest JsonValue<'manifest>,
) -> ConfigResult<PluginDefinition<'manifest>> {
    let (plugin_name, entry_point) =
        match (definition.get("pluginName"), definition.get("entryPoint")) {
            (Some(JsonValue::String(plugin_name)), Some(JsonValue::String(entry_point))) => {
                (plugin_name, entry_point)
            }
            _ => return fallback("a plugin definition has no pluginName or entryPoint"),
        };
    let parameters: &'manifest [JsonValue<'manifest>] = plugin_list(definition, "parameters")?;
    for (index, parameter) in parameters.iter().enumerate() {
        let long_name: Option<&str> = parameter.get("longName").and_then(JsonValue::as_str);
        if long_name.is_none()
            || parameters[..index]
                .iter()
                .any(|other| other.get("longName").and_then(JsonValue::as_str) == long_name)
        {
            return fallback("a plugin defines a parameter more than once");
        }
    }
    let options_schema_path: Option<String> = match truthy_string(definition, "optionsSchema")? {
        Some(options_schema) => {
            let resolved_schema_path: String = resolve(&manifest.package_root, options_schema);
            if !exists_like_exists_sync(&resolved_schema_path) {
                return fallback("a plugin options schema file does not exist");
            }
            Some(resolved_schema_path)
        }
        None => None,
    };
    Ok(PluginDefinition {
        kind,
        package,
        plugin_name,
        entry_point: resolve(&manifest.package_root, entry_point),
        options_schema_path,
        parameter_scope: truthy_string(definition, "parameterScope")?.unwrap_or(plugin_name),
        parameters,
    })
}

pub fn load_plugin_definitions<'manifest>(
    package: usize,
    manifest: &PluginPackageManifest,
    parsed: &'manifest JsonValue<'manifest>,
    definitions: &mut Vec<PluginDefinition<'manifest>>,
) -> ConfigResult<()> {
    let lifecycle_plugins: &[JsonValue] = plugin_list(parsed, "lifecyclePlugins")?;
    let task_plugins: &[JsonValue] = plugin_list(parsed, "taskPlugins")?;
    if lifecycle_plugins.is_empty() && task_plugins.is_empty() {
        return fallback("a plugin package does not contain any plugins");
    }
    let first_definition: usize = definitions.len();
    for (kind, list) in [
        (PluginKind::Lifecycle, lifecycle_plugins),
        (PluginKind::Task, task_plugins),
    ] {
        for definition in list {
            let loaded: PluginDefinition =
                load_plugin_definition(kind, package, manifest, definition)?;
            if definitions[first_definition..]
                .iter()
                .any(|other| other.plugin_name == loaded.plugin_name)
            {
                return fallback("a plugin package contains duplicate plugin names");
            }
            definitions.push(loaded);
        }
    }
    Ok(())
}
