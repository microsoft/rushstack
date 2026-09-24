use std::borrow::Cow;

use super::fallback::{fallback, ConfigResult};
use super::tree::{Annotation, AnnotationId, ConfigTree, NodeId, NodeValue, Slot};

fn array_items(tree: &ConfigTree, id: NodeId) -> ConfigResult<Vec<NodeId>> {
    match &tree.node(id).value {
        NodeValue::Array(items) => Ok(items.clone()),
        _ => fallback("append on a non-array"),
    }
}

fn annotation_of(tree: &ConfigTree, id: NodeId) -> ConfigResult<AnnotationId> {
    match tree.node(id).annotation {
        Some(annotation) => Ok(annotation),
        None => fallback("an appended array has no annotation"),
    }
}

pub fn append_arrays(
    tree: &mut ConfigTree,
    parent_array: NodeId,
    current_array: NodeId,
) -> ConfigResult<NodeId> {
    let mut items: Vec<NodeId> = array_items(tree, parent_array)?;
    items.extend(array_items(tree, current_array)?);
    let parent_annotation: AnnotationId = annotation_of(tree, parent_array)?;
    let current_annotation: AnnotationId = annotation_of(tree, current_array)?;
    let mut original_values: Vec<(Cow<str>, Slot)> = tree.annotations[parent_annotation as usize]
        .original_values
        .clone();
    for (key, slot) in tree.annotations[current_annotation as usize]
        .original_values
        .clone()
    {
        match original_values
            .iter_mut()
            .find(|(existing_key, _)| *existing_key == key)
        {
            Some(existing) => existing.1 = slot,
            None => original_values.push((key, slot)),
        }
    }
    let annotation: AnnotationId = tree.add_annotation(Annotation {
        configuration_file: None,
        original_values,
        schema_property_original_value: None,
    });
    Ok(tree.add_node(NodeValue::Array(items), Some(annotation)))
}
