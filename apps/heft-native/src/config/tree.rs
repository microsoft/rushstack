use std::borrow::Cow;

use super::fallback::{fallback, ConfigResult};
use super::javascript_order::{is_object_prototype_property_name, order_entries_like_javascript};
use crate::json::{JsonNumber, JsonObject, JsonValue};

pub type NodeId = u32;
pub type AnnotationId = u32;
pub type Entries<'text> = Vec<(Cow<'text, str>, NodeId)>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Slot {
    Undefined,
    Node(NodeId),
}

pub enum NodeValue<'text> {
    Null,
    Boolean(bool),
    Number(JsonNumber<'text>),
    String(Cow<'text, str>),
    Array(Vec<NodeId>),
    Object(Entries<'text>),
}

pub struct Annotation<'text> {
    pub configuration_file: Option<u32>,
    pub original_values: Vec<(Cow<'text, str>, Slot)>,
    pub schema_property_original_value: Option<Slot>,
}

pub struct Node<'text> {
    pub value: NodeValue<'text>,
    pub annotation: Option<AnnotationId>,
}

#[derive(Default)]
pub struct ConfigTree<'text> {
    pub nodes: Vec<Node<'text>>,
    pub annotations: Vec<Annotation<'text>>,
    pub configuration_file_paths: Vec<String>,
}

impl<'text> ConfigTree<'text> {
    pub fn add_node(
        &mut self,
        value: NodeValue<'text>,
        annotation: Option<AnnotationId>,
    ) -> NodeId {
        self.nodes.push(Node { value, annotation });
        (self.nodes.len() - 1) as NodeId
    }

    pub fn add_object(
        &mut self,
        mut entries: Entries<'text>,
        annotation: Option<AnnotationId>,
    ) -> NodeId {
        order_entries_like_javascript(&mut entries);
        self.add_node(NodeValue::Object(entries), annotation)
    }

    pub fn add_annotation(&mut self, mut annotation: Annotation<'text>) -> AnnotationId {
        order_entries_like_javascript(&mut annotation.original_values);
        self.annotations.push(annotation);
        (self.annotations.len() - 1) as AnnotationId
    }

    pub fn add_configuration_file_path(&mut self, path: &str) -> u32 {
        self.configuration_file_paths.push(path.to_string());
        (self.configuration_file_paths.len() - 1) as u32
    }

    pub fn node(&self, id: NodeId) -> &Node<'text> {
        &self.nodes[id as usize]
    }

    pub fn import_json(&mut self, value: JsonValue<'text>) -> ConfigResult<NodeId> {
        let node_value: NodeValue<'text> = match value {
            JsonValue::Null => NodeValue::Null,
            JsonValue::Boolean(flag) => NodeValue::Boolean(flag),
            JsonValue::Number(number) => NodeValue::Number(number),
            JsonValue::String(text) => NodeValue::String(text),
            JsonValue::Array(items) => {
                let mut children: Vec<NodeId> = Vec::with_capacity(items.len());
                for item in items {
                    children.push(self.import_json(item)?);
                }
                NodeValue::Array(children)
            }
            JsonValue::Object(object) => return self.import_json_object(object),
        };
        Ok(self.add_node(node_value, None))
    }

    fn import_json_object(&mut self, object: JsonObject<'text>) -> ConfigResult<NodeId> {
        let mut children: Entries<'text> = Vec::with_capacity(object.len());
        for (key, item) in object.into_entries() {
            if is_object_prototype_property_name(&key) {
                return fallback("a property name is a member of Object.prototype");
            }
            let child: NodeId = self.import_json(item)?;
            children.push((key, child));
        }
        Ok(self.add_object(children, None))
    }

    pub fn object_entries(&self, id: NodeId) -> &[(Cow<'text, str>, NodeId)] {
        match &self.node(id).value {
            NodeValue::Object(entries) => entries,
            _ => &[],
        }
    }

    pub fn own_enumerable_entries(&self, id: NodeId) -> Vec<(Cow<'text, str>, Slot)> {
        match &self.node(id).value {
            NodeValue::Object(entries) => entries
                .iter()
                .map(|(key, child)| (key.clone(), Slot::Node(*child)))
                .collect(),
            NodeValue::Array(items) => items
                .iter()
                .enumerate()
                .map(|(index, child)| (Cow::Owned(index.to_string()), Slot::Node(*child)))
                .collect(),
            _ => Vec::new(),
        }
    }

    pub fn annotate_properties(&mut self, root: NodeId, configuration_file: u32) {
        let mut queue: Vec<NodeId> = vec![root];
        let mut index: usize = 0;
        while index < queue.len() {
            let id: NodeId = queue[index];
            index += 1;
            if !self.is_object_or_array(id) {
                continue;
            }
            let original_values: Vec<(Cow<'text, str>, Slot)> = self.own_enumerable_entries(id);
            for (_, slot) in &original_values {
                if let Slot::Node(child) = slot {
                    queue.push(*child);
                }
            }
            let annotation: AnnotationId = self.add_annotation(Annotation {
                configuration_file: Some(configuration_file),
                original_values,
                schema_property_original_value: None,
            });
            self.nodes[id as usize].annotation = Some(annotation);
        }
    }

    pub fn get(&self, id: NodeId, key: &str) -> Option<NodeId> {
        self.object_entries(id)
            .iter()
            .find(|(entry_key, _)| entry_key == key)
            .map(|(_, child)| *child)
    }

    pub fn original_value(&self, id: NodeId, key: &str) -> Slot {
        let annotation: AnnotationId = match self.node(id).annotation {
            Some(annotation) => annotation,
            None => return Slot::Undefined,
        };
        let original_values = &self.annotations[annotation as usize].original_values;
        original_values
            .iter()
            .find(|(original_key, _)| original_key == key)
            .map_or(Slot::Undefined, |(_, slot)| *slot)
    }
}
