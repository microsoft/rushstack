use std::borrow::Cow;

use crate::json::{JsonObject, JsonValue};
use crate::regex::{compile_unicode_regex_subset, CompiledUnicodeRegex};

use super::compiled_node::{
    CompiledSchemaNode, NodeIdentifier, NodeKind, SchemaNodeUnderConstruction,
};
use super::keyword_tables::{is_object_prototype_member_name, is_vendor_extension_keyword};

pub struct CompiledJsonSchema<'schema> {
    pub(super) nodes: Vec<CompiledSchemaNode<'schema>>,
    pub(super) regexes: Vec<CompiledUnicodeRegex>,
    pub(super) root: NodeIdentifier,
}

pub(super) struct SchemaCompiler<'schema> {
    pub(super) document_root: &'schema JsonValue<'schema>,
    pub(super) is_draft_04: bool,
    pub(super) vendor_keywords: Vec<&'schema str>,
    pub(super) nodes: Vec<CompiledSchemaNode<'schema>>,
    pub(super) regex_patterns: Vec<&'schema str>,
    pub(super) regexes: Vec<CompiledUnicodeRegex>,
    pub(super) reference_nodes: Vec<(String, NodeIdentifier)>,
}

fn count_of_values_that_may_be_subschemas(value: &JsonValue<'_>) -> usize {
    match value {
        JsonValue::Object(object) => {
            1 + object
                .entries()
                .iter()
                .map(|(_, item)| count_of_values_that_may_be_subschemas(item))
                .sum::<usize>()
        }
        JsonValue::Array(items) => items
            .iter()
            .map(count_of_values_that_may_be_subschemas)
            .sum(),
        JsonValue::Boolean(_) => 1,
        _ => 0,
    }
}

fn schema_dialect_is_draft_04(root: &JsonObject<'_>) -> Option<bool> {
    match root.get("$schema") {
        None => Some(false),
        Some(JsonValue::String(uri)) => match uri.as_ref() {
            "http://json-schema.org/draft-07/schema"
            | "http://json-schema.org/draft-07/schema#" => Some(false),
            "http://json-schema.org/draft-04/schema"
            | "http://json-schema.org/draft-04/schema#" => Some(true),
            _ => None,
        },
        Some(_) => None,
    }
}

pub fn compile_json_schema_for_fast_validation<'schema>(
    schema_document: &'schema JsonValue<'schema>,
) -> Option<CompiledJsonSchema<'schema>> {
    let root_object = schema_document.as_object()?;
    let is_draft_04 = schema_dialect_is_draft_04(root_object)?;
    if root_object.contains_key("id") || root_object.contains_key("$id") {
        return None;
    }
    let vendor_keywords = root_object
        .entries()
        .iter()
        .map(|(key, _)| key.as_ref())
        .filter(|key| is_vendor_extension_keyword(key))
        .collect();
    let mut compiler = SchemaCompiler {
        document_root: schema_document,
        is_draft_04,
        vendor_keywords,
        nodes: Vec::with_capacity(count_of_values_that_may_be_subschemas(schema_document)),
        regex_patterns: Vec::new(),
        regexes: Vec::new(),
        reference_nodes: Vec::new(),
    };
    let root = compiler.compile_node(schema_document, &[], true)?;
    Some(CompiledJsonSchema {
        nodes: compiler.nodes,
        regexes: compiler.regexes,
        root,
    })
}

fn decode_json_pointer_segment(raw_segment: &str) -> Cow<'_, str> {
    if raw_segment.contains('~') {
        Cow::Owned(raw_segment.replace("~1", "/").replace("~0", "~"))
    } else {
        Cow::Borrowed(raw_segment)
    }
}

fn is_canonical_array_index(segment: &str) -> bool {
    !segment.is_empty()
        && segment.bytes().all(|byte| byte.is_ascii_digit())
        && (segment == "0" || !segment.starts_with('0'))
}

impl<'schema> SchemaCompiler<'schema> {
    pub(super) fn allocate_node(
        &mut self,
        node: SchemaNodeUnderConstruction<'schema>,
    ) -> NodeIdentifier {
        self.nodes.push(node.into_compiled_node());
        (self.nodes.len() - 1) as NodeIdentifier
    }

    pub(super) fn regex_index_for_pattern(&mut self, pattern: &'schema str) -> Option<usize> {
        if let Some(index) = self
            .regex_patterns
            .iter()
            .position(|existing| *existing == pattern)
        {
            return Some(index);
        }
        let regex = compile_unicode_regex_subset(pattern)?;
        self.regex_patterns.push(pattern);
        self.regexes.push(regex);
        Some(self.regexes.len() - 1)
    }

    pub(super) fn compile_schema_array(
        &mut self,
        value: &'schema JsonValue<'schema>,
        data_types: &[&'schema str],
    ) -> Option<Vec<NodeIdentifier>> {
        let items = value.as_array()?;
        if items.is_empty() {
            return None;
        }
        let mut identifiers = Vec::with_capacity(items.len());
        for item in items {
            identifiers.push(self.compile_node(item, data_types, false)?);
        }
        Some(identifiers)
    }

    pub(super) fn compile_reference(&mut self, reference: &str) -> Option<NodeIdentifier> {
        if let Some((_, identifier)) = self
            .reference_nodes
            .iter()
            .find(|(existing, _)| existing == reference)
        {
            return Some(*identifier);
        }
        let target = self.resolve_local_json_pointer(reference)?;
        let placeholder =
            self.allocate_node(SchemaNodeUnderConstruction::of_kind(NodeKind::Regular));
        self.reference_nodes
            .push((reference.to_owned(), placeholder));
        let compiled_target = self.compile_node(target, &[], false)?;
        self.nodes[placeholder as usize].reference = Some(compiled_target);
        Some(placeholder)
    }

    fn resolve_local_json_pointer(&self, reference: &str) -> Option<&'schema JsonValue<'schema>> {
        let pointer = reference.strip_prefix('#')?;
        if reference.contains('%') || (!pointer.is_empty() && !pointer.starts_with('/')) {
            return None;
        }
        let mut target: &'schema JsonValue<'schema> = self.document_root;
        if pointer.is_empty() {
            return Some(target);
        }
        for raw_segment in pointer[1..].split('/') {
            let segment = decode_json_pointer_segment(raw_segment);
            if is_object_prototype_member_name(&segment) {
                return None;
            }
            target = match target {
                JsonValue::Array(items) if is_canonical_array_index(&segment) => {
                    items.get(segment.parse::<usize>().ok()?)?
                }
                JsonValue::Object(object) => object.get(&segment)?,
                _ => return None,
            };
        }
        Some(target)
    }
}
