use super::fallback::{fallback, ConfigResult};
use super::plugin_manifest::{PluginDefinition, PluginKind};
use super::plugin_references::{PluginReference, PluginReferences};

fn find_plugin_definition(
    definitions: &[PluginDefinition],
    package: usize,
    reference: &PluginReference,
) -> ConfigResult<usize> {
    let mut candidates = definitions
        .iter()
        .enumerate()
        .filter(|(_, definition)| definition.package == package);
    let found: Option<usize> = match reference.plugin_name {
        None => {
            let first: Option<usize> = candidates.next().map(|(index, _)| index);
            if candidates.next().is_some() {
                return fallback(
                    "a plugin package contains multiple plugins and no plugin name was specified",
                );
            }
            first
        }
        Some(plugin_name) => candidates
            .find(|(_, definition)| definition.plugin_name == plugin_name)
            .map(|(index, _)| index),
    };
    match found {
        Some(index) if definitions[index].kind == reference.kind => Ok(index),
        Some(_) => fallback("a plugin is not of the kind that its specifier requires"),
        None => fallback("a plugin package does not contain the specified plugin"),
    }
}

pub fn select_plugin_definitions(
    references: &PluginReferences,
    package_roots: &[&str],
    definitions: &[PluginDefinition],
) -> ConfigResult<Vec<usize>> {
    let mut selected: Vec<usize> =
        Vec::with_capacity(references.lifecycle_plugins.len() + references.tasks.len());
    for reference in references.all_plugin_references() {
        let package: usize = match package_roots
            .iter()
            .position(|root| *root == reference.package_root)
        {
            Some(package) => package,
            None => return fallback("a plugin package was not loaded"),
        };
        let definition: usize = find_plugin_definition(definitions, package, reference)?;
        if reference.kind == PluginKind::Lifecycle && selected.contains(&definition) {
            return fallback("a lifecycle plugin is specified more than once");
        }
        selected.push(definition);
    }
    for (index, definition) in selected.iter().enumerate() {
        let current: &PluginDefinition = &definitions[*definition];
        let has_other_entry_point = selected[..index].iter().any(|other| {
            let other: &PluginDefinition = &definitions[*other];
            other.plugin_name == current.plugin_name && other.entry_point != current.entry_point
        });
        if has_other_entry_point {
            return fallback(
                "multiple plugins with the same name were loaded from different paths",
            );
        }
    }
    Ok(selected)
}
