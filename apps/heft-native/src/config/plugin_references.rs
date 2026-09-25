use super::fallback::{fallback, ConfigResult};
use super::plugin_manifest::PluginKind;
use super::tree::{ConfigTree, NodeId, NodeValue};

pub struct PluginReference<'tree> {
    pub kind: PluginKind,
    pub specifier: NodeId,
    pub package_root: &'tree str,
    pub package_name: &'tree str,
    pub plugin_name: Option<&'tree str>,
    pub options: Option<NodeId>,
}

pub struct TaskReference<'tree> {
    pub phase_name: &'tree str,
    pub task_name: &'tree str,
    pub task: NodeId,
    pub plugin: PluginReference<'tree>,
}

pub struct PluginReferences<'tree> {
    pub lifecycle_plugins: Vec<PluginReference<'tree>>,
    pub tasks: Vec<TaskReference<'tree>>,
}

fn required_string<'tree>(
    tree: &'tree ConfigTree,
    object: NodeId,
    key: &str,
) -> ConfigResult<&'tree str> {
    match tree
        .get(object, key)
        .and_then(|value| tree.string_value(value))
    {
        Some(text) => Ok(text),
        None => fallback("a plugin specifier field is not a string"),
    }
}

fn plugin_reference<'tree>(
    tree: &'tree ConfigTree,
    kind: PluginKind,
    specifier: NodeId,
) -> ConfigResult<PluginReference<'tree>> {
    let plugin_name: Option<&'tree str> = match tree.get(specifier, "pluginName") {
        None => None,
        Some(name) if tree.is_falsy(name) => None,
        Some(name) => match tree.string_value(name) {
            Some(name) => Some(name),
            None => return fallback("a pluginName is not a string"),
        },
    };
    Ok(PluginReference {
        kind,
        specifier,
        package_root: required_string(tree, specifier, "pluginPackageRoot")?,
        package_name: required_string(tree, specifier, "pluginPackage")?,
        plugin_name,
        options: tree.get(specifier, "options"),
    })
}

fn object_members<'tree>(
    tree: &'tree ConfigTree,
    object: NodeId,
    key: &str,
) -> ConfigResult<Vec<(&'tree str, NodeId)>> {
    match tree.get(object, key) {
        Some(members) if tree.is_object(members) => Ok(tree
            .object_entries(members)
            .iter()
            .map(|(name, child)| (name.as_ref(), *child))
            .collect()),
        _ => fallback("a normalized heft.json member is not an object"),
    }
}

pub fn collect_plugin_references<'tree>(
    tree: &'tree ConfigTree,
    configuration: NodeId,
) -> ConfigResult<PluginReferences<'tree>> {
    let lifecycle_specifiers: Vec<NodeId> = match tree
        .get(configuration, "heftPlugins")
        .map(|list| &tree.node(list).value)
    {
        Some(NodeValue::Array(items)) => items.clone(),
        _ => return fallback("normalized heftPlugins is not an array"),
    };
    let mut references: PluginReferences = PluginReferences {
        lifecycle_plugins: Vec::new(),
        tasks: Vec::new(),
    };
    for specifier in lifecycle_specifiers {
        references.lifecycle_plugins.push(plugin_reference(
            tree,
            PluginKind::Lifecycle,
            specifier,
        )?);
    }
    for (phase_name, phase) in object_members(tree, configuration, "phasesByName")? {
        if phase_name == "lifecycle" {
            return fallback("the phase name lifecycle is reserved");
        }
        for (task_name, task) in object_members(tree, phase, "tasksByName")? {
            if task_name == "clean" {
                return fallback("the task name clean is reserved");
            }
            let task_plugin: NodeId = match tree.get(task, "taskPlugin") {
                Some(task_plugin) if !tree.is_falsy(task_plugin) && tree.is_object(task_plugin) => {
                    task_plugin
                }
                _ => return fallback("a task has no task plugin"),
            };
            let plugin: PluginReference = plugin_reference(tree, PluginKind::Task, task_plugin)?;
            references.tasks.push(TaskReference {
                phase_name,
                task_name,
                task,
                plugin,
            });
        }
    }
    Ok(references)
}

impl<'tree> PluginReferences<'tree> {
    pub fn all_plugin_references(&self) -> impl Iterator<Item = &PluginReference<'tree>> {
        self.lifecycle_plugins
            .iter()
            .chain(self.tasks.iter().map(|task| &task.plugin))
    }
}
