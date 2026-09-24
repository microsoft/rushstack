use std::borrow::Cow;
use std::fmt::{self, Write};

use super::plan_graph_numbering::CanonicalGraphNumbering;
use super::tree::{Annotation, ConfigTree, NodeId, NodeValue, Slot};
use crate::json::{write_json_for_javascript, write_json_string_for_javascript, JsonValue};

struct GraphWriter<'graph, 'text> {
    tree: &'graph ConfigTree<'text>,
    numbering: &'graph CanonicalGraphNumbering,
}

impl GraphWriter<'_, '_> {
    fn write_value_reference(&self, slot: Slot, out: &mut String) -> fmt::Result {
        let id: NodeId = match slot {
            Slot::Undefined => return out.write_str("{\"undefined\":true}"),
            Slot::Node(id) => id,
        };
        let primitive: JsonValue = match &self.tree.node(id).value {
            NodeValue::Object(_) | NodeValue::Array(_) => {
                return write!(
                    out,
                    "{{\"node\":{}}}",
                    self.numbering.node_numbers[id as usize]
                );
            }
            NodeValue::Null => JsonValue::Null,
            NodeValue::Boolean(flag) => JsonValue::Boolean(*flag),
            NodeValue::Number(number) => JsonValue::Number(*number),
            NodeValue::String(text) => JsonValue::String(Cow::Borrowed(text)),
        };
        out.write_str("{\"json\":")?;
        write_json_for_javascript(&primitive, out)?;
        out.write_char('}')
    }

    fn write_keyed_references<'key>(
        &self,
        entries: impl Iterator<Item = (&'key str, Slot)>,
        out: &mut String,
    ) -> fmt::Result {
        out.write_char('[')?;
        for (index, (key, slot)) in entries.enumerate() {
            out.write_str(if index == 0 { "[" } else { ",[" })?;
            write_json_string_for_javascript(key, out)?;
            out.write_char(',')?;
            self.write_value_reference(slot, out)?;
            out.write_char(']')?;
        }
        out.write_char(']')
    }

    fn write_annotation(&self, annotation: &Annotation, out: &mut String) -> fmt::Result {
        out.write_str(",\"annotation\":{\"originalValues\":")?;
        let original_values = annotation.original_values.iter();
        self.write_keyed_references(
            original_values.map(|(key, slot)| (key.as_ref(), *slot)),
            out,
        )?;
        if let Some(file) = annotation.configuration_file {
            out.write_str(",\"configurationFilePath\":")?;
            write_json_string_for_javascript(
                &self.tree.configuration_file_paths[file as usize],
                out,
            )?;
        }
        if let Some(slot) = annotation.schema_property_original_value {
            out.write_str(",\"schemaPropertyOriginalValue\":")?;
            self.write_value_reference(slot, out)?;
        }
        out.write_char('}')
    }

    fn write_node(&self, id: NodeId, out: &mut String) -> fmt::Result {
        out.write_str("{\"entries\":")?;
        match &self.tree.node(id).value {
            NodeValue::Object(entries) => {
                let references = entries
                    .iter()
                    .map(|(key, child)| (key.as_ref(), Slot::Node(*child)));
                self.write_keyed_references(references, out)?;
            }
            NodeValue::Array(items) => {
                let index_keys: Vec<String> =
                    (0..items.len()).map(|index| index.to_string()).collect();
                let references = index_keys
                    .iter()
                    .zip(items)
                    .map(|(key, child)| (key.as_str(), Slot::Node(*child)));
                self.write_keyed_references(references, out)?;
                out.write_str(",\"isArray\":true")?;
            }
            _ => {}
        }
        if let Some(annotation) = self.tree.node(id).annotation {
            self.write_annotation(&self.tree.annotations[annotation as usize], out)?;
        }
        out.write_char('}')
    }
}

pub fn write_heft_json_graph(tree: &ConfigTree, root: NodeId, out: &mut String) -> fmt::Result {
    let numbering: CanonicalGraphNumbering =
        CanonicalGraphNumbering::number_graph_from_root(tree, root);
    let writer: GraphWriter = GraphWriter {
        tree,
        numbering: &numbering,
    };
    write!(
        out,
        "{{\"rootNode\":{},\"nodes\":[",
        numbering.node_numbers[root as usize]
    )?;
    for (index, id) in numbering.node_order.iter().enumerate() {
        if index > 0 {
            out.write_char(',')?;
        }
        writer.write_node(*id, out)?;
    }
    out.write_str("]}")
}
