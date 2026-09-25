use std::borrow::Cow;

use super::fallback::{fallback, ConfigResult};
use super::merge_arrays::append_arrays;
use super::tree::{Annotation, ConfigTree, Entries, NodeId, Slot};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum InheritanceType {
    Append,
    Merge,
    Replace,
}

#[derive(Clone, Copy)]
pub struct MergeOptions<'options> {
    pub configuration_file: u32,
    pub default_array_inheritance: InheritanceType,
    pub default_object_inheritance: InheritanceType,
    pub ignored_property_names: &'options [&'options str],
}

fn inheritance_annotation_target(property_name: &str) -> Option<&str> {
    let target: &str = property_name
        .strip_prefix('$')?
        .strip_suffix(".inheritanceType")?;
    if target.is_empty() || target.contains('.') {
        None
    } else {
        Some(target)
    }
}

fn find_entry(entries: &[(Cow<'_, str>, NodeId)], key: &str) -> Option<NodeId> {
    entries
        .iter()
        .find(|(entry_key, _)| entry_key == key)
        .map(|(_, child)| *child)
}

fn parse_inheritance_type(raw: &str) -> Option<InheritanceType> {
    match raw.to_ascii_lowercase().as_str() {
        "append" => Some(InheritanceType::Append),
        "merge" => Some(InheritanceType::Merge),
        "replace" => Some(InheritanceType::Replace),
        _ => None,
    }
}

fn collect_merged_names_and_inheritance_types<'text>(
    tree: &ConfigTree<'text>,
    current_entries: &[(Cow<'text, str>, NodeId)],
    ignored_property_names: &[&str],
    merged_names: &mut Vec<Cow<'text, str>>,
) -> ConfigResult<Vec<(String, InheritanceType)>> {
    let mut inheritance_types: Vec<(String, InheritanceType)> = Vec::new();
    for (property_name, value) in current_entries {
        if ignored_property_names.contains(&property_name.as_ref()) {
            continue;
        }
        let target: &str = match inheritance_annotation_target(property_name) {
            Some(target) => target,
            None => {
                if !merged_names.iter().any(|name| name == property_name) {
                    merged_names.push(property_name.clone());
                }
                continue;
            }
        };
        let target_value: NodeId = match find_entry(current_entries, target) {
            Some(target_value) => target_value,
            None => return fallback("an inheritance type has no matching property"),
        };
        if !tree.is_object_or_array(target_value) && !tree.is_null(target_value) {
            return fallback("an inheritance type is set on a primitive");
        }
        let inheritance_type: InheritanceType =
            match tree.string_value(*value).and_then(parse_inheritance_type) {
                Some(inheritance_type) => inheritance_type,
                None => return fallback("an unsupported inheritance type"),
            };
        inheritance_types.retain(|(name, _)| name != target);
        inheritance_types.push((target.to_string(), inheritance_type));
    }
    Ok(inheritance_types)
}

pub fn merge_objects<'text>(
    tree: &mut ConfigTree<'text>,
    parent: Option<NodeId>,
    current: NodeId,
    options: MergeOptions,
) -> ConfigResult<NodeId> {
    let current_entries: Entries<'text> = tree.object_entries(current).to_vec();
    let parent_entries: Entries<'text> =
        parent.map_or_else(Vec::new, |id| tree.object_entries(id).to_vec());
    let mut merged_names: Vec<Cow<'text, str>> = parent_entries
        .iter()
        .map(|(name, _)| name.clone())
        .collect();
    let inheritance_types: Vec<(String, InheritanceType)> =
        collect_merged_names_and_inheritance_types(
            tree,
            &current_entries,
            options.ignored_property_names,
            &mut merged_names,
        )?;
    let mut result_entries: Entries<'text> = Vec::with_capacity(merged_names.len());
    let mut original_values: Vec<(Cow<'text, str>, Slot)> = Vec::with_capacity(merged_names.len());
    for property_name in merged_names {
        let current_value: Option<NodeId> = find_entry(&current_entries, &property_name);
        let parent_value: Option<NodeId> = find_entry(&parent_entries, &property_name);
        let parent_original = |tree: &ConfigTree<'text>| match parent {
            Some(parent) => tree.original_value(parent, &property_name),
            None => Slot::Undefined,
        };
        match (current_value, parent_value) {
            (Some(value), parent_value) if tree.is_null(value) => {
                if parent_value.is_some() {
                    original_values.push((property_name.clone(), parent_original(tree)));
                }
            }
            (Some(value), None) => {
                original_values.push((
                    property_name.clone(),
                    tree.original_value(current, &property_name),
                ));
                result_entries.push((property_name, value));
            }
            (None, Some(parent_value)) => {
                original_values.push((property_name.clone(), parent_original(tree)));
                result_entries.push((property_name, parent_value));
            }
            (Some(value), Some(parent_value)) => {
                let configured: Option<InheritanceType> = inheritance_types
                    .iter()
                    .find(|(name, _)| *name == property_name)
                    .map(|(_, kind)| *kind);
                let inheritance_type: InheritanceType = configured.unwrap_or_else(|| {
                    default_inheritance_type(tree, value, parent_value, &options)
                });
                let new_value: NodeId = match inheritance_type {
                    InheritanceType::Replace => {
                        original_values.push((
                            property_name.clone(),
                            tree.original_value(current, &property_name),
                        ));
                        value
                    }
                    InheritanceType::Append => append_arrays(tree, parent_value, value)?,
                    InheritanceType::Merge => {
                        merge_nested_objects(tree, parent_value, value, &options)?
                    }
                };
                result_entries.push((property_name, new_value));
            }
            (None, None) => {}
        }
    }
    let annotation = tree.add_annotation(Annotation {
        configuration_file: Some(options.configuration_file),
        original_values,
        schema_property_original_value: None,
    });
    Ok(tree.add_object(result_entries, Some(annotation)))
}

fn default_inheritance_type(
    tree: &ConfigTree,
    value: NodeId,
    parent_value: NodeId,
    options: &MergeOptions,
) -> InheritanceType {
    if tree.is_array(value) && tree.is_array(parent_value) {
        options.default_array_inheritance
    } else if tree.is_object_or_array(value) && tree.is_object_or_array(parent_value) {
        options.default_object_inheritance
    } else {
        InheritanceType::Replace
    }
}

fn merge_nested_objects(
    tree: &mut ConfigTree,
    parent_value: NodeId,
    value: NodeId,
    options: &MergeOptions,
) -> ConfigResult<NodeId> {
    if !tree.is_object(value) || !tree.is_object(parent_value) {
        return fallback("merge on a non-object");
    }
    let nested_options: MergeOptions = MergeOptions {
        ignored_property_names: &[],
        ..*options
    };
    merge_objects(tree, Some(parent_value), value, nested_options)
}
