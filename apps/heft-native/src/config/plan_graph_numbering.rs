use super::tree::{AnnotationId, ConfigTree, NodeId, NodeValue, Slot};

const UNNUMBERED: u32 = u32::MAX;

pub struct CanonicalGraphNumbering {
    pub node_numbers: Vec<u32>,
    pub node_order: Vec<NodeId>,
    annotation_visited: Vec<bool>,
}

impl CanonicalGraphNumbering {
    pub fn number_graph_from_root(tree: &ConfigTree, root: NodeId) -> CanonicalGraphNumbering {
        let mut numbering: CanonicalGraphNumbering = CanonicalGraphNumbering {
            node_numbers: vec![UNNUMBERED; tree.nodes.len()],
            node_order: Vec::new(),
            annotation_visited: vec![false; tree.annotations.len()],
        };
        numbering.visit_node(tree, root);
        numbering
    }

    fn visit_slot(&mut self, tree: &ConfigTree, slot: Slot) {
        if let Slot::Node(id) = slot {
            self.visit_node(tree, id);
        }
    }

    fn visit_node(&mut self, tree: &ConfigTree, id: NodeId) {
        if !tree.is_object_or_array(id) || self.node_numbers[id as usize] != UNNUMBERED {
            return;
        }
        self.node_numbers[id as usize] = self.node_order.len() as u32;
        self.node_order.push(id);
        match &tree.node(id).value {
            NodeValue::Object(entries) => entries
                .iter()
                .for_each(|(_, child)| self.visit_node(tree, *child)),
            NodeValue::Array(items) => items.iter().for_each(|child| self.visit_node(tree, *child)),
            _ => {}
        }
        if let Some(annotation) = tree.node(id).annotation {
            self.visit_annotation(tree, annotation);
        }
    }

    fn visit_annotation(&mut self, tree: &ConfigTree, annotation: AnnotationId) {
        if self.annotation_visited[annotation as usize] {
            return;
        }
        self.annotation_visited[annotation as usize] = true;
        let annotation = &tree.annotations[annotation as usize];
        for (_, slot) in &annotation.original_values {
            self.visit_slot(tree, *slot);
        }
        if let Some(slot) = annotation.schema_property_original_value {
            self.visit_slot(tree, slot);
        }
    }
}
