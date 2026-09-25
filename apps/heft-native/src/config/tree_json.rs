use super::tree::{ConfigTree, NodeId, NodeValue};
use crate::json::{JsonObject, JsonValue};

pub fn tree_to_json_value<'text>(tree: &ConfigTree<'text>, id: NodeId) -> JsonValue<'text> {
    match &tree.node(id).value {
        NodeValue::Null => JsonValue::Null,
        NodeValue::Boolean(flag) => JsonValue::Boolean(*flag),
        NodeValue::Number(number) => JsonValue::Number(*number),
        NodeValue::String(text) => JsonValue::String(text.clone()),
        NodeValue::Array(items) => JsonValue::Array(
            items
                .iter()
                .map(|child| tree_to_json_value(tree, *child))
                .collect(),
        ),
        NodeValue::Object(entries) => {
            let mut object: JsonObject<'text> = JsonObject::with_capacity(entries.len());
            for (key, child) in entries {
                object.set_keeping_first_position(key.clone(), tree_to_json_value(tree, *child));
            }
            JsonValue::Object(object)
        }
    }
}

pub fn empty_json_object<'text>() -> JsonValue<'text> {
    JsonValue::Object(JsonObject::default())
}
