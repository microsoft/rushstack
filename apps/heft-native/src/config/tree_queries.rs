use super::tree::{ConfigTree, NodeId, NodeValue};

impl ConfigTree<'_> {
    pub fn string_value(&self, id: NodeId) -> Option<&str> {
        match &self.node(id).value {
            NodeValue::String(text) => Some(text),
            _ => None,
        }
    }

    pub fn is_object(&self, id: NodeId) -> bool {
        matches!(self.node(id).value, NodeValue::Object(_))
    }

    pub fn is_array(&self, id: NodeId) -> bool {
        matches!(self.node(id).value, NodeValue::Array(_))
    }

    pub fn is_object_or_array(&self, id: NodeId) -> bool {
        matches!(
            self.node(id).value,
            NodeValue::Object(_) | NodeValue::Array(_)
        )
    }

    pub fn is_null(&self, id: NodeId) -> bool {
        matches!(self.node(id).value, NodeValue::Null)
    }

    pub fn is_falsy(&self, id: NodeId) -> bool {
        match &self.node(id).value {
            NodeValue::Null | NodeValue::Boolean(false) => true,
            NodeValue::Number(number) => number.value == 0.0,
            NodeValue::String(text) => text.is_empty(),
            _ => false,
        }
    }
}
