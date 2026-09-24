use std::borrow::Cow;

use super::fallback::{fallback, ConfigResult};
use super::tree::{ConfigTree, Entries, NodeId, NodeValue, Slot};

fn spread_object_with<'text>(
    tree: &mut ConfigTree<'text>,
    source: NodeId,
    overrides: &[(&'static str, NodeId)],
) -> NodeId {
    let annotation = tree.node(source).annotation;
    let mut entries: Entries<'text> = tree.object_entries(source).to_vec();
    for (key, value) in overrides {
        match entries.iter_mut().find(|(entry_key, _)| entry_key == key) {
            Some(entry) => entry.1 = *value,
            None => entries.push((Cow::Borrowed(*key), *value)),
        }
    }
    tree.add_object(entries, annotation)
}

fn normalize_plugin_specifier(
    tree: &mut ConfigTree,
    raw_specifier: NodeId,
) -> ConfigResult<NodeId> {
    if !tree.is_object(raw_specifier) {
        return fallback("a plugin specifier is not an object");
    }
    let package_root: NodeId = match tree.get(raw_specifier, "pluginPackage") {
        Some(package_root) => package_root,
        None => return fallback("a plugin specifier has no pluginPackage"),
    };
    let original_package_name: NodeId = match tree.original_value(raw_specifier, "pluginPackage") {
        Slot::Node(original) => original,
        Slot::Undefined => return fallback("a plugin specifier has no original pluginPackage"),
    };
    let overrides: [(&'static str, NodeId); 2] = [
        ("pluginPackageRoot", package_root),
        ("pluginPackage", original_package_name),
    ];
    Ok(spread_object_with(tree, raw_specifier, &overrides))
}

fn object_entries_or_empty<'text>(
    tree: &ConfigTree<'text>,
    parent: NodeId,
    key: &str,
) -> ConfigResult<Entries<'text>> {
    match tree.get(parent, key) {
        None => Ok(Vec::new()),
        Some(id) if tree.is_falsy(id) => Ok(Vec::new()),
        Some(id) if tree.is_object(id) => Ok(tree.object_entries(id).to_vec()),
        Some(_) => fallback("an object property has an unexpected type"),
    }
}

fn normalize_task(tree: &mut ConfigTree, task: NodeId) -> ConfigResult<NodeId> {
    if !tree.is_object(task) {
        return fallback("a task is not an object");
    }
    match tree.get(task, "taskPlugin") {
        Some(task_plugin) if !tree.is_falsy(task_plugin) => {
            let normalized_plugin: NodeId = normalize_plugin_specifier(tree, task_plugin)?;
            Ok(spread_object_with(
                tree,
                task,
                &[("taskPlugin", normalized_plugin)],
            ))
        }
        _ => Ok(task),
    }
}

fn normalize_heft_plugins(tree: &mut ConfigTree, configuration: NodeId) -> ConfigResult<NodeId> {
    let items: Vec<NodeId> = match tree
        .get(configuration, "heftPlugins")
        .map(|list| &tree.node(list).value)
    {
        None | Some(NodeValue::Null) => Vec::new(),
        Some(NodeValue::Array(items)) => items.clone(),
        Some(_) => return fallback("heftPlugins is not an array"),
    };
    let mut normalized: Vec<NodeId> = Vec::with_capacity(items.len());
    for item in items {
        normalized.push(normalize_plugin_specifier(tree, item)?);
    }
    Ok(tree.add_node(NodeValue::Array(normalized), None))
}

pub fn normalize_heft_configuration(
    tree: &mut ConfigTree,
    configuration: NodeId,
) -> ConfigResult<NodeId> {
    let heft_plugins: NodeId = normalize_heft_plugins(tree, configuration)?;
    let phases_by_name = object_entries_or_empty(tree, configuration, "phasesByName")?;
    let mut normalized_phases: Entries = Vec::with_capacity(phases_by_name.len());
    for (phase_name, phase) in phases_by_name {
        if !tree.is_object(phase) {
            return fallback("a phase is not an object");
        }
        let tasks_by_name = object_entries_or_empty(tree, phase, "tasksByName")?;
        let mut normalized_tasks: Entries = Vec::with_capacity(tasks_by_name.len());
        for (task_name, task) in tasks_by_name {
            let normalized_task: NodeId = normalize_task(tree, task)?;
            normalized_tasks.push((task_name, normalized_task));
        }
        let tasks_node: NodeId = tree.add_object(normalized_tasks, None);
        let normalized_phase: NodeId =
            spread_object_with(tree, phase, &[("tasksByName", tasks_node)]);
        normalized_phases.push((phase_name, normalized_phase));
    }
    let phases_node: NodeId = tree.add_object(normalized_phases, None);
    Ok(spread_object_with(
        tree,
        configuration,
        &[("heftPlugins", heft_plugins), ("phasesByName", phases_node)],
    ))
}
