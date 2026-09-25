use super::fallback::{fallback, ConfigResult};
use super::loader::LoadedHeftConfiguration;
use super::plugin_manifest::PluginKind;
use super::plugin_references::PluginReference;
use super::tree::ConfigTree;
use super::tree_json::tree_to_json_value;
use super::tree_properties::{json_property, object_members, optional_string, string_list};
use crate::json::JsonValue;

pub struct TaskModel<'a> {
    pub name: &'a str,
    pub task_dependency_names: Vec<&'a str>,
    pub plugin: usize,
    pub options: Option<JsonValue<'a>>,
}

pub struct PhaseModel<'a> {
    pub name: &'a str,
    pub description: Option<&'a str>,
    pub dependency_names: Vec<&'a str>,
    pub clean_files: Option<JsonValue<'a>>,
    pub tasks: Vec<TaskModel<'a>>,
}

pub struct AliasModel<'a> {
    pub name: &'a str,
    pub action_name: &'a str,
    pub default_parameters: Vec<&'a str>,
}

pub struct LifecyclePluginModel<'a> {
    pub plugin: usize,
    pub options: Option<JsonValue<'a>>,
}

pub struct PluginModel<'a> {
    pub kind: PluginKind,
    pub package_root: &'a str,
    pub package_name: &'a str,
    pub plugin_name: &'a str,
    pub entry_point: &'a str,
    pub parameter_scope: &'a str,
    pub parameters: &'a [JsonValue<'a>],
}

pub struct HeftConfigurationModel<'a> {
    pub build_folder_path: &'a str,
    pub phases: Vec<PhaseModel<'a>>,
    pub aliases: Vec<AliasModel<'a>>,
    pub lifecycle_plugins: Vec<LifecyclePluginModel<'a>>,
    pub plugins: Vec<PluginModel<'a>>,
    pub debug_messages: &'a [String],
}

struct PluginIndexer<'a> {
    definitions_in_order: Vec<usize>,
    loaded: &'a LoadedHeftConfiguration<'a>,
}

impl PluginIndexer<'_> {
    fn plugin_index_for_reference(&mut self, reference_index: usize) -> usize {
        let definition: usize = self.loaded.selected_definitions[reference_index];
        match self
            .definitions_in_order
            .iter()
            .position(|known| *known == definition)
        {
            Some(index) => index,
            None => {
                self.definitions_in_order.push(definition);
                self.definitions_in_order.len() - 1
            }
        }
    }
}

fn plugin_options<'a>(tree: &ConfigTree<'a>, reference: &PluginReference) -> Option<JsonValue<'a>> {
    reference
        .options
        .map(|options| tree_to_json_value(tree, options))
}

pub fn build_heft_configuration_model<'a>(
    loaded: &'a LoadedHeftConfiguration<'a>,
) -> ConfigResult<HeftConfigurationModel<'a>> {
    let tree: &'a ConfigTree<'a> = loaded.tree;
    let mut indexer: PluginIndexer = PluginIndexer {
        definitions_in_order: Vec::new(),
        loaded,
    };
    let mut lifecycle_plugins: Vec<LifecyclePluginModel<'a>> = Vec::new();
    for (index, reference) in loaded.references.lifecycle_plugins.iter().enumerate() {
        let plugin: usize = indexer.plugin_index_for_reference(index);
        lifecycle_plugins.push(LifecyclePluginModel {
            plugin,
            options: plugin_options(tree, reference),
        });
    }
    let first_task_reference: usize = loaded.references.lifecycle_plugins.len();
    let mut task_references = loaded.references.tasks.iter().enumerate();
    let mut phases: Vec<PhaseModel<'a>> = Vec::new();
    for (phase_name, phase) in object_members(tree, loaded.heft_json, "phasesByName") {
        let mut tasks: Vec<TaskModel<'a>> = Vec::new();
        for (task_name, task) in object_members(tree, phase, "tasksByName") {
            let (index, reference) = match task_references.next() {
                Some((index, reference))
                    if reference.task == task && reference.phase_name == phase_name =>
                {
                    (index, reference)
                }
                _ => return fallback("the task references do not match the normalized heft.json"),
            };
            tasks.push(TaskModel {
                name: task_name,
                task_dependency_names: string_list(tree, task, "taskDependencies")?,
                plugin: indexer.plugin_index_for_reference(first_task_reference + index),
                options: plugin_options(tree, &reference.plugin),
            });
        }
        phases.push(PhaseModel {
            name: phase_name,
            description: optional_string(tree, phase, "phaseDescription")?,
            dependency_names: string_list(tree, phase, "phaseDependencies")?,
            clean_files: json_property(tree, phase, "cleanFiles"),
            tasks,
        });
    }
    let mut aliases: Vec<AliasModel<'a>> = Vec::new();
    for (alias_name, alias) in object_members(tree, loaded.heft_json, "aliasesByName") {
        let action_name: &'a str = match optional_string(tree, alias, "actionName")? {
            Some(action_name) => action_name,
            None => return fallback("an alias has no actionName"),
        };
        aliases.push(AliasModel {
            name: alias_name,
            action_name,
            default_parameters: string_list(tree, alias, "defaultParameters")?,
        });
    }
    let plugins: Vec<PluginModel<'a>> = indexer
        .definitions_in_order
        .iter()
        .map(|definition| {
            let definition = &loaded.definitions[*definition];
            PluginModel {
                kind: definition.kind,
                package_root: &loaded.manifests[definition.package].package_root,
                package_name: &loaded.manifests[definition.package].package_name,
                plugin_name: definition.plugin_name,
                entry_point: &definition.entry_point,
                parameter_scope: definition.parameter_scope,
                parameters: definition.parameters,
            }
        })
        .collect();
    Ok(HeftConfigurationModel {
        build_folder_path: loaded.build_folder_path,
        phases,
        aliases,
        lifecycle_plugins,
        plugins,
        debug_messages: &loaded.heft_json_chain.debug_messages,
    })
}
