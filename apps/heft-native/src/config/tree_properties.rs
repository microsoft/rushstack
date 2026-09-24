use super::fallback::{fallback, ConfigResult};
use super::tree::{ConfigTree, NodeId, NodeValue};
use super::tree_json::tree_to_json_value;
use crate::json::JsonValue;

pub fn optional_string<'a>(
    tree: &'a ConfigTree<'a>,
    object: NodeId,
    key: &str,
) -> ConfigResult<Option<&'a str>> {
    match tree.get(object, key) {
        None => Ok(None),
        Some(value) => match tree.string_value(value) {
            Some(text) => Ok(Some(text)),
            None => fallback("a heft.json property is not a string"),
        },
    }
}

pub fn string_list<'a>(
    tree: &'a ConfigTree<'a>,
    object: NodeId,
    key: &str,
) -> ConfigResult<Vec<&'a str>> {
    let items: &[NodeId] = match tree.get(object, key).map(|list| &tree.node(list).value) {
        None => return Ok(Vec::new()),
        Some(NodeValue::Array(items)) => items,
        Some(_) => return fallback("a heft.json property is not an array"),
    };
    let mut strings: Vec<&'a str> = Vec::with_capacity(items.len());
    for item in items {
        match tree.string_value(*item) {
            Some(text) => strings.push(text),
            None => return fallback("a heft.json array item is not a string"),
        }
    }
    Ok(strings)
}

pub fn json_property<'a>(
    tree: &ConfigTree<'a>,
    object: NodeId,
    key: &str,
) -> Option<JsonValue<'a>> {
    tree.get(object, key)
        .map(|value| tree_to_json_value(tree, value))
}

pub fn object_members<'a>(
    tree: &'a ConfigTree<'a>,
    object: NodeId,
    key: &str,
) -> Vec<(&'a str, NodeId)> {
    match tree.get(object, key) {
        Some(members) => tree
            .object_entries(members)
            .iter()
            .map(|(name, child)| (name.as_ref(), *child))
            .collect(),
        None => Vec::new(),
    }
}
